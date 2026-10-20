// The slider element on its own — no panel, no signals. Importing the module registers
// <range-slider>; everything below is plain DOM and the FormData API.

import "../src/range-slider.js";
import { valueToCurve } from "../src/curve.js";
import { logger, readout, stamp } from "./shell.js";

const log = logger("#log");
const show = readout("#state");
const form = document.querySelector("#form");

// It is form-associated, so the browser collects its value like any built-in input.
const render = () => show(Object.fromEntries(new FormData(form)));

form.addEventListener("input", (e) => {
  render();
  log(`${stamp()} input — ${e.target.name} = ${e.target.value}`);
});

form.addEventListener("change", (e) => {
  log(`${stamp()} change — ${e.target.name} settled at ${e.target.value}`);
});

render();

// The properties work too: value is a number, or a [min, max] pair in dual mode.
const dual = form.elements.dual || document.querySelector('range-slider[name="dual"]');
const buttons = document.createElement("div");
buttons.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";
buttons.innerHTML = `
  <button type="button" data-set="10,40">dual.value = [10, 40]</button>
  <button type="button" data-set="0,100">dual.value = [0, 100]</button>
  <button type="button" data-step="1">dual.step = 1</button>
  <button type="button" data-step="5">dual.step = 5</button>
  <button type="button" data-disable="1">toggle disabled</button>
`;
buttons.querySelectorAll("button").forEach((b) => {
  b.style.cssText =
    "background:#1c1c24;border:1px solid #2e2e38;color:#e6e6ee;padding:6px 10px;border-radius:5px;cursor:pointer;font:inherit;font-size:12px";
});
form.after(buttons);

buttons.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.set) {
    dual.value = b.dataset.set.split(",").map(Number);
    log(`${stamp()} set dual.value = [${b.dataset.set}]`);
  } else if (b.dataset.step) {
    dual.step = Number(b.dataset.step);
    log(`${stamp()} set dual.step = ${b.dataset.step}`);
  } else if (b.dataset.disable) {
    dual.toggleAttribute("disabled");
    log(`${stamp()} dual is now ${dual.hasAttribute("disabled") ? "disabled" : "enabled"}`);
  }
  render();
});

log(`${stamp()} ready — tab into a slider and use the arrow keys`);


// --- track curves ---------------------------------------------------------------------------
// Three tracks over one range. The marks are drawn with the same function that positions the
// thumb, so the strip under each slider is literally where that track puts those numbers: on
// the linear one 100 Hz and 1 kHz are both crushed against the left end, and on the log one the
// three marks are evenly spaced, because each is ten times the last.

const MIN = 20;
const MAX = 20000;
const MARKS = [100, 1000, 10000];
const TRACKS = [
  { curve: 1, label: "no curve", note: "linear" },
  { curve: 2, label: 'curve="2"', note: "exponent on the position" },
  { curve: "log", label: 'curve="log"', note: "equal width per decade" },
];

const curves = document.querySelector("#curves");
const sliders = [];

for (const track of TRACKS) {
  const row = document.createElement("div");
  row.className = "curve-row";

  const head = document.createElement("div");
  head.className = "curve-head";
  const value = document.createElement("b");
  head.innerHTML = `<span><code>${track.label}</code> — ${track.note}</span>`;
  head.append(value);

  const slider = document.createElement("range-slider");
  slider.min = MIN;
  slider.max = MAX;
  slider.step = 1;
  if (track.curve !== 1) slider.curve = track.curve;
  slider.value = 632;

  const scale = document.createElement("div");
  scale.className = "curve-scale";
  for (const mark of MARKS) {
    const tick = document.createElement("span");
    tick.style.left = `${valueToCurve(mark, MIN, MAX, track.curve) * 100}%`;
    tick.textContent = mark >= 1000 ? `${mark / 1000}k` : mark;
    scale.append(tick);
  }

  const show = () => (value.textContent = `${Math.round(slider.value)} Hz`);
  show();
  slider.addEventListener("input", () => {
    show();
    // Every track holds the same value, so the difference on screen is the track alone.
    for (const other of sliders) if (other !== slider) other.value = slider.value;
    sliders.forEach((s) => s._show());
  });
  slider._show = show;

  row.append(head, slider, scale);
  curves.append(row);
  sliders.push(slider);
}
