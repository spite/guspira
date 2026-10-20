// Number formatting shared by the panel and the slider element. Both have to agree on how
// many decimals a step implies, or the value shown and the value stored drift apart.

// Decimals implied by a step: 0.05 -> 2, 0.25 -> 2, 1 -> 0. Derived by finding the smallest
// power of ten that reproduces the number exactly, rather than from -log10(step): that
// shortcut is off by one for every step that isn't a power of ten (0.05 would round to one
// decimal, snapping a 0.05-step slider onto a 0.1 grid).
export function precision(step) {
  if (!isFinite(step)) return 0;
  let e = 1;
  let p = 0;
  while (Math.round(step * e) / e !== step) {
    e *= 10;
    p++;
    if (p > 10) break;
  }
  return p;
}

// Decimals a stop on the grid needs: the step's, or those of the value the grid starts from.
const decimals = (step, base) => Math.max(precision(step), isFinite(base) ? precision(base) : 0);

// `base` is where the grid starts, for a range whose `min` has more decimals than its step.
export function formatFloat(value, step, base = 0) {
  return parseFloat(value).toFixed(decimals(step, base));
}

// Snaps to a grid counted from `min` (from zero when there is none), then clamps to the range.
export function snap(value, step, min, max) {
  const base = isFinite(min) ? min : 0;
  const snapped = base + Math.round((value - base) / step) * step;
  return Math.max(min, Math.min(max, parseFloat(snapped.toFixed(decimals(step, base)))));
}
