// What a colour control reads and writes, and how two colours are mixed. The signal holds the
// colour in whatever shape the sketch wants; the swatch converts on the way in and out.

import GUI from "../src/gui.js";
import { signal, computed, effect } from "../src/reactive.js";
import { mixColors, hexToRgb, rgbToHex } from "../src/color.js";
import { readout } from "./shell.js";

const show = readout("#state");
const canvas = document.querySelector("#canvas");
const ctx = canvas.getContext("2d");

// --- one colour, four shapes ---------------------------------------------------------------
const colours = {
  hex: signal("#ff6500"),
  rgb: signal([1, 0.4, 0]), // 0..1, what a shader wants
  bytes: signal([255, 101, 0]),
  hsl: signal([24, 1, 0.5]), // nothing built in speaks this — the codec below does
};

const hslToHex = (h, s, l) => {
  const a = s * Math.min(l, 1 - l);
  const channel = (n) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return rgbToHex([channel(0), channel(8), channel(4)]);
};

const hexToHsl = (hex) => {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return [h, s, l];
};

// A codec is two functions. fromHex is handed the value it replaces, because hex cannot carry
// a hue through grey: without `previous`, picking a grey would reset the hue to 0.
const hsl = {
  toHex: ([h, s, l]) => hslToHex(h, s, l),
  fromHex: (hex, previous) => {
    const [h, s, l] = hexToHsl(hex);
    return [s === 0 ? previous[0] : Math.round(h), +s.toFixed(3), +l.toFixed(3)];
  },
};

const gui = new GUI("Colour", document.querySelector("#gui-container"));

gui.addSection("One colour, four shapes");
gui.addColor("hex (default)", colours.hex);
gui.addColor("rgb", colours.rgb, { format: "rgb" });
gui.addColor("rgb255", colours.bytes, { format: "rgb255" });
const hslRow = gui.addColor("hsl (your codec)", colours.hsl, { format: hsl });
gui.addButton("Pick grey in the hsl swatch", () => {
  // What choosing #808080 in the picker does: the swatch fires `input` with that hex.
  hslRow.el.value = "#808080";
  hslRow.el.dispatchEvent(new Event("input"));
});

// --- mixing --------------------------------------------------------------------------------
const from = signal("#ff6500");
const to = signal("#0066ff");
const t = signal(0.5);
const mixed = computed(() => mixColors(from(), to(), t()));

gui.addSection("Mixing two of them");
gui.addColor("From", from);
gui.addColor("To", to);
gui.addSlider("t", t, 0, 1, 0.01);
gui.addMonitor("mixColors(from, to, t)", mixed);

// The comparison: the same two ends, joined channel by channel in sRGB.
const naive = (a, b, amount) => {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex([ar + (br - ar) * amount, ag + (bg - ag) * amount, ab + (bb - ab) * amount]);
};

let width = 0;
let height = 0;
function draw() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  if (canvas.width !== Math.round(width * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const a = from();
  const b = to();
  const at = t();
  const ink = getComputedStyle(canvas).color;
  const pad = 12;
  const label = 16;
  const strip = (height - pad * 3 - label * 2) / 2;
  const left = pad;
  const span = width - pad * 2;

  [
    ["mixColors — through OKLab", mixColors],
    ["channel by channel in sRGB", naive],
  ].forEach(([name, mix], row) => {
    const top = pad + row * (strip + label + pad);
    ctx.fillStyle = ink;
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText(name, left, top + 10);
    for (let x = 0; x < span; x++) {
      ctx.fillStyle = mix(a, b, x / (span - 1));
      ctx.fillRect(left + x, top + label, 1.5, strip);
    }
  });

  // where `t` is on both
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left + at * span, pad);
  ctx.lineTo(left + at * span, height - pad);
  ctx.stroke();
}

effect(draw);
addEventListener("resize", draw);
addEventListener("guspira:theme", draw);

effect(() =>
  show({
    hex: colours.hex(),
    rgb: colours.rgb().map((c) => +c.toFixed(3)),
    rgb255: colours.bytes(),
    hsl: colours.hsl(),
    "— mixing —": "",
    "mixColors at t": mixed(),
    "sRGB lerp at t": naive(from(), to(), t()),
  })
);
