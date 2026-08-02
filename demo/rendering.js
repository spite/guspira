// Two ways to drive a canvas from the same signals.
//
//   continuous  the traditional loop: draw every frame whether or not anything changed
//   on demand   draw() is an effect on a scheduler the loop flushes — nothing changed,
//               nothing drawn
//
// The second is what effectRAF gestures at, done properly: the work is queued, and the
// sketch chooses the moment inside its own frame when the queue runs.

import GUI from "../src/gui.js";
import { signal, effect, createScheduler, microtask } from "../src/reactive.js";
import { readout, highlight } from "./shell.js";

const show = readout("#state");
const canvas = document.querySelector("#canvas");
const ctx = canvas.getContext("2d");

const params = {
  count: signal(24),
  radius: signal(0.62),
  dotSize: signal(9),
  hue: signal(28),
  spin: signal(0),
  animate: signal(false),
  mode: signal("on demand"),
};

// Animation is just another signal. Reading it inside the render effect is what makes
// "animating" and "reacting to a parameter" the same mechanism.
const time = signal(0);

let width = 0;
let height = 0;
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  invalidate();
}
addEventListener("resize", resize);

let draws = 0;
let frames = 0;
let effectRuns = 0;

function draw() {
  draws++;
  ctx.clearRect(0, 0, width, height);

  const n = params.count();
  const spin = params.spin() + (params.animate() ? time() * 0.4 : 0);
  const r = Math.min(width, height) * 0.5 * params.radius();
  const size = params.dotSize();
  const hue = params.hue();

  ctx.save();
  ctx.translate(width / 2, height / 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + spin;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    ctx.fillStyle = `hsl(${(hue + (i / n) * 90) % 360}, 80%, ${45 + 25 * Math.sin(a)}%)`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// --- the render effect ------------------------------------------------------------------
// A queue the sketch owns. Nothing here books its own animation frame; the loop below
// decides when queued work runs, which keeps it in a defined order relative to the draw.
const renderQueue = createScheduler();

const render = effect(() => {
  effectRuns++;
  // Reading the parameters here is the subscription. Whatever this touches is what makes
  // the sketch dirty later — no dependency list to maintain by hand.
  draw();
}, { scheduler: renderQueue });

// For anything the effect cannot see (a canvas resize), mark it dirty by hand.
function invalidate() {
  render.run();
}

// --- the loop -----------------------------------------------------------------------------
function loop(t) {
  requestAnimationFrame(loop);
  frames++;

  // Driving the clock is the only thing the loop does unconditionally. When Animate is off
  // nothing reads `time`, so writing it wakes nobody.
  if (params.animate.peek()) time.set(t / 1000);

  if (params.mode.peek() === "continuous") {
    // The traditional shape: draw every frame, changed or not.
    renderQueue.clear();
    draw();
  } else {
    // On demand: pending reactive work happens here, and only if there is any.
    renderQueue.flush();
  }
}
requestAnimationFrame(loop);

// --- panel ----------------------------------------------------------------------------------
const gui = new GUI("Rendering", document.querySelector("#gui-container"));

gui.addSection("Mode");
gui.addSelect("Draw", params.mode, ["on demand", "continuous"], {
  onChange: () => invalidate(),
});
gui.addCheckbox("Animate", params.animate, { onChange: () => invalidate() });

gui.addSection("Ring");
gui.addSlider("Count", params.count, 3, 120, 1);
gui.addSlider("Radius", params.radius, 0.1, 1, 0.01);
gui.addSlider("Dot size", params.dotSize, 2, 24, 1);
gui.addSlider("Hue", params.hue, 0, 360, 1);
gui.addSlider("Spin", params.spin, 0, 6.28, 0.01);

gui.addSection("Queue");
gui.addButton("Pause the render queue", () => {
  renderQueue.pause();
  invalidateNote("queue paused — changes pile up unrun");
});
gui.addButton("Resume it", () => {
  renderQueue.resume(); // whatever piled up runs once, now
  invalidateNote("queue resumed — the backlog ran as a single pass");
});
gui.addButton("Force a redraw", () => invalidate());

let note = "";
function invalidateNote(text) {
  note = text;
}

// The other ready-made queue: flushes at the end of the current turn rather than on a
// frame. Right for work that should coalesce but not wait for the display. Declared after
// `note` above — an effect runs the moment it is created, so anything it touches must exist.
let microRuns = 0;
effect(() => {
  params.count();
  params.hue();
  microRuns++;
  invalidateNote(`microtask effect has run ${microRuns}×`);
}, { scheduler: microtask });

// --- counters -------------------------------------------------------------------------------
let lastSample = performance.now();
let lastDraws = 0;
let lastFrames = 0;
let lastRuns = 0;

setInterval(() => {
  const t = performance.now();
  const seconds = (t - lastSample) / 1000;
  const perSecond = (n) => Math.round(n / seconds);

  show({
    mode: params.mode.peek(),
    animating: params.animate.peek(),
    "frames / s": perSecond(frames - lastFrames),
    "draws / s": perSecond(draws - lastDraws),
    "effect runs / s": perSecond(effectRuns - lastRuns),
    "queue length": renderQueue.size,
    "queue paused": renderQueue.paused,
    note,
  });

  lastSample = t;
  lastDraws = draws;
  lastFrames = frames;
  lastRuns = effectRuns;
}, 500);

document.querySelector("#code").textContent = `const renderQueue = createScheduler();

const render = effect(() => {
  draw();                       // reading params here is the subscription
}, { scheduler: renderQueue });

function loop(t) {
  requestAnimationFrame(loop);
  if (animating) time.set(t / 1000);
  renderQueue.flush();          // queued work runs here — and only if there is any
}`;
highlight(document.querySelector("#code"));

resize();
