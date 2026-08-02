// The slider element on its own — no panel, no signals. Importing the module registers
// <range-slider>; everything below is plain DOM and the FormData API.

import RangeSlider from "../src/range-slider.js";
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
