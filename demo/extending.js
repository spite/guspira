// Building controls the toolkit doesn't ship. `createRow` gives you a row and a controller;
// `bind` registers an effect the row owns; `onDestroy` registers cleanup. Between them a
// custom control is a first-class one: it lines up, it disables, it randomizes, and it takes
// itself apart properly.

import GUI, { Controller, Section, Tab } from "../src/gui.js";
import { signal, toSignal, isSignal } from "../src/reactive.js";
import { snap, formatFloat, precision } from "../src/format.js";
import { randomInRange, randomElement, randomHexColor, randomBool } from "../src/random.js";
import { logger, readout, stamp } from "./shell.js";

const log = logger("#log");
const show = readout("#state");

// --- a three-number vector control ---------------------------------------------------
// Added to the prototype so it reads like the built-ins; a plain function taking the gui
// would work just as well.
GUI.prototype.addVector = function (label, value, opts = {}) {
  const sig = toSignal(value); // accepts a signal or a bare value
  const { min = -10, max = 10, step = 0.1 } = opts;

  // createRow builds the row, the label, and wires `disabled` / `visibleWhen` for you.
  const controller = this.createRow(label, opts);

  // .gui-control puts this in the same column as every built-in control's widget — and
  // brings the min-width: 0 that lets it shrink to that column instead of overflowing it.
  const wrap = document.createElement("div");
  wrap.className = "gui-control";
  wrap.style.cssText = "display:flex;gap:4px";

  const inputs = ["x", "y", "z"].map((axis, i) => {
    const input = document.createElement("input");
    input.type = "number";
    input.className = "gui-input-number";
    input.title = axis;
    input.step = step;
    input.style.cssText = "flex:1 1 0;min-width:0";
    input.oninput = () => {
      const next = [...sig.peek()];
      next[i] = snap(parseFloat(input.value) || 0, step, min, max);
      sig.set(next);
      opts.onChange && opts.onChange(next);
    };
    wrap.append(input);
    return input;
  });

  // bind() is an effect owned by this row — destroy() stops it, so a removed row stops
  // listening to its signal instead of being kept alive by the subscription.
  controller.bind(() => {
    const v = sig();
    inputs.forEach((input, i) => {
      if (document.activeElement !== input) input.value = formatFloat(v[i], step);
    });
  });

  // Clicking the label rerolls it, exactly like a built-in control.
  this._randomizable(
    controller,
    () => sig.set([0, 1, 2].map(() => snap(randomInRange(min, max), step, min, max))),
    opts
  );

  controller.row.append(wrap);
  controller.el = wrap;
  controller.signal = sig;
  return controller;
};

// --- an XY pad, which needs listeners cleaned up ---------------------------------------
GUI.prototype.addPad = function (label, value, opts = {}) {
  const sig = toSignal(value);
  const controller = this.createRow(label, opts);

  const pad = document.createElement("div");
  pad.className = "gui-control";
  pad.style.cssText =
    "position:relative;height:90px;background:var(--gui-field-bg);" +
    "border:1px solid var(--gui-border);border-radius:var(--gui-radius);cursor:crosshair";
  const dot = document.createElement("div");
  dot.style.cssText =
    "position:absolute;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:var(--gui-thumb);pointer-events:none";
  pad.append(dot);

  const write = (e) => {
    const r = pad.getBoundingClientRect();
    sig.set([
      Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * 100) / 100,
      Math.round(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) * 100) / 100,
    ]);
  };
  const move = (e) => dragging && write(e);
  const up = () => (dragging = false);
  let dragging = false;

  pad.addEventListener("pointerdown", (e) => {
    if (controller.row.classList.contains("disabled")) return;
    dragging = true;
    write(e);
  });
  addEventListener("pointermove", move);
  addEventListener("pointerup", up);

  // Listeners on window outlive the row unless something removes them. onDestroy is where
  // that goes — it runs with the row's effects when destroy() is called.
  controller.onDestroy(() => {
    removeEventListener("pointermove", move);
    removeEventListener("pointerup", up);
    log(`${stamp()} the pad's window listeners were removed with its row`);
  });

  controller.bind(() => {
    const [x, y] = sig();
    dot.style.left = `${x * 100}%`;
    dot.style.top = `${y * 100}%`;
  });

  this._randomizable(controller, () => sig.set([Math.random(), Math.random()].map((v) => Math.round(v * 100) / 100)), opts);

  controller.row.append(pad);
  controller.el = pad;
  controller.signal = sig;
  return controller;
};

// --- a panel using them ------------------------------------------------------------------
const state = {
  position: signal([0, 1.5, -2]),
  rotation: signal([0, 0, 0]),
  aim: signal([0.5, 0.5]),
  locked: signal(false),
  tint: signal("#ffb347"),
  shape: signal("box"),
};

const gui = new GUI("Extending", document.querySelector("#gui-container"));

const transform = gui.addSection("Transform");
gui.addCheckbox("Lock", state.locked);
gui.addVector("Position", state.position, { disabled: () => state.locked() });
gui.addVector("Rotation", state.rotation, { min: -180, max: 180, step: 1, disabled: () => state.locked() });
gui.addPad("Aim", state.aim, { disabled: () => state.locked() });

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
gui.addButton("Destroy the pad", () => {
  const pad = gui._controllers.find((c) => c.labelEl && c.labelEl.textContent === "Aim");
  if (pad) pad.destroy();
});
gui.addButton("Fold the Transform section", () => transform.setOpen(!transform.open()));

// --- what the panel is made of ---------------------------------------------------------------
function render() {
  show({
    position: state.position(),
    rotation: state.rotation(),
    aim: state.aim(),
    tint: state.tint(),
    shape: state.shape(),
    locked: state.locked(),
    "— types —": "",
    "addVector returns a Controller": gui._controllers.some((c) => c instanceof Controller),
    "addSection returns a Section": transform instanceof Section,
    "a Section is a Controller": transform instanceof Controller,
    "no tabs on this panel": !gui._controllers.some((c) => c instanceof Tab),
    "toSignal(4) is a signal": isSignal(toSignal(4)),
    "toSignal passes signals through": toSignal(state.aim) === state.aim,
    "precision(0.1) decimals": precision(0.1),
  });
}

gui._controllers.forEach((c) => c.signal && c.bind(render));
render();
log(`${stamp()} ready — the vector and pad rows are built from createRow + bind + onDestroy`);
