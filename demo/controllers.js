// Controllers: the handle every add* returns. This panel builds and dismantles itself.

import GUI from "../src/gui.js";
import { signal, effect } from "../src/reactive.js";
import { logger, readout, stamp } from "./shell.js";

const log = logger("#log");
const show = readout("#state");

const gui = new GUI("Controllers", document.querySelector("#gui-container"));

// --- a row that is added and removed at runtime --------------------------------------
const layersSection = gui.addSection("Layers");
const layers = [];
// The list itself is a plain array, so adding and removing bump this for the readout to see.
const changed = signal(0);

const addLayer = () => {
  const opacity = signal(Math.round(Math.random() * 100) / 100);
  const n = layers.length + 1;
  // The handle is the only thing needed to take the row away again later.
  // gui.into() puts the row in the Layers section, however long ago that section stopped
  // being the one being built into.
  const controller = gui.into(layersSection, () => gui.addSlider(`Layer ${n}`, opacity, 0, 1, 0.01));
  layers.push(controller);
  log(`${stamp()} added Layer ${n}`);
  changed.update((v) => v + 1);
};

const removeLayer = () => {
  const controller = layers.pop();
  if (!controller) return;
  // destroy() stops the row's effects before removing it. Without that the row stays
  // subscribed to its signal, and the subscription keeps the detached row alive.
  controller.destroy();
  log(`${stamp()} destroyed a layer — its effects stopped too`);
  changed.update((v) => v + 1);
};

gui.addButton("Add layer", addLayer);
gui.addButton("Remove last", removeLayer);
gui.addButton("Remove all", () => {
  while (layers.length) layers.pop().destroy();
  log(`${stamp()} cleared every layer`);
  changed.update((v) => v + 1);
});

// --- handles on a control's own DOM ----------------------------------------------------
gui.addSection("Handles");
const strength = signal(0.5);
const slider = gui.addSlider("Strength", strength, 0, 1, 0.01);

gui.addButton("Hide the row above", () => {
  slider.setVisible(false);
  log(`${stamp()} slider.setVisible(false)`);
  setTimeout(() => {
    slider.setVisible(true);
    log(`${stamp()} …and back`);
  }, 1200);
});

gui.addButton("Flash its widget", () => {
  // .el is the widget, .row the whole row, .labelEl the label — all fair game.
  slider.row.style.transition = "background 200ms";
  slider.row.style.background = "rgba(255,179,71,0.25)";
  setTimeout(() => (slider.row.style.background = ""), 400);
  log(`${stamp()} touched slider.row directly`);
});

// --- a select whose options change ------------------------------------------------------
gui.addSection("Dynamic options");
const palette = signal("ember");
const picker = gui.addSelect("Palette", palette, ["ember", "ice"]);
let extra = 0;
gui.addButton("Add an option", () => {
  extra++;
  picker.setOptions(["ember", "ice", ...Array.from({ length: extra }, (_, i) => `custom ${i + 1}`)]);
  log(`${stamp()} setOptions() rebuilt the list`);
});

// --- addElement: anything at all, wrapped in a row ---------------------------------------
gui.addSection("Custom widget");
const bar = document.createElement("div");
bar.className = "gui-control"; // the control column, whatever the label width is
bar.style.cssText = "height:10px;border-radius:5px;background:var(--gui-field-bg);overflow:hidden";
const fill = document.createElement("div");
fill.style.cssText = "height:100%;background:var(--gui-fill)";
bar.append(fill);
effect(() => (fill.style.width = `${strength() * 100}%`));
gui.addElement(bar, { label: "Strength" });

// --- tearing the whole panel down ---------------------------------------------------------
gui.addSection("Teardown");
gui.addButton("Destroy this panel", () => {
  stopReadout();
  gui.destroy(); // every row, every effect, every key binding, and the DOM
  log(`${stamp()} gui.destroy() — panel gone, nothing left subscribed`);
  show({ "rows still registered": 0, note: "reload the page to build it again" });
});

addLayer();
addLayer();

// An effect, so the readout follows a layer being dragged as well as one being added.
const stopReadout = effect(() => {
  changed();
  show({
    "layer rows": layers.length,
    "controllers registered": gui._controllers.length,
    "layer values": layers.map((c) => c.signal()),
  });
});

log(`${stamp()} ready`);
