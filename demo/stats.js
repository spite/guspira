// Measuring a sketch while it runs. `createStats` makes counters that are signals; the panel
// graphs them. Turn the load up and watch the frame budget go.

import GUI from "../src/gui.js";
import { signal, effect } from "../src/reactive.js";
import { createStats } from "../src/stats.js";
import { readout, highlightAll } from "./shell.js";

const show = readout("#state");
const canvas = document.querySelector("#canvas");
const ctx = canvas.getContext("2d");

const params = {
  particles: signal(1200),
  blur: signal(true),
  extraWork: signal(0),
  paused: signal(false),
};

// --- the counters ---------------------------------------------------------------------------
const stats = createStats();
const fps = stats.fps();
const frame = stats.timer("frame");          // the whole loop
// …and the phases inside it. Each is a band in the stacked graph, and the graph takes their
// names from the counters themselves.
const move = stats.timer("move");
const bounce = stats.timer("bounce");
const clear = stats.timer("clear");
const paint = stats.timer("paint");
const drawn = stats.counter("drawn");
// Averaged, because a per-frame millisecond figure is unreadable as text — the graph beside it
// keeps the spikes.
const frameAvg = stats.timer("frame avg", { average: 250 });

const gui = new GUI("Stats", document.querySelector("#gui-container"), { width: 300 });

gui.addSection("Budget");
// 16.7ms is one frame at 60Hz. The dashed line is drawn at `over`, so "are we over budget" is
// a glance rather than a sum.
// Paused, the graphs hold: the spike you stopped to look at is the first thing a scrolling
// flat line would erase.
const heldWhilePaused = { pausedWhen: () => params.paused() };
const frameGraph = gui.addGraph("Frame", frame, {
  min: 0,
  format: (v) => `${v.toFixed(1)} ms`,
  ...heldWhilePaused,
});
// No ceiling: it scales to what it sees, rather than off the top of a scale assuming 60Hz.
const fpsGraph = gui.addGraph("FPS", fps, { min: 0, format: (v) => v.toFixed(0), ...heldWhilePaused });

gui.addSection("Where it goes");
// Several signals means a stacked graph: the total and its breakdown in one picture.
const breakdownGraph = gui.addGraph("Breakdown", [move, bounce, clear, paint], {
  // Without this the legend takes the counters' own names. They are fine, but a label written
  // for a person can read better than the identifier the code uses.
  series: ["Move", "Bounce", "Clear", "Paint"],
  format: (v) => `${v.toFixed(1)} ms`,
  ...heldWhilePaused,
});
// `stacked` on a single counter draws columns instead of a line — a coarser read, which suits
// a shorter history. `samples` is how many are kept, `interval` how often the number beside it
// is refreshed.
gui.addGraph("Paint only", paint, {
  ...heldWhilePaused,
  stacked: true,
  samples: 48,
  interval: 200,
  over: 8,
  format: (v) => `${v.toFixed(1)} ms`,
});
// A readout takes the same budget a graph does: past it, the number says so.
gui.addMonitor("Particles drawn", drawn, { over: 8000, format: (v) => v.toFixed(0) });
gui.addMonitor("Frame (250ms avg)", frameAvg, { format: (v) => `${v.toFixed(2)} ms` });


// A frame's budget is one refresh, and not every screen refreshes sixty times a second — on a
// 240Hz display the budget is 4.2ms and a graph topping out at 70fps is a solid block. So the
// thresholds are set once, from the rate actually measured, rather than assumed here.
const REFRESH_RATES = [30, 50, 60, 75, 90, 100, 120, 144, 165, 240, 360];
let budgetKnown = false;
effect(() => {
  const rate = fps();
  if (budgetKnown || rate < 20) return;
  budgetKnown = true;
  const hz = REFRESH_RATES.reduce((best, r) => (Math.abs(r - rate) < Math.abs(best - rate) ? r : best));
  frameGraph.el.over = 1000 / hz;
  breakdownGraph.el.over = 1000 / hz;
  fpsGraph.el.below = hz * 0.9;
});

gui.addSection("Load");
gui.addSlider("Particles", params.particles, 0, 20000, 100, { curve: 2 });
gui.addSlider("Extra work per frame", params.extraWork, 0, 40, 1, {
  title: "Busy-waits this many milliseconds, to blow the budget on purpose",
});
gui.addCheckbox("Motion blur", params.blur);
gui.addCheckbox("Paused", params.paused);

// --- the sketch -----------------------------------------------------------------------------
let points = [];
const rebuild = (count) => {
  points = Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random(),
    vx: (Math.random() - 0.5) * 0.004,
    vy: (Math.random() - 0.5) * 0.004,
    hue: 20 + Math.random() * 40,
  }));
};
effect(() => rebuild(Math.round(params.particles())));

let width = 0;
let height = 0;
const resize = () => {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
};
resize();
addEventListener("resize", resize);

function loop() {
  frame.start();

  move.start();
  if (!params.paused.peek()) {
    for (const p of points) {
      p.x += p.vx;
      p.y += p.vy;
    }
  }
  move.end();

  bounce.start();
  if (!params.paused.peek()) {
    for (const p of points) {
      if (p.x < 0 || p.x > 1) p.vx *= -1;
      if (p.y < 0 || p.y > 1) p.vy *= -1;
    }
  }
  // Somewhere to put deliberate load, so the budget can be blown without waiting for a big
  // enough particle count.
  const busy = params.extraWork.peek();
  if (busy > 0) {
    const until = performance.now() + busy;
    while (performance.now() < until) {
      /* burn */
    }
  }
  bounce.end();

  clear.start();
  ctx.globalCompositeOperation = "source-over";
  if (params.blur.peek()) {
    ctx.fillStyle = "rgba(13, 13, 18, 0.18)";
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0d0d12";
    ctx.fillRect(0, 0, width, height);
  }
  clear.end();

  paint.start();
  drawn.clear();
  for (const p of points) {
    ctx.fillStyle = `hsl(${p.hue} 90% 60% / 0.75)`;
    ctx.fillRect(p.x * width, p.y * height, 1.6, 1.6);
    drawn.add(1);
  }
  paint.end();

  frame.end();
  frameAvg.tick(); // end-then-start: the gap between frames, not the work inside one
  fps.tick();

  // One batched write for every counter, so a frame of measuring costs one pass of effects.
  stats.flush();

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

effect(() =>
  show({
    fps: Math.round(fps()),
    "frame ms": +frame().toFixed(2),
    "move ms": +move().toFixed(2),
    "bounce ms": +bounce().toFixed(2),
    "clear ms": +clear().toFixed(2),
    "paint ms": +paint().toFixed(2),
    drawn: drawn(),
    "over budget": frame() > 16.7,
  })
);

document.querySelector("#code").textContent = `const stats = createStats();
const fps      = stats.fps();
const frame    = stats.timer("frame");
const move     = stats.timer("move");
const paint    = stats.timer("paint");

// a counter is a signal, so it goes straight into a control — and the graph takes the band
// names from the counters, so a stacked graph labels itself
gui.addGraph("Frame", frame, { min: 0, over: 16.7 });
gui.addGraph("Breakdown", [move, bounce, clear, paint], { over: 16.7 });

function loop() {
  frame.start();
  move.start();  step();   move.end();
  paint.start(); render(); paint.end();
  frame.end();
  fps.tick();
  stats.flush();          // one batched write per frame
  requestAnimationFrame(loop);
}`;
highlightAll();
