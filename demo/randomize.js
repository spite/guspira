// Randomizing and key bindings. Every reroll goes through the random source, so pointing
// that at a seeded generator makes a reroll reproducible.

import GUI from "../src/gui.js";
import { signal, effect } from "../src/reactive.js";
import { setRandomSource, randomInRange } from "../src/random.js";
import { bindKey } from "../src/keyboard.js";
import { logger, readout, stamp } from "./shell.js";

const log = logger("#log");
const show = readout("#state");

// A tiny deterministic generator (mulberry32) standing in for seedrandom and friends.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seed = signal(1337);
const seeded = signal(false);
const name = signal("untitled");

const values = {
  count: signal(400),
  spin: signal(0.5),
  shape: signal("box"),
  glow: signal(true),
  tint: signal("#ffb347"),
  spread: signal([0.3, 0.7]),
  detail: signal(12),
};

// Swapping the source is one call. `onBeforeRandomize` below reseeds it before every roll,
// which is what makes the same seed produce the same roll every time.
function applySource() {
  if (seeded()) setRandomSource(mulberry32(seed()));
  else setRandomSource(Math.random);
}

const gui = new GUI("Randomize", document.querySelector("#gui-container"), {
  // Runs before any reroll — a label click, the button, or the key binding.
  onBeforeRandomize: () => {
    applySource();
    log(`${stamp()} rolling with ${seeded() ? `seed ${seed()}` : "Math.random"}`);
  },
});

gui.addSection("Source");
gui.addCheckbox("Seeded", seeded, {
  randomizable: false,
  onChange: applySource,
  title: "Swap Math.random for a deterministic generator",
});
// Number and text fields are never rerolled, so these two need no opting out.
gui.addNumber("Seed", seed, { onChange: applySource });
gui.addTextInput("Name", name, {
  title: "Focus this and press R — the binding ignores keys while you type",
});

gui.addSection("Randomizable");
gui.addText("Click any <b>label</b> below to reroll just that control.");
// By default a randomize button rerolls the whole panel, wherever it sits.
gui.addRandomizeButton("Randomize (R)", () => log(`${stamp()} …and the callback ran`));
// scope: "following" narrows it to the controls added after it — useful when something
// above the button should be left alone.
gui.addRandomizeButton("Randomize only what follows", () => log(`${stamp()} scoped reroll`), {
  scope: "following",
  key: null, // no key binding for this one
});
gui.addSlider("Count", values.count, 100, 2000, 100);
gui.addSlider("Spin", values.spin, 0, 1, 0.01);
gui.addSelect("Shape", values.shape, ["box", "sphere", "ribbon"]);
gui.addCheckbox("Glow", values.glow);
gui.addColor("Tint", values.tint);
gui.addRangeSlider("Spread", values.spread, 0, 1, 0.05);

// A control's roll is its `randomize`, and replacing it narrows what a reroll can land on
// without narrowing what the slider can be dragged to. Every route — the label, Alt+R, the
// button above — goes through the property, so they cannot drift apart. Setting it to null
// is the late equivalent of `randomizable: false`.
const detail = gui.addSlider("Detail", values.detail, 0, 64, 1, {
  title: "Drag anywhere 0–64; a reroll only ever lands between 8 and 16",
});
detail.randomize = () => values.detail.set(Math.round(randomInRange(8, 16)));

// bindKey guards the things these always need: no firing while a field has focus, and a
// bare letter does not collide with Ctrl/Cmd combos.
bindKey("KeyS", () => {
  seeded.set(!seeded());
  applySource();
  log(`${stamp()} S → seeded ${seeded()}`);
});
// Modifiers have to match exactly, so Shift+D is its own binding and a bare D does nothing.
// bindKey hands back its own undo; this one uses it after the first press.
const unbindShiftD = bindKey(
  "KeyD",
  () => {
    log(`${stamp()} Shift+D — heard once, and unbound itself`);
    unbindShiftD();
  },
  { shift: true }
);
bindKey("KeyC", () => log(`${stamp()} C — and Ctrl+C still copies, because modifiers must match`));
// A held key fires its binding once. `repeat: true` lets it keep firing, which suits a nudge.
bindKey(
  "BracketRight",
  () => values.spin.set(Math.min(1, Math.round((values.spin() + 0.01) * 100) / 100)),
  { repeat: true }
);

effect(() => {
  show({
    source: seeded() ? `mulberry32(${seed()})` : "Math.random",
    count: values.count(),
    spin: values.spin(),
    shape: values.shape(),
    glow: values.glow(),
    tint: values.tint(),
    spread: values.spread(),
    detail: values.detail(),
  });
});

applySource();
log(`${stamp()} ready — press R to reroll, S to toggle the seeded source`);
