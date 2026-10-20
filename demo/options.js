// The trailing options object: onChange, disabled, visibleWhen, title, randomizable.
// disabled and visibleWhen are reactive predicates — written once, they keep holding.

import GUI from "../src/gui.js";
import { signal, effect } from "../src/reactive.js";
import { logger, readout, stamp } from "./shell.js";

const log = logger("#log");
const show = readout("#state");

const mode = signal("auto");
const exposure = signal(1);
const iso = signal(400);
const shutter = signal(125);
const locked = signal(false);
const seed = signal(1);

const isAuto = () => mode() === "auto";

const gui = new GUI("Options", document.querySelector("#gui-container"));

gui.addSelect("Mode", mode, ["auto", "manual"], {
  // onChange runs on user input, after the signal is already set.
  onChange: (v) => log(`${stamp()} onChange: mode → ${v}`),
});

// `randomizable: false` keeps a control out of label-click and panel-wide rerolls — for
// values that are not a matter of taste. A reroll that could flip this one would lock the
// panel at random.
gui.addCheckbox("Lock everything", locked, {
  randomizable: false,
  onChange: (v) => log(`${stamp()} onChange: locked → ${v}`),
});

// `disabled` greys the row out and stops it responding, and re-evaluates on every change
// of anything it reads — here two independent signals.
gui.addSlider("Exposure", exposure, 0, 4, 0.05, {
  onChange: (v) => log(`${stamp()} onChange: exposure → ${v}`),
  disabled: () => locked(),
  title: "Always available unless locked",
});

// `disabledWhen` and `visibleWhen` are the predicate spellings; `disabled` and `visible`
// take a plain boolean for a state that never changes. Either name accepts either kind.
// ISO is a ratio, so the track is one: `curve: "log"` gives every doubling the same width,
// where a linear track would bunch everything under 800 into the first tenth of it.
gui.addSlider("ISO", iso, 50, 6400, 50, {
  curve: "log",
  disabledWhen: () => locked() || isAuto(),
  title: "curve: \"log\" — equal distance per stop",
});
gui.addSlider("Always off", signal(1), 0, 2, 0.1, {
  disabled: true, // a constant, not a rule
  title: "disabled: true — no predicate needed",
});
// `visible` is the same idea for presence: a constant where `visibleWhen` takes a rule. It
// suits something decided once at load — here a debug row that only exists with ?debug in
// the address, kept as one line rather than a branch around it.
const DEBUG = new URLSearchParams(location.search).has("debug");
gui.addMonitor("Debug: raw ISO", iso, { visible: DEBUG });
// A graph takes the same pair as `paused` / `pausedWhen`. Locked, this one holds its history
// and dims instead of scrolling a flat line over what you stopped to look at.
gui.addGraph("Exposure history", exposure, { pausedWhen: () => locked(), min: 0, max: 4 });

// `visibleWhen` removes the row entirely rather than dimming it.
gui.addSection("Manual settings", { visibleWhen: () => mode() === "manual" });
gui.addSlider("Shutter (1/x)", shutter, 15, 4000, 5, { disabled: () => locked() });
gui.addText("This whole section is behind <code>visibleWhen</code>.");

gui.endSection();
gui.addSeparator();

// `scrub: false` takes away drag-to-change, for a value that should only ever be typed.
gui.addNumber("Seed", seed, { scrub: false, title: "scrub: false — typed, never dragged" });
gui.addRandomizeButton("Randomize", () => log(`${stamp()} rerolled (the lock left alone)`));

// Programmatic writes move the widgets but are not user input, so onChange does not fire.
gui.addButton("Set from code", () => {
  log(`${stamp()} writing signals directly — expect no onChange below`);
  exposure.set(2.5);
  iso.set(1600);
  mode.set("manual");
});

effect(() => {
  show({
    mode: mode(),
    locked: locked(),
    exposure: exposure(),
    iso: iso(),
    shutter: `1/${shutter()}`,
    seed: seed(),
    "ISO row disabled": locked() || isAuto(),
    "manual section visible": mode() === "manual",
    "exposure graph held": locked(),
    "debug row shown (?debug)": DEBUG,
  });
});

log(`${stamp()} ready`);
