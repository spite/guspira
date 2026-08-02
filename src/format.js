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

export function formatFloat(value, step) {
  return parseFloat(value).toFixed(precision(step));
}

// Snaps to the step grid and clamps to the range. The grid is anchored at zero, the same
// way <input type="range"> does it.
export function snap(value, step, min, max) {
  const snapped = Math.round(value / step) * step;
  return parseFloat(Math.max(min, Math.min(max, snapped)).toFixed(precision(step)));
}
