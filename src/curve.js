// How a slider's track maps to its value. Kept apart from the element because it is pure
// arithmetic with no DOM in it: the panel needs the same mapping to reroll a curved slider,
// and a test should be able to check it without a browser.
//
// Linear is the whole story until a parameter spans orders of magnitude, at which point every
// interesting value is crammed into the first few pixels. `curve` bends the track:
//
//   1        linear, and the default
//   2, 3     an exponent on the track position — the low end gets more room
//   0.5      the other way round
//   "log"    equal track distance per ratio, which is what decades of frequency or scale want
//
// The pair below has to stay invertible: dragging needs position -> value, and drawing the
// thumb needs value -> position. That requirement is why this is a small closed set rather
// than a function the caller supplies.

export function normalizeCurve(value) {
  if (value === undefined || value === null || value === "") return 1;
  if (value === "log") return "log";

  // Attributes arrive as strings, so curve="2" has to mean the number 2.
  const asNumber = typeof value === "string" ? parseFloat(value) : Number(value);
  if (!Number.isFinite(asNumber) || asNumber <= 0) {
    throw new TypeError(
      `[guspira] curve must be a positive number or "log", not ${JSON.stringify(value)}`
    );
  }
  return asNumber;
}

// A log track is only defined where every value on it has a logarithm, so a range touching or
// crossing zero is refused up front rather than left to produce a thumb that will not move.
export function curveFitsRange(curve, min, max) {
  return curve !== "log" || (min !== 0 && max !== 0 && Math.sign(min) === Math.sign(max));
}

export function assertCurveRange(curve, min, max, where = "range-slider") {
  if (!curveFitsRange(curve, min, max)) {
    throw new RangeError(
      `[guspira] ${where}: curve "log" needs min and max to be non-zero and the same sign ` +
        `(given ${min} to ${max}) — 0 has no logarithm. Use a number like curve: 2 for a ` +
        `low-end bias on a range that includes zero.`
    );
  }
}

// Track position (0..1) to value.
export function curveToValue(fraction, min, max, curve = 1) {
  if (curve === "log") return min * Math.pow(max / min, fraction);
  const eased = curve === 1 ? fraction : Math.pow(Math.max(0, fraction), curve);
  return min + eased * (max - min);
}

// Value back to track position (0..1). The inverse of the above.
export function valueToCurve(value, min, max, curve = 1) {
  if (curve === "log") {
    const ratio = max / min;
    if (ratio <= 0 || ratio === 1) return 0;
    return Math.log(value / min) / Math.log(ratio);
  }
  const span = max - min;
  if (!span) return 0;
  const fraction = (value - min) / span;
  return curve === 1 ? fraction : Math.pow(Math.max(0, fraction), 1 / curve);
}

