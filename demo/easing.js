// Values that travel. A tween is a signal you can hand to a control like any other — the
// panel writes and shows where you put it, your code reads where it currently is.
//
// The canvas draws both readings at once: the curve the value is following, and two tracks
// showing the target sitting still while the value chases it.

import GUI from "../src/gui.js";
import { signal, tweened, effect, easings } from "../src/reactive.js";
import { mixColors } from "../src/color.js";
import { readout } from "./shell.js";

const show = readout("#state");
const canvas = document.querySelector("#canvas");
const ctx = canvas.getContext("2d");

// --- the whole example --------------------------------------------------------------------
const position = tweened(0.25, 700, easings.cubicOut);
const tint = tweened("#ffb347", 700, easings.cubicOut, mixColors);

const gui = new GUI("Easing", document.querySelector("#gui-container"));

gui.addSection("A value that travels");
gui.addSlider("Position", position, 0, 1, 0.01, {
  title: "The thumb goes where you put it; the dot below takes its time",
});
gui.addColor("Colour", tint);
// -------------------------------------------------------------------------------------------

// Two effects on the same tween, to make the difference visible rather than argued: one reads
// the destination, one reads the value.
let targetRuns = 0;
let valueRuns = 0;
effect(() => {
  position.target();
  targetRuns++;
});
effect(() => {
  position();
  valueRuns++;
});

// The demo tracks progress itself — the tween does not publish it, and this is the only place
// that wants it.
let startedAt = 0;
let travelling = false;
effect(() => {
  position.target();
  startedAt = performance.now();
  travelling = true;
});

const curveName = signal("cubicOut");
const duration = signal(700);

gui.addSection("How it travels");
gui.addSelect("Easing", curveName, Object.keys(easings), {
  onChange: (name) => {
    position.easing = easings[name];
    tint.easing = easings[name];
  },
});
gui.addSlider("Duration (ms)", duration, 0, 2000, 50, {
  onChange: (ms) => {
    position.duration = ms;
    tint.duration = ms;
  },
});

gui.addSection("Send it somewhere");
gui.addButtons(null, [
  { label: "0", onClick: () => position.set(0) },
  { label: "0.5", onClick: () => position.set(0.5) },
  { label: "1", onClick: () => position.set(1) },
]);
gui.addButtons(null, [
  { label: "Ember", onClick: () => tint.set("#ff8a3d") },
  { label: "Ice", onClick: () => tint.set("#7fd4ff") },
  { label: "Violet", onClick: () => tint.set("#b06cff") },
]);
gui.addButton("Jump, don't travel", () => {
  // reset() moves without animating — the same value, no journey
  position.reset(Math.round(Math.random() * 100) / 100);
});

gui.addSection("Readings");
gui.addMonitor("target", position.target, { format: (v) => v.toFixed(2) });
gui.addMonitor("value", position, { format: (v) => v.toFixed(3) });

// --- drawing --------------------------------------------------------------------------------

let w = 0;
let h = 0;
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  w = canvas.clientWidth;
  h = canvas.clientHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener("resize", resize);

// The canvas paints its own pixels, so it cannot inherit the theme from CSS — it reads the
// page's own colours at draw time and repaints when the toggle says they changed.
const ink = (alpha) => {
  const fg = getComputedStyle(canvas).color;
  return fg.startsWith("rgb(") ? fg.replace("rgb(", "rgba(").replace(")", `, ${alpha})`) : fg;
};

const PAD = 34;
const curveTop = () => PAD;
const curveBottom = () => h * 0.68;

// The curve is drawn over -0.25..1.25 so the two curves that overshoot show it.
const curveY = (v) => {
  const top = curveTop();
  const bottom = curveBottom();
  return bottom - ((v + 0.25) / 1.5) * (bottom - top);
};

function draw() {
  ctx.clearRect(0, 0, w, h);
  const left = PAD;
  const right = w - PAD;
  const ease = easings[curveName.peek()];

  // grid at 0 and 1
  ctx.strokeStyle = ink(0.14);
  ctx.lineWidth = 1;
  for (const v of [0, 1]) {
    ctx.beginPath();
    ctx.moveTo(left, curveY(v));
    ctx.lineTo(right, curveY(v));
    ctx.stroke();
  }

  ctx.fillStyle = ink(0.45);
  ctx.font = "11px ui-monospace, monospace";
  ctx.fillText("1", left - 14, curveY(1) + 4);
  ctx.fillText("0", left - 14, curveY(0) + 4);
  ctx.fillText("time →", right - 46, curveBottom() + 18);

  // the curve
  ctx.strokeStyle = ink(0.6);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 120; i++) {
    const t = i / 120;
    const x = left + t * (right - left);
    const y = curveY(ease(t));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // where along it we are
  const ms = Math.max(1, duration.peek());
  const t = travelling ? Math.min((performance.now() - startedAt) / ms, 1) : 1;
  if (t >= 1) travelling = false;

  const colour = tint();
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(left + t * (right - left), curveY(ease(t)), 5, 0, Math.PI * 2);
  ctx.fill();

  // the two tracks: the target sits still, the value chases it
  const trackY = h - PAD - 26;
  const valueY = h - PAD;
  const at = (v) => left + Math.max(0, Math.min(1, v)) * (right - left);

  ctx.strokeStyle = ink(0.14);
  for (const y of [trackY, valueY]) {
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }

  ctx.fillStyle = ink(0.5);
  ctx.fillText("target", left - 4, trackY - 10);
  ctx.fillText("value", left - 4, valueY - 10);

  // target: a tick
  ctx.strokeStyle = ink(0.8);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(at(position.target()), trackY - 7);
  ctx.lineTo(at(position.target()), trackY + 7);
  ctx.stroke();

  // value: a dot, in the colour that is also travelling
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(at(position()), valueY, 7, 0, Math.PI * 2);
  ctx.fill();
}

// The render is an effect: it reads the tweens, so it re-runs on every frame of a journey and
// not at all when nothing is moving.
effect(() => {
  position();
  tint();
  curveName();
  duration();
  draw();
});

// The progress marker keeps moving between value changes, so it needs its own frames.
function tick() {
  requestAnimationFrame(tick);
  if (travelling) draw();
}

effect(() => {
  show({
    target: position.target(),
    value: Math.round(position() * 1000) / 1000,
    colour: tint(),
    "— effect runs —": "",
    "reading .target()": targetRuns - 1,
    "reading the value": valueRuns - 1,
  });
});

addEventListener("guspira:theme", () => draw());

resize();
requestAnimationFrame(tick);
