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

// Mixes two [r, g, b] colours in 0..1, `t` from 0 (all `from`) to 1 (all `to`). This is where
// the OKLab path lives; mixColors below is the same thing for hex strings.
export function mixRgb(from, to, t) {
  if (t <= 0) return from;
  if (t >= 1) return to;

  const a = rgbToOklab(from);
  const b = rgbToOklab(to);

  return oklabToRgb([
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]);
}

// Mixes two hex colours, `t` from 0 (all `from`) to 1 (all `to`).
export function mixColors(from, to, t) {
  if (t <= 0) return from;
  if (t >= 1) return to;
  return rgbToHex(mixRgb(hexToRgb(from), hexToRgb(to), t));
}

// --- what a colour control reads and writes ------------------------------------------------
//
// A colour signal holds whatever the sketch wants to hold — a hex string, the 0..1 triplet a
// shader wants, 0..255 bytes. The control converts, because the alternative is the sketch
// converting on every read, which is the friction this exists to remove.
//
// Every codec speaks hex, because `<input type="color">` speaks hex and nothing else. The
// conversion is deliberately asymmetric: value -> hex runs on every display update and is
// read-only, so a value carrying more than sRGB 8-bit keeps all of it; hex -> value runs only
// when someone actually picked from the swatch, which is the one moment quantising to what
// the swatch can represent is honest.
//
// `fromHex` is handed the value it replaces, because hex cannot carry everything: at zero
// saturation there is no hue to recover, so an HSL codec that ignored the previous value would
// snap to red every time a colour was dragged through grey.
const CODECS = {
  hex: {
    toHex: (value) => (isHexColor(value) ? value : "#000000"),
    fromHex: (hex) => hex,
  },
  rgb: {
    toHex: (value) => rgbToHex(value),
    fromHex: (hex) => hexToRgb(hex),
  },
  rgb255: {
    toHex: (value) => rgbToHex(value.map((c) => c / 255)),
    fromHex: (hex) => hexToRgb(hex).map((c) => Math.round(c * 255)),
  },
};

export function colorCodec(format = "hex") {
  if (format === undefined || format === null || typeof format === "string") {
    const codec = CODECS[format || "hex"];
    if (!codec) {
      throw new TypeError(
        `[guspira] unknown colour format ${JSON.stringify(format)} — use "hex", "rgb", ` +
          `"rgb255", or a { toHex, fromHex } pair of your own`
      );
    }
    return codec;
  }
  if (typeof format.toHex === "function" && typeof format.fromHex === "function") return format;
  throw new TypeError(
    "[guspira] a custom colour format needs both { toHex, fromHex } — fromHex is also handed " +
      "the value it is replacing, for the components hex cannot carry"
  );
}
