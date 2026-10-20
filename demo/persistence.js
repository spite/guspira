// createParams: one signal per key, seeded from defaults, then localStorage, then the URL.
// The defaults are the schema — everything coming from outside is checked against them.

import GUI from "../src/gui.js";
import { createParams, readStorage, writeStorage } from "../src/params.js";
import { copyText } from "../src/presets.js";
import { effect } from "../src/reactive.js";
import { logger, readout, stamp } from "./shell.js";

const log = logger("#log");
const show = readout("#state");
const showQuery = readout("#query");

const DEFAULTS = {
  count: 500,
  speed: 1.5,
  palette: "ember",
  trails: true,
  range: [0.2, 0.8],
  paused: false, // transient — excluded from persistence below
};

const params = createParams(DEFAULTS, {
  storageKey: "guspira-persistence",
  exclude: ["paused"],
  url: true, // ?count=900&palette=ice seeds the store on load
  // A chance to rewrite an older save before it is applied. Here: a key that used to be
  // called `density` becomes `count`.
  migrate: (stored) => {
    if ("density" in stored) {
      stored.count = stored.density;
      delete stored.density;
      log(`${stamp()} migrated a legacy "density" key`);
    }
    return stored;
  },
});

const gui = new GUI("Persistence", document.querySelector("#gui-container"));

gui.addSection("Parameters");
gui.addSlider("Count", params.count, 50, 2000, 50);
gui.addSlider("Speed", params.speed, 0, 4, 0.1);
gui.addSelect("Palette", params.palette, ["ember", "ice", "mono"]);
gui.addCheckbox("Trails", params.trails);
gui.addRangeSlider("Range", params.range, 0, 1, 0.05);
gui.addCheckbox("Paused (not persisted)", params.paused);

gui.addSection("Schema");
gui.addButton("Apply junk", () => {
  // Wrong types and unknown keys are dropped; the rest still applies.
  const applied = params.$apply({
    count: "lots", // wrong type
    speed: 3.3, // fine
    nonsense: true, // unknown key
    range: [0.1, 0.4], // fine
  });
  log(`${stamp()} $apply accepted [${applied.join(", ")}] and rejected count, nonsense`);
});
gui.addButton("Apply a good snapshot", () => {
  const applied = params.$apply({ count: 1200, palette: "ice", trails: false });
  log(`${stamp()} $apply accepted [${applied.join(", ")}] — one batch, one effect run`);
});

gui.addSection("Storage");
gui.addButton("Flush now", () => {
  params.$flush(); // writes are debounced; this forces one
  log(`${stamp()} $flush() — localStorage now holds whatever differs from the defaults`);
  render();
});
gui.addButton("Clear stored state", () => {
  params.$clear();
  log(`${stamp()} $clear() — reload to come back to defaults`);
  render();
});
gui.addButton("Reset to defaults", () => {
  params.$reset();
  log(`${stamp()} $reset() — every key, transient ones included`);
});

gui.addSection("Raw storage");
gui.addButton("Read what is on disk", () => {
  // The same helpers the store uses — both swallow a missing or full localStorage.
  log(`${stamp()} readStorage: ${JSON.stringify(readStorage("guspira-persistence"))}`);
});
gui.addButton("Write a legacy save", () => {
  // Writes an old-shaped save, so a reload exercises the migrate() above.
  writeStorage("guspira-persistence", { ...params.$snapshot(), density: 777, count: undefined });
  log(`${stamp()} wrote a save with a legacy "density" key — reload to see it migrated`);
});

gui.addSection("Share");
gui.addButton("Copy link to this state", async () => {
  const url = `${location.origin}${location.pathname}?${params.$toQuery()}`;
  const ok = await copyText(url);
  log(`${stamp()} ${ok ? "copied" : "could not copy"}: ${url}`);
});
gui.addButton("Open link in a new tab", () => {
  open(`${location.pathname}?${params.$toQuery()}`, "_blank");
});

function render() {
  show(params.$snapshot());
  const query = params.$toQuery();
  showQuery(query ? `?${query}` : "(everything is at its default — nothing to put in a link)");
}

// One effect subscribes to every parameter, so the readout tracks all of them.
effect(() => {
  params.$keys.forEach((key) => params[key]());
  render();
});

const fromUrl = new URLSearchParams(location.search);
if ([...fromUrl.keys()].length) {
  log(`${stamp()} seeded from the URL: ${[...fromUrl.keys()].join(", ")}`);
}
log(`${stamp()} ready — change something and reload`);
