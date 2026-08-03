// Guspira — a small reactive GUI toolkit for creative-coding sketches.
// Import from here for everything, or from the individual modules to take only what you
// need (src/reactive.js has no DOM dependency at all).

export { default as GUI, Controller, Section, Tab } from "./gui.js";

export {
  signal,
  computed,
  effect,
  effectRAF,
  createScheduler,
  frame,
  microtask,
  batch,
  untrack,
  tweened,
  easings,
  isSignal,
  toSignal,
} from "./reactive.js";

export { precision, formatFloat, snap } from "./format.js";

export { createParams, readStorage, writeStorage } from "./params.js";
// rgbToHex and isHexColor stay on "guspira/color" — this is the curated set.
export { mixColors, mixRgb, hexToRgb } from "./color.js";
export { createPresetStore, copyText } from "./presets.js";
export { bindKey } from "./keyboard.js";
export {
  random,
  randomInRange,
  randomElement,
  randomBool,
  randomHexColor,
  setRandomSource,
} from "./random.js";
export { default as RangeSlider } from "./range-slider.js";
export { default as StatsGraph } from "./stats-graph.js";
export { createStats } from "./stats.js";
