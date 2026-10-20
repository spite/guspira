// Building controls the toolkit doesn't ship. `createRow` gives you a row and a controller;
// `bind` registers an effect the row owns; `onDestroy` registers cleanup. Between them a
// custom control is a first-class one: it lines up, it disables, it randomizes, and it takes
// itself apart properly.
//
// The two here were chosen for what they need. The dial needs pointer capture and keyboard
// handling; the graph runs a frame loop, which has to be cancelled when the row goes away or
// it keeps drawing into a canvas nobody can see.

import GUI, { Controller, Section, Tab } from "../src/gui.js";
import { signal, effect, toSignal, isSignal } from "../src/reactive.js";
import { snap, formatFloat, precision } from "../src/format.js";
import { randomInRange, randomElement, randomHexColor, randomBool } from "../src/random.js";
import { logger, readout, stamp } from "./shell.js";

const log = logger("#log");
const show = readout("#state");

// --- an angle dial ---------------------------------------------------------------------
// Added to the prototype so it reads like the built-ins; a plain function taking the gui
// would work just as well.
GUI.prototype.addDial = function (label, value, opts = {}) {
  const sig = toSignal(value); // accepts a signal or a bare value
  const { min = -180, max = 180, step = 1 } = opts;

  // createRow builds the row, the label, and wires `disabled` / `visibleWhen` for you.
  const controller = this.createRow(label, opts);

  // .gui-control puts this in the same column as every built-in control's widget — and
  // brings the min-width: 0 that lets it shrink to that column instead of overflowing it.
  const wrap = document.createElement("div");
  wrap.className = "gui-control";
  wrap.style.cssText = "display:flex;align-items:center;gap:8px";

  const dial = document.createElement("div");
  dial.tabIndex = 0;
  dial.setAttribute("role", "slider");
  controller.labelled(dial); // named after the row's label, as the built-in controls are
  dial.style.cssText =
    "position:relative;width:34px;height:34px;flex:0 0 auto;border-radius:50%;cursor:grab;" +
    "background:var(--gui-field-bg);border:1px solid var(--gui-border)";
  const needle = document.createElement("div");
  needle.style.cssText =
    "position:absolute;left:50%;top:50%;width:2px;height:13px;margin-left:-1px;" +
    "transform-origin:50% 0;background:var(--gui-fill);border-radius:1px";
  dial.append(needle);

  const readable = document.createElement("span");
  readable.className = "gui-monitor";

  const commit = (degrees) => {
    const next = snap(degrees, step, min, max);
    sig.set(next);
    opts.onChange && opts.onChange(next);
  };

  const angleFrom = (e) => {
    const box = dial.getBoundingClientRect();
    const dx = e.clientX - (box.left + box.width / 2);
    const dy = e.clientY - (box.top + box.height / 2);
    return (Math.atan2(dx, -dy) * 180) / Math.PI;
  };

  const enabled = () => !controller.row.classList.contains("disabled");

  // Pointer capture rather than window listeners: the drag keeps arriving here after it
  // leaves the dial, and there is nothing global left behind to unregister.
  dial.addEventListener("pointerdown", (e) => {
    if (!enabled()) return;
    dial.setPointerCapture(e.pointerId);
    dial.style.cursor = "grabbing";
    commit(angleFrom(e));
  });
  dial.addEventListener("pointermove", (e) => {
    if (dial.hasPointerCapture(e.pointerId)) commit(angleFrom(e));
  });
  const release = (e) => {
    if (dial.hasPointerCapture(e.pointerId)) dial.releasePointerCapture(e.pointerId);
    dial.style.cursor = "grab";
  };
  dial.addEventListener("pointerup", release);
  dial.addEventListener("pointercancel", release);

  dial.addEventListener("keydown", (e) => {
    const direction = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
    if (!direction || !enabled()) return;
    e.preventDefault();
    commit(sig.peek() + direction * step * (e.shiftKey ? 10 : 1));
  });

  // bind() is an effect owned by this row — destroy() stops it, so a removed row stops
  // listening to its signal instead of being kept alive by the subscription.
  controller.bind(() => {
    const degrees = sig();
    needle.style.transform = `rotate(${degrees}deg)`;
    readable.textContent = `${formatFloat(degrees, step, min)}°`;
    dial.setAttribute("aria-valuenow", String(degrees));
  });

  // Assigning `randomize` is all it takes: the label, Alt+R and randomizeAll() all read it.
  if (opts.randomizable !== false) controller.randomize = () => commit(randomInRange(min, max));

  wrap.append(dial, readable);
  controller.row.append(wrap);
  controller.el = dial;
  controller.signal = sig;
  return controller;
};

// --- a graph, which runs a loop that has to be stopped -----------------------------------
// The shape any live monitor takes — an fps counter, a meter, rstats — is this one.
GUI.prototype.addSparkline = function (label, value, opts = {}) {
  const sig = toSignal(value);
  const { min = 0, max = 1, samples = 96 } = opts;
  const controller = this.createRow(label, opts);

  const canvas = document.createElement("canvas");
  canvas.className = "gui-control";
  canvas.style.cssText =
    "height:38px;background:var(--gui-field-bg);border:1px solid var(--gui-border);" +
    "border-radius:var(--gui-radius)";
  const ctx = canvas.getContext("2d");
  const history = new Array(samples).fill(0);

  const draw = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    if (canvas.width !== Math.round(width * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.beginPath();
    history.forEach((v, i) => {
      const x = (i / (history.length - 1)) * width;
      const y = height - ((v - min) / (max - min || 1)) * height;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue("--gui-fill") || "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  };

  // Sampling on a timer rather than in an effect: a graph wants a reading per tick even when
  // the value is holding still, which is the opposite of what an effect gives you.
  let frame = requestAnimationFrame(function tick() {
    history.push(sig.peek());
    history.shift();
    draw();
    frame = requestAnimationFrame(tick);
  });

  // The loop outlives the row unless something stops it. onDestroy is where that goes — it
  // runs with the row's effects when destroy() is called.
  controller.onDestroy(() => {
    cancelAnimationFrame(frame);
    log(`${stamp()} the graph's frame loop was cancelled with its row`);
  });

  controller.row.append(canvas);
  controller.el = canvas;
  controller.signal = sig;
  return controller;
};

// --- a panel using them ------------------------------------------------------------------
const state = {
  heading: signal(35),
  tilt: signal(-12),
  locked: signal(false),
  tint: signal("#ffb347"),
  shape: signal("box"),
};

// Something for the graph to watch that moves on its own.
const wave = signal(0.5);
setInterval(() => wave.set(0.5 + 0.45 * Math.sin(performance.now() / 700)), 1000 / 30);

const gui = new GUI("Extending", document.querySelector("#gui-container"));

const heading = gui.addSection("Custom rows");
gui.addCheckbox("Lock", state.locked);
const headingDial = gui.addDial("Heading", state.heading, { disabled: () => state.locked() });
gui.addDial("Tilt", state.tilt, { min: -90, max: 90, disabled: () => state.locked() });
const graph = gui.addSparkline("Wave", wave);

gui.addSection("Random helpers");
gui.addColor("Tint", state.tint);
gui.addSelect("Shape", state.shape, ["box", "sphere", "ribbon"]);
gui.addButton("Roll with the helpers directly", () => {
  // The same source the panel's own rerolls use, so a seeded run stays reproducible.
  state.tint.set(randomHexColor());
  state.shape.set(randomElement(["box", "sphere", "ribbon"]));
  state.locked.set(randomBool(0.2));
  log(`${stamp()} randomElement / randomHexColor / randomBool`);
});
gui.addButton("randomizeAll()", () => {
  gui.randomizeAll(); // every randomizable control in the panel, custom ones included
  log(`${stamp()} gui.randomizeAll()`);
});

gui.addSection("Controller escape hatches");
const target = gui.addSlider("A normal slider", signal(0.5), 0, 1, 0.01);
gui.addButton("setDisabled(true) for a second", () => {
  target.setDisabled(true);
  setTimeout(() => target.setDisabled(false), 1000);
});
gui.addButton("Destroy the graph", () => graph.destroy());
gui.addButton("Fold the custom rows", () => heading.setOpen(!heading.open()));

// --- what the panel is made of ---------------------------------------------------------------
function render() {
  show({
    heading: state.heading(),
    tilt: state.tilt(),
    tint: state.tint(),
    shape: state.shape(),
    locked: state.locked(),
    "— types —": "",
    "addDial returns a Controller": headingDial instanceof Controller,
    "addSection returns a Section": heading instanceof Section,
    "a Section is a Controller": heading instanceof Controller,
    "…and not a Tab": !(heading instanceof Tab),
    "toSignal(4) is a signal": isSignal(toSignal(4)),
    "toSignal passes signals through": toSignal(state.heading) === state.heading,
    "precision(0.1) decimals": precision(0.1),
  });
}

// One effect for the readout: it reads every signal above, so any of them moving redraws it.
effect(render);
log(`${stamp()} ready — the dial and graph rows are built from createRow + bind + onDestroy`);
