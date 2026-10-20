// Tabs and sections. Both are imperative: open one and everything added after it lands
// inside, until the next one. With a storageKey the panel remembers its own layout.

import GUI from "../src/gui.js";
import { signal } from "../src/reactive.js";
import { readout, highlight } from "./shell.js";

const show = readout("#state");
const STORAGE_KEY = "guspira-structure";

const params = {
  field: signal("curl"),
  speed: signal(0.5),
  scale: signal(1),
  advanced: signal(false),
  quality: signal("high"),
  bloom: signal(0.6),
  grain: signal(1.5),
};

const gui = new GUI("Structure", document.querySelector("#gui-container"), {
  storageKey: STORAGE_KEY, // remembers the open tab and which sections are folded
});

// Controls added before the first tab stay above the tab bar — a persistent header.
gui.addSelect("Field", params.field, ["curl", "attractor", "noise"]);

const sections = [];
const motion = gui.addTab("Motion");
sections.push(gui.addSection("Drive"));
gui.addSlider("Speed", params.speed, 0, 2, 0.01);
gui.addSlider("Scale", params.scale, 0.1, 4, 0.1);
// A section that only exists for one value of the header select.
sections.push(gui.addSection("Attractor", { visibleWhen: () => params.field() === "attractor" }));
gui.addText("Only while the field above is <b>attractor</b>.");
gui.addSlider("Fold me", params.scale, 0.1, 4, 0.1);
sections.push(gui.addSection("Folded by default", { open: false }));
gui.addText("Sections remember being folded, so this only starts closed the first time.");

gui.addTab("Look");
sections.push(gui.addSection("Quality"));
gui.addSelect("Preset", params.quality, ["low", "high", "ultra"]);
gui.addCheckbox("Show advanced", params.advanced);
sections.push(gui.addSection("Advanced", { visibleWhen: () => params.advanced() }));
gui.addSlider("Bloom", params.bloom, 0, 2, 0.02);
gui.addSlider("Grain", params.grain, 0, 4, 0.1);
// A section that is a plain heading — no folding.
gui.addSection("Not collapsible", { collapsible: false });
gui.addText("Passed <code>{ collapsible: false }</code>.");
// endSection() steps back out: what follows sits in the tab itself, under no heading.
gui.endSection();
gui.addText("Added after <code>endSection()</code> — in the tab, outside every section.");

gui.addTab("About");
gui.addText(
  "Three tabs, built by calling <code>addTab</code> three times. Whichever one you leave open " +
    "is the one you get back after a reload."
);
// A tab's own handle selects it; gui.selectTab(index) does the same by position.
gui.addButton("Jump to the first tab", () => motion.select());
// into() adds to a tab or section long after it stopped being the one being built.
let extras = 0;
gui.addButton("Add a row to Drive", () => {
  gui.into(sections[0], () => gui.addSlider(`Extra ${++extras}`, signal(0.5), 0, 1, 0.01));
  gui.selectTab(0);
});
gui.addButton("Toggle the Drive section", () => {
  sections[0].toggle();
  motion.select();
});
gui.addButton("Fold every section", () => sections.forEach((s) => s.setOpen(false)));
gui.addButton("Unfold every section", () => sections.forEach((s) => s.setOpen(true)));
gui.addButton("Hide the panel for a second", () => {
  gui.hide();
  setTimeout(() => gui.show(), 1000);
});
gui.addButton("Forget remembered layout", () => {
  Object.keys(localStorage)
    .filter((k) => k.startsWith(`${STORAGE_KEY}:ui:`))
    .forEach((k) => localStorage.removeItem(k));
  location.reload();
});

// Show what the panel has actually written for itself.
const dumpLayout = () => {
  const out = {};
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(`${STORAGE_KEY}:ui:`)) out[key.replace(`${STORAGE_KEY}:ui:`, "")] = localStorage.getItem(key);
  }
  return Object.keys(out).length ? out : "(nothing recorded yet — fold a section or switch tabs)";
};
show(dumpLayout());
addEventListener("click", () => setTimeout(() => show(dumpLayout()), 0));

document.querySelector("#code").textContent = `gui.addSelect("Field", params.field, [...]);  // above the tabs

const sections = [];
gui.addTab("Motion");
sections.push(gui.addSection("Drive"));
gui.addSlider("Speed", params.speed, 0, 2, 0.01);

gui.addSection("Attractor", {
  visibleWhen: () => params.field() === "attractor",
});

sections.push(gui.addSection("Folded by default", { open: false }));
gui.addSection("Not collapsible", { collapsible: false });
gui.endSection();                        // back out to the tab

// later, from a button: add to a section built long ago
gui.into(sections[0], () => gui.addSlider("Extra", extra, 0, 1, 0.01));`;
highlight(document.querySelector("#code"));
