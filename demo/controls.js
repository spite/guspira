// Every control the panel ships, once each. The readout is rendered from the same signals
// the controls are bound to — there is no separate copy of the state to synchronise.

import GUI from "../src/gui.js";
import { signal, effect } from "../src/reactive.js";
import { logger, readout, stamp } from "./shell.js";

const log = logger("#log");
const show = readout("#state");

const state = {
  slider: signal(0.4),
  range: signal([0.25, 0.75]),
  checkbox: signal(true),
  select: signal("cool"),
  pairs: signal("b"),
  numbers: signal(2), // a list of numbers stays numbers
  colour: signal("#ffb347"),
  text: signal("guspira"),
  number: signal(1337),
};

// A signal the app writes and the panel only displays.
const clock = signal(0);
setInterval(() => clock.set(performance.now() / 1000), 100);

const gui = new GUI("All controls", document.querySelector("#gui-container"));

gui.addText("Bound controls — each writes a signal.");
gui.addSlider("Slider", state.slider, 0, 1, 0.01, { onChange: (v) => log(`${stamp()} slider → ${v}`) });
gui.addRangeSlider("Range slider", state.range, 0, 1, 0.05);
gui.addCheckbox("Checkbox", state.checkbox);
gui.addSelect("Select", state.select, ["warm", "cool", "mono"]);
gui.addSelect("Select (labels)", state.pairs, [["a", "First"], ["b", "Second"], ["c", "Third"]]);
gui.addSelect("Select (numbers)", state.numbers, [1, 2, 3]);
gui.addColor("Colour", state.colour);
gui.addTextInput("Text", state.text, { placeholder: "type here" });
gui.addNumber("Number", state.number, { min: 0, max: 9999, step: 1 });

gui.addSeparator();
gui.addText("Read-only and actions.");
gui.addMonitor("Monitor", clock, { format: (v) => `${v.toFixed(2)} s` });
gui.addButton("Button", () => log(`${stamp()} button clicked`));
gui.addFileButton("File button", (file) => log(`${stamp()} picked ${file.name} (${file.size} bytes)`), {
  accept: "image/*,.json",
});
gui.addRandomizeButton("Randomize the lot", () => log(`${stamp()} rerolled`));

gui.addSeparator();
gui.addLabel("addLabel — a bare label row");
gui.addText('addText — free-form <b>HTML</b>, useful for a <a href="./">legend or a link</a>.');

// addElement wraps anything at all in a row, so it lines up with the rest.
const swatch = document.createElement("div");
swatch.style.cssText = "flex:0 0 auto;width:60px;height:16px;border-radius:3px";
effect(() => (swatch.style.background = state.colour()));
gui.addElement(swatch, { label: "addElement" });

// One effect renders the whole readout: it subscribes to every signal it reads.
effect(() => {
  show({
    slider: state.slider(),
    range: state.range(),
    checkbox: state.checkbox(),
    select: state.select(),
    pairs: state.pairs(),
    numbers: `${state.numbers()} (${typeof state.numbers()})`,
    colour: state.colour(),
    text: state.text(),
    number: state.number(),
  });
});

log(`${stamp()} ready — every row above is bound to a signal`);
