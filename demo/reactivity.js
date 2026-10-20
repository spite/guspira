// The signals layer, with every effect run counted. src/reactive.js has no imports and no
// DOM dependency — the panel here is just a convenient way to poke it.

import GUI from "../src/gui.js";
import {
  signal, computed, effect, effectRAF, batch, untrack, tweened, easings,
} from "../src/reactive.js";
import { logger, readout, stamp } from "./shell.js";

const log = logger("#log");
const show = readout("#state");

const width = signal(4);
const height = signal(3);
const label = signal("box");

// A computed re-derives itself when anything it read changes, and only notifies its own
// readers when the result actually differs.
const area = computed(() => width() * height());
const ratio = computed(() => Math.round((width() / height()) * 100) / 100);

// Declared before the effects below: effectRAF runs its function immediately, and that
// function reads the tween through render().
const fade = tweened(1, 600, easings.cubicOut);

let plainRuns = 0;
let untrackedRuns = 0;
let rafRuns = 0;
let lazyRuns = 0;

// A plain effect: runs now, and again on every change to anything it read.
effect(() => {
  width();
  height();
  plainRuns++;
});

// untrack reads without subscribing — this one only re-runs for `label`.
effect(() => {
  label();
  untrack(() => width() + height());
  untrackedRuns++;
});

// effectRAF coalesces a burst of changes into one run per frame.
const scheduled = effectRAF(() => {
  width();
  height();
  rafRuns++;
  render();
});

const gui = new GUI("Reactivity", document.querySelector("#gui-container"));

gui.addSection("Signals");
gui.addSlider("width", width, 1, 10, 1);
gui.addSlider("height", height, 1, 10, 1);
gui.addTextInput("label", label);

gui.addSection("batch()");
gui.addButton("Write three signals", () => {
  const before = plainRuns;
  width.set(1 + Math.floor(Math.random() * 9));
  height.set(1 + Math.floor(Math.random() * 9));
  label.set(`box-${Math.floor(Math.random() * 100)}`);
  log(`${stamp()} unbatched → the effect ran ${plainRuns - before}×`);
  render();
});
gui.addButton("…the same, batched", () => {
  const before = plainRuns;
  // Every effect triggered inside runs once, after the block finishes.
  batch(() => {
    width.set(1 + Math.floor(Math.random() * 9));
    height.set(1 + Math.floor(Math.random() * 9));
    label.set(`box-${Math.floor(Math.random() * 100)}`);
  });
  log(`${stamp()} batched → the effect ran ${plainRuns - before}×`);
  render();
});

gui.addSection("effectRAF()");
const paused = signal(false);
gui.addCheckbox("Paused", paused, {
  onChange: (v) => {
    // A paused effect notes that it went dirty and runs once on resume.
    if (v) scheduled.pause();
    else scheduled.resume();
    log(`${stamp()} rAF effect ${v ? "paused" : "resumed"}`);
    render();
  },
});
gui.addButton("Burst 50 writes", () => {
  const before = rafRuns;
  for (let i = 0; i < 50; i++) width.set(1 + (i % 9));
  log(`${stamp()} 50 writes queued — rAF runs so far: ${rafRuns - before}`);
  requestAnimationFrame(() => {
    log(`${stamp()} …after the frame: ${rafRuns - before} run(s)`);
    render();
  });
});

gui.addSection("lazy effects");
// { lazy: true } creates the effect without running it — for work that should start later
// but subscribe to whatever it reads the first time it does run.
const lazy = effect(() => {
  width();
  lazyRuns++;
  log(`${stamp()} lazy effect run ${lazyRuns} (now subscribed to width)`);
}, { lazy: true });
gui.addButton("Run the lazy effect", () => {
  lazy.run();
  render();
});
gui.addButton("Stop it", () => {
  lazy.stop();
  log(`${stamp()} lazy effect stopped — width no longer wakes it`);
});

gui.addSection("teardown & ownership");
// An effect that returns a function is handing back its teardown: it runs before the next
// run and on stop, so the timer below can never be left running or started twice.
const ticking = signal(false);
const ticks = signal(0);
effect(() => {
  if (!ticking()) return;
  const id = setInterval(() => ticks.update((n) => n + 1), 250);
  log(`${stamp()} timer started`);
  return () => {
    clearInterval(id);
    log(`${stamp()} teardown ran — timer cleared`);
  };
});
gui.addCheckbox("Run a timer", ticking);
gui.addMonitor("ticks", ticks);

// An effect created inside another belongs to it. Switching the branch off disposes the
// child, so `height` stops waking it — nothing has to keep a handle and stop it by hand.
const branch = signal(false);
const childRuns = signal(0);
effect(() => {
  if (!branch()) return;
  effect(() => {
    height();
    childRuns.set(childRuns.peek() + 1);
  });
});
gui.addCheckbox("Build a child effect", branch);
gui.addMonitor("child runs (reads height)", childRuns);

gui.addSection("tweened()");
gui.addText(
  "A signal whose value travels to where you set it instead of jumping. Reading it gives the " +
    "value on its way, <code>.target()</code> gives the destination — " +
    '<a href="./easing.html">its own demo covers it</a>.'
);
gui.addMonitor("fade", fade, { format: (v) => v.toFixed(3) });
gui.addButtons(null, [
  { label: "Tween to 0", onClick: () => fade.set(0) },
  { label: "Tween to 1", onClick: () => fade.set(1) },
]);

function render() {
  show({
    width: width.peek(),
    height: height.peek(),
    label: label.peek(),
    "computed area": area.peek(),
    "computed ratio": ratio.peek(),
    "tweened fade": Math.round(fade.peek() * 1000) / 1000,
    "— effect runs —": "",
    "plain effect": plainRuns,
    "untracked effect (label only)": untrackedRuns,
    "rAF effect": rafRuns,
    "lazy effect": lazyRuns,
  });
}

render();
log(`${stamp()} ready — try the two batch buttons back to back`);
