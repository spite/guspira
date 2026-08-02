// Colour mixing, for values that travel. Hex in, hex out — the format `<input type="color">`
// speaks, so a mixed colour drops straight back into a control.
//
// The mix happens in OKLab rather than in sRGB. Interpolating hex channels directly sends
// most pairs through a muddy midpoint — orange to blue passes through grey — because sRGB is
// neither linear nor perceptually even. OKLab is both, so the path between two colours stays
// as bright and as saturated as its ends.

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export const isHexColor = (value) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

// "#rrggbb" -> [r, g, b] in 0..1, the range graphics code wants.
export function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

// [r, g, b] in 0..1 -> "#rrggbb".
export function rgbToHex(rgb) {
  return `#${rgb
    .map((c) =>
      Math.round(clamp01(c) * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
}

function rgbToOklab([r, g, b]) {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, A, B]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;

  return [
    toSrgb(clamp01(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    toSrgb(clamp01(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    toSrgb(clamp01(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  ];
}

// Mixes two hex colours, `t` from 0 (all `from`) to 1 (all `to`).
export function mixColors(from, to, t) {
  if (t <= 0) return from;
  if (t >= 1) return to;

  const a = rgbToOklab(hexToRgb(from));
  const b = rgbToOklab(hexToRgb(to));

  return rgbToHex(oklabToRgb([
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]));
}
