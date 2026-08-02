// The params and preset layers are signals plus storage — they should work in node too,
// just without the storage half. Anything that reaches for the DOM at import or call time
// (rather than only when a file is actually saved or loaded) shows up here.

import { createParams } from "../src/params.js";
import { createPresetStore } from "../src/presets.js";
import { effect, easings } from "../src/reactive.js";
import { mixColors, hexToRgb, rgbToHex, isHexColor } from "../src/color.js";

let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`  ${cond ? "ok  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
};

const DEFAULTS = { count: 100, speed: 0.5, name: "a", on: true, range: [0.2, 0.8] };

// a tiny helper so the duration-signal test reads clearly
const signalFromParams = () => createParams({ ms: 120 }).ms;

// --- construction ---------------------------------------------------------------------
const params = createParams(DEFAULTS);
check("a signal per key", Object.keys(params).length === 5);
check("helpers stay off the key list", !Object.keys(params).includes("$snapshot"));
check("seeded from defaults", params.count() === 100 && params.range()[1] === 0.8);

// --- storage is optional and absent here ------------------------------------------------
const stored = createParams(DEFAULTS, { storageKey: "nope" });
check("a missing localStorage is survivable", stored.count() === 100);
stored.$flush();
stored.$stop();
check("flush and stop are safe without storage", true);

// --- apply is type-checked ---------------------------------------------------------------
const applied = params.$apply({ count: 5, speed: "fast", nope: 1, range: [0, 1] });
check("applies matching keys", params.count() === 5 && params.range()[0] === 0);
check("rejects the wrong type", params.speed() === 0.5 && !applied.includes("speed"));
check("rejects unknown keys", !applied.includes("nope"));

// --- apply is one batch ------------------------------------------------------------------
let runs = 0;
effect(() => {
  runs++;
  params.count();
  params.speed();
  params.name();
});
params.$apply({ count: 7, speed: 0.9, name: "b" });
check("a whole preset is one effect run", runs === 2, `runs=${runs}`);

// --- reset covers every key, transient ones included -------------------------------------
const withExcluded = createParams(DEFAULTS, { exclude: ["on"] });
withExcluded.on.set(false);
withExcluded.count.set(1);
withExcluded.$reset();
check("reset restores excluded keys too", withExcluded.on() === true && withExcluded.count() === 100);
check("snapshot still skips excluded keys", !("on" in withExcluded.$snapshot()));

// --- query string --------------------------------------------------------------------------
params.$reset();
params.count.set(42);
check("query holds only what differs", params.$toQuery() === "count=42", params.$toQuery());
params.range.set([0.1, 0.9]);
check("arrays serialise as a list", params.$toQuery().includes("range=0.1%2C0.9"), params.$toQuery());

// --- presets -----------------------------------------------------------------------------
const store = createPresetStore(params, { builtin: { fast: { speed: 2 }, slow: { speed: 0.1 } } });
check("builtin names include the custom entry", store.builtinNames()[0] === "custom");
store.apply("fast");
check("a builtin preset applies", params.speed() === 2);
check("current tracks the applied name", store.current() === "fast");
check("a partial preset leaves the rest alone", params.count() === 42);
store.save("mine");
check("saving works without storage", store.userNames().includes("mine"));
params.speed.set(0.3);
store.apply("mine");
check("a saved preset restores", params.speed() === 2);
check("toJSON is parseable", JSON.parse(store.toJSON()).speed === 2);
store.remove("mine");
check("removal works", !store.userNames().includes("mine"));
check("applying the custom entry is a no-op", store.apply("custom").length === 0);

// --- colour --------------------------------------------------------------------------
check("hex round-trips", rgbToHex(hexToRgb("#43334f")) === "#43334f");
check("isHexColor accepts a hex", isHexColor("#ff8a3d") && !isHexColor("red") && !isHexColor(4));
check("a mix at 0 is the start", mixColors("#ff8a3d", "#2f6fd0", 0) === "#ff8a3d");
check("a mix at 1 is the end", mixColors("#ff8a3d", "#2f6fd0", 1) === "#2f6fd0");
{
  // The reason for mixing in OKLab: the midpoint should not be darker than both ends.
  const mid = hexToRgb(mixColors("#ff8a3d", "#2f6fd0", 0.5));
  const naive = hexToRgb("#ff8a3d").map((c, i) => (c + hexToRgb("#2f6fd0")[i]) / 2);
  const lum = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  check("an OKLab midpoint keeps its light", lum(mid) > lum(naive),
    `${lum(mid).toFixed(3)} vs ${lum(naive).toFixed(3)} naive`);
  check("…and stays in gamut", mid.every((c) => c >= 0 && c <= 1));
}

// --- parameters that travel --------------------------------------------------------------
{
  const p = createParams(
    { scale: 2, tint: "#ff8a3d", shape: "ring", steps: 4, paused: false },
    { ease: { duration: 200, easing: easings.linear, skip: ["steps"] } }
  );

  const travels = (key) => p[key].target !== p[key];
  check("a number travels", travels("scale"));
  check("a colour travels", travels("tint"));
  check("a skipped key does not", !travels("steps"));
  check("a string has no path to travel", !travels("shape"));
  check("nor does a boolean", !travels("paused"));
  check("everything answers .target() either way",
    Object.keys(p).every((k) => typeof p[k].target === "function"));

  p.scale.set(9);
  check("the target is set at once", p.scale.target() === 9, String(p.scale.target()));
  check("…while the value is still travelling", p.scale() < 9, String(p.scale()));

  // what a save records is the destination, never a frame of the journey
  check("a snapshot records the target", p.$snapshot().scale === 9, String(p.$snapshot().scale));
  check("…and so does a link", p.$toQuery().includes("scale=9"), p.$toQuery());

  // an effect on the target fires once per change, not once per frame
  let targetRuns = 0;
  let valueRuns = 0;
  effect(() => { p.scale.target(); targetRuns++; });
  effect(() => { p.scale(); valueRuns++; });
  p.scale.set(1);
  await new Promise((r) => setTimeout(r, 260));
  check("an effect on the target runs once per change", targetRuns === 2, `${targetRuns - 1} runs`);
  check("…while one on the value follows the animation", valueRuns > 5, `${valueRuns - 1} runs`);
  check("and it arrives", Math.abs(p.scale() - 1) < 1e-9, String(p.scale()));

  p.$ease(0);
  p.scale.set(5);
  check("$ease(0) makes it arrive at once", p.scale() === 5, String(p.scale()));
}

{
  const p = createParams({ a: 1, b: 2 }, { ease: { duration: 50, only: ["a"] } });
  check("only: [] narrows it", p.a.target !== p.a && p.b.target === p.b);
}

{
  const p = createParams({ a: 1 });
  check("no ease option, no travelling", p.a.target === p.a);
  check("…and .target() still answers", p.a.target() === 1);
}

console.log(failures ? `\n${failures} FAILURES` : "\nall params tests passed");
process.exit(failures ? 1 : 0);
