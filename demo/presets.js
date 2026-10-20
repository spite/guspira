// Presets: built-in partial looks, user snapshots in localStorage, and the same JSON
// travelling out to a file and back. The square is drawn from the parameters themselves.

import GUI from "../src/gui.js";
import { createParams } from "../src/params.js";
import { mixRgb } from "../src/color.js";
import { createPresetStore, copyText } from "../src/presets.js";
import { effect } from "../src/reactive.js";
import { logger, readout, stamp } from "./shell.js";

const log = logger("#log");
const show = readout("#state");

const DEFAULTS = {
  hue: 28,
  saturation: 0.8,
  lightness: 0.5,
  radius: 12,
  border: 4,
  rotation: 0,
  // A colour kept the way a shader wants it — [r, g, b] in 0..1 — rather than as a hex string.
  glow: [1, 0.42, 0.15],
};

// Built-in presets are partial: each says only what it changes.
const BUILTIN = {
  ember: { hue: 18, saturation: 0.9, lightness: 0.5 },
  ice: { hue: 195, saturation: 0.7, lightness: 0.6 },
  mono: { hue: 0, saturation: 0, lightness: 0.75 },
  pill: { radius: 60, border: 0 },
  ticket: { radius: 4, border: 12, rotation: -4 },
};

const params = createParams(DEFAULTS, {
  // Applying a preset moves everything at once, so the values travel rather than jump. Numbers
  // and arrays ease on their own; `glow` is an array that happens to be a colour, which the
  // store cannot tell from a position — so the perceptual path is asked for by name.
  ease: { duration: 350, interpolate: { glow: mixRgb } }, storageKey: "guspira-presets-demo" });

const presets = createPresetStore(params, {
  builtin: BUILTIN,
  storageKey: "guspira-presets-demo-saved",
  onApply: (name, applied) => log(`${stamp()} applied "${name}" → ${applied.join(", ")}`),
});

// Editing anything means the look is no longer the named preset, so the name gives way to
// "custom". Targets rather than values: a preset easing into place is not somebody editing.
let settling = true;
effect(() => {
  params.$keys.forEach((key) => params[key].target());
  if (settling) {
    settling = false;
    return;
  }
  presets.markCustom();
});

const gui = new GUI("Presets", document.querySelector("#gui-container"));

gui.addSection("Look");
gui.addSlider("Hue", params.hue, 0, 360, 1);
gui.addSlider("Saturation", params.saturation, 0, 1, 0.01);
gui.addSlider("Lightness", params.lightness, 0, 1, 0.01);
gui.addSlider("Corner radius", params.radius, 0, 60, 1);
gui.addSlider("Border", params.border, 0, 20, 1);
gui.addSlider("Rotation", params.rotation, -45, 45, 1);
// The signal holds [r, g, b]; the swatch converts. Nothing reading `glow` sees a hex string.
gui.addColor("Glow", params.glow, { format: "rgb" });

// The whole preset UI: built-in picker, saved list, name field, save/load/delete,
// export to a file and import one back.
gui.addSection("Presets");
gui.addPresets(presets, {
  onImportError: (e) => log(`${stamp()} import failed: ${e.message}`),
});

gui.addSection("JSON");
// The full state as text, ready to paste into a bug report.
gui.addButton("Copy JSON", async () => {
  const ok = await copyText(presets.toJSON());
  log(`${stamp()} ${ok ? "copied the full state" : "could not reach the clipboard"}`);
});

// --- the thing being styled -------------------------------------------------------------
const box = document.createElement("div");
box.style.cssText =
  "width:180px;height:180px;transition:all 120ms ease;box-shadow:0 8px 24px rgba(0,0,0,.35)";
const stage = document.querySelector("#state").parentElement;
stage.insertBefore(box, stage.firstChild);

effect(() => {
  const h = params.hue();
  const s = params.saturation() * 100;
  const l = params.lightness() * 100;
  box.style.background = `hsl(${h}, ${s}%, ${l}%)`;
  box.style.borderRadius = `${params.radius()}px`;
  box.style.border = `${params.border()}px solid hsl(${(h + 180) % 360}, ${s}%, ${Math.max(
    10,
    l - 25
  )}%)`;
  box.style.transform = `rotate(${params.rotation()}deg)`;
  const [gr, gg, gb] = params.glow().map((c) => Math.round(c * 255));
  box.style.boxShadow = `0 0 28px rgba(${gr}, ${gg}, ${gb}, 0.75)`;

  show({
    preset: presets.current(),
    builtin: presets.builtinNames().join(", "),
    saved: presets.userNames().join(", ") || "(none yet)",
    ...params.$snapshot(),
  });
});

log(`${stamp()} ready — pick a preset, tweak it, save it under a name`);
