// A domain-warped noise field on the GPU. Every control is a uniform, so the whole image
// answers on the next frame — which is the point of the demo: you are not waiting to see
// what a parameter does, you are steering it.
//
// It also shows the two kinds of reactive work a sketch has. Cheap values (uniforms) are
// read straight off the signals in the render loop. Expensive work — recompiling the shader
// when the octave count changes — is an effect on the frame queue, so dragging that slider
// recompiles once per frame instead of once per step.

import GUI from "../src/gui.js";
import { createParams } from "../src/params.js";
import { createPresetStore, copyText } from "../src/presets.js";
import { signal, effect, frame, easings } from "../src/reactive.js";
import { hexToRgb } from "../src/color.js";

const DEFAULTS = {
  // field
  scale: 2.6,
  warp: 3.2,
  octaves: 5,
  lacunarity: 2.0,
  gain: 0.5,
  speed: 0.22,
  zoom: 1.0,
  driftX: 0.06,
  driftY: -0.02,
  // shape
  symmetry: 0,
  twist: 0.0,
  ripple: 0.0,
  // colour
  // The palette is col = base + range * cos(2pi * (freq * v + phase + channel spread)).
  // A small spread keeps the three channels close together, which is what stops it turning
  // into a rainbow — the default look is a warm dusk, not a test card.
  colourA: "#43334f",
  colourB: "#c9834c",
  freq: 0.85,
  phase: 0.55,
  spread: 0.07,
  contrast: 1.3,
  saturation: 1.0,
  glow: 0.22,
  vignette: 0.35,
  grain: 0.06,
  // system
  quality: 1,
  ease: 450, // ms a value takes to travel when something else sets it
  paused: false,
};

const PRESETS = {
  ember: {
    scale: 2.2, warp: 4.2, octaves: 6, speed: 0.16, symmetry: 0, twist: 0.15,
    colourA: "#33150a", colourB: "#ff8a3d", freq: 1.0, phase: 0.02, spread: 0.045,
    contrast: 1.4, glow: 0.45, vignette: 0.45, saturation: 1.15,
  },
  glacier: {
    scale: 3.4, warp: 2.1, octaves: 5, speed: 0.1, symmetry: 0, ripple: 0.35,
    colourA: "#14364d", colourB: "#a6dcf2", freq: 0.7, phase: 0.42, spread: 0.03,
    contrast: 1.15, glow: 0.22, vignette: 0.32, saturation: 0.85,
  },
  kaleidoscope: {
    scale: 1.8, warp: 5.5, octaves: 4, speed: 0.3, symmetry: 8, twist: 0.6,
    colourA: "#241246", colourB: "#e879f9", freq: 1.4, phase: 0.3, spread: 0.12,
    contrast: 1.45, glow: 0.6, vignette: 0.22, saturation: 1.25,
  },
  sediment: {
    scale: 4.5, warp: 1.2, octaves: 7, speed: 0.05, symmetry: 0, twist: 0,
    colourA: "#241c12", colourB: "#c9b089", freq: 2.2, phase: 0.0, spread: 0.08,
    contrast: 1.8, glow: 0.15, vignette: 0.5, saturation: 0.7, grain: 0.12,
  },
  aurora: {
    scale: 1.4, warp: 6.5, octaves: 5, speed: 0.35, symmetry: 3, ripple: 0.5,
    colourA: "#08202a", colourB: "#54d9a4", freq: 0.9, phase: 0.6, spread: 0.06,
    contrast: 1.2, glow: 0.5, vignette: 0.42, saturation: 1.05,
  },
};

const params = createParams(DEFAULTS, {
  storageKey: "guspira-warp",
  exclude: ["paused"],
  url: true, // ?warp=6&symmetry=8 opens on that look

  // The parameters below travel instead of jumping: reading one gives the value on its way to
  // where the panel put it, so a preset or a reroll morphs the field into its new shape. The
  // panel still shows the destination — it binds to params.x.target() on its own. Which values
  // can travel is decided by their type, numbers and colours; which should is decided here.
  // Left out: the integers the shader switches on, and the settings about how it runs rather
  // than how it looks.
  ease: {
    duration: DEFAULTS.ease,
    easing: easings.cubicOut,
    skip: ["octaves", "symmetry", "quality", "ease", "paused"],
  },
});

const presets = createPresetStore(params, {
  builtin: PRESETS,
  storageKey: "guspira-warp-presets",
});

// Dragging any control means the look is no longer the named preset, so the picker should
// stop claiming it is. One effect over every parameter is the right shape here: it is one
// piece of bookkeeping that genuinely depends on all of them.
let settling = true;
effect(() => {
  params.$keys.forEach((key) => params[key]());
  if (settling) {
    settling = false;
    return;
  }
  presets.markCustom();
});

// The Ease slider retimes every parameter that travels; 0 makes them arrive at once.
effect(() => params.$ease(params.ease()));

// --- GL ---------------------------------------------------------------------------------

const canvas = document.querySelector("#gl");
const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
const fps = signal(0);
const note = signal("");

const VERT = `#version 300 es
void main() {
  // one oversized triangle, no buffers needed
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// OCTAVES arrives as a #define, which is why changing it needs a recompile — the loop has
// to be unrollable for the shader compiler.
const frag = (octaves) => `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime, uScale, uWarp, uLacunarity, uGain, uZoom, uTwist, uRipple;
uniform float uFreq, uPhase, uSpread, uContrast, uSat, uGlow, uVignette, uGrain;
uniform int uSymmetry;
uniform vec3 uA, uB;
uniform vec2 uDrift;

#define OCTAVES ${octaves}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float sum = 0.0, amp = 0.5;
  for (int i = 0; i < OCTAVES; i++) {
    sum += amp * noise(p);
    p *= uLacunarity;
    amp *= uGain;
  }
  return sum;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  uv /= uZoom;

  // kaleidoscope fold
  if (uSymmetry > 0) {
    float a = atan(uv.y, uv.x);
    float r = length(uv);
    float seg = 6.2831853 / float(uSymmetry);
    a = abs(mod(a + seg * 0.5, seg) - seg * 0.5);
    uv = vec2(cos(a), sin(a)) * r;
  }

  // twist and ripple, both radial
  float r = length(uv);
  float a = atan(uv.y, uv.x) + uTwist * r * 2.0;
  uv = vec2(cos(a), sin(a)) * (r + uRipple * 0.08 * sin(r * 12.0 - uTime * 2.0));

  vec2 p = uv * uScale + uDrift * uTime;

  // domain warping: noise offsetting noise, twice
  vec2 q = vec2(fbm(p + vec2(0.0, uTime * 0.15)), fbm(p + vec2(5.2, 1.3)));
  vec2 s = vec2(fbm(p + uWarp * q + vec2(1.7, 9.2)), fbm(p + uWarp * q + vec2(8.3, 2.8)));
  float v = fbm(p + uWarp * s);

  // cosine palette
  vec3 col = uA + uB * cos(6.2831853 * (uFreq * v + uPhase + vec3(0.0, uSpread, 2.0 * uSpread)));

  col = pow(max(col, 0.0), vec3(uContrast));
  col += uGlow * pow(max(dot(s, s), 0.0), 2.0) * uB;

  // Filmic rolloff rather than a hard clamp: pushed to extremes the palette rolls off into
  // white instead of flattening into a block of clipped primary, so every position of every
  // slider still produces an image.
  col = 1.0 - exp(-max(col, 0.0) * 1.35);

  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, uSat);
  col *= 1.0 - uVignette * smoothstep(0.35, 1.25, length(uv * uZoom));
  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) * uGrain;

  fragColor = vec4(max(col, 0.0), 1.0);
}`;

let program = null;
let uniforms = {};

function compile(octaves) {
  const make = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }
    return shader;
  };

  const next = gl.createProgram();
  gl.attachShader(next, make(gl.VERTEX_SHADER, VERT));
  gl.attachShader(next, make(gl.FRAGMENT_SHADER, frag(octaves)));
  gl.linkProgram(next);
  if (!gl.getProgramParameter(next, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(next));
  }

  if (program) gl.deleteProgram(program);
  program = next;
  gl.useProgram(program);

  uniforms = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const { name } = gl.getActiveUniform(program, i);
    uniforms[name] = gl.getUniformLocation(program, name);
  }
}

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2) * params.quality.peek();
  const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width === w && canvas.height === h) return;
  canvas.width = w;
  canvas.height = h;
  gl.viewport(0, 0, w, h);
}

if (gl) {
  // Recompiling is the expensive reactive work here, so it goes on the frame queue: drag the
  // octave slider across ten steps and the shader is rebuilt once, not ten times.
  effect(
    () => {
      const octaves = Math.round(params.octaves());
      try {
        compile(octaves);
        note.set("");
      } catch (e) {
        note.set(`shader error: ${String(e.message).split("\n")[0]}`);
      }
    },
    { scheduler: frame }
  );

  // Resolution is cheap but structural — its own effect, not a per-frame check.
  effect(() => {
    params.quality();
    resize();
  });

  addEventListener("resize", resize);
}

let frames = 0;
let clock = performance.now();
let simTime = 0;
let last = performance.now();

function render(now) {
  requestAnimationFrame(render);
  if (!gl || !program) return;

  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!params.paused.peek()) simTime += dt * params.speed.peek() * 4;

  frames++;
  if (now - clock > 500) {
    fps.set((frames * 1000) / (now - clock));
    frames = 0;
    clock = now;
  }

  resize();
  gl.useProgram(program);

  // Uniforms are cheap enough to push every frame, so they are read straight off the
  // signals with peek() — no subscription, no bookkeeping.
  const u = uniforms;
  gl.uniform2f(u.uRes, canvas.width, canvas.height);
  gl.uniform1f(u.uTime, simTime);
  gl.uniform1f(u.uScale, params.scale());
  gl.uniform1f(u.uWarp, params.warp());
  gl.uniform1f(u.uLacunarity, params.lacunarity());
  gl.uniform1f(u.uGain, params.gain());
  gl.uniform1f(u.uZoom, params.zoom());
  gl.uniform1f(u.uTwist, params.twist());
  gl.uniform1f(u.uRipple, params.ripple());
  gl.uniform1f(u.uFreq, params.freq());
  gl.uniform1f(u.uPhase, params.phase());
  gl.uniform1f(u.uSpread, params.spread());
  gl.uniform1f(u.uContrast, params.contrast());
  gl.uniform1f(u.uSat, params.saturation());
  gl.uniform1f(u.uGlow, params.glow());
  gl.uniform1f(u.uVignette, params.vignette());
  gl.uniform1f(u.uGrain, params.grain());
  gl.uniform1i(u.uSymmetry, Math.round(params.symmetry.peek()));
  gl.uniform3fv(u.uA, hexToRgb(params.colourA()));
  gl.uniform3fv(u.uB, hexToRgb(params.colourB()));
  gl.uniform2f(u.uDrift, params.driftX(), params.driftY());

  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// --- panel ---------------------------------------------------------------------------------

const gui = new GUI("Warp field", document.querySelector("#gui-container"), {
  storageKey: "guspira-warp",
});

gui.addSelect("Preset", presets.current, presets.builtinNames(), {
  onChange: (name) => {
    // The write below re-marks it custom through the effect above, so the name is restored
    // after the batch settles.
    presets.apply(name);
    presets.current.set(name);
  },
});

gui.addTab("Field");
gui.addSection("Noise");
gui.addSlider("Scale", params.scale, 0.5, 8, 0.05);
gui.addSlider("Warp", params.warp, 0, 8, 0.05, { title: "How hard the field folds into itself" });
gui.addSlider("Octaves", params.octaves, 1, 8, 1, { title: "Recompiles the shader" });
gui.addSlider("Lacunarity", params.lacunarity, 1.2, 3.2, 0.05);
gui.addSlider("Gain", params.gain, 0.2, 0.8, 0.01);
gui.addSection("Motion");
gui.addSlider("Speed", params.speed, 0, 1.5, 0.01);
gui.addSlider("Drift X", params.driftX, -0.4, 0.4, 0.01);
gui.addSlider("Drift Y", params.driftY, -0.4, 0.4, 0.01);
gui.addSlider("Zoom", params.zoom, 0.25, 4, 0.05);

gui.addTab("Shape");
gui.addSection("Symmetry");
gui.addSlider("Fold", params.symmetry, 0, 16, 1, { title: "0 = off" });
gui.addSlider("Twist", params.twist, -2, 2, 0.02);
gui.addSlider("Ripple", params.ripple, 0, 1, 0.01);

gui.addTab("Colour");
gui.addSection("Palette");
gui.addColor("Base", params.colourA);
gui.addColor("Range", params.colourB);
gui.addSlider("Frequency", params.freq, 0.2, 4, 0.05);
gui.addSlider("Phase", params.phase, 0, 1, 0.01);
gui.addSlider("Channel spread", params.spread, 0, 1, 0.01);
gui.addSection("Grade");
gui.addSlider("Contrast", params.contrast, 0.4, 2.5, 0.05);
gui.addSlider("Saturation", params.saturation, 0, 2, 0.05);
gui.addSlider("Glow", params.glow, 0, 1.5, 0.05);
gui.addSlider("Vignette", params.vignette, 0, 1, 0.02);
gui.addSlider("Grain", params.grain, 0, 0.3, 0.01);

gui.addTab("System");
gui.addSection("Playback");
gui.addCheckbox("Paused", params.paused, { title: "Space", randomizable: false });
gui.addSlider("Resolution", params.quality, 0.25, 1, 0.05, {
  title: "Render scale — drop it if the frame rate does",
  randomizable: false, // part of how it runs, not part of the look
});
gui.addSlider("Ease (ms)", params.ease, 0, 2000, 25, {
  randomizable: false,
  title: "How long a value takes to travel when a preset or a reroll changes it — 0 cuts",
});
gui.addRandomizeButton("Randomize (R)", () => presets.markCustom());
gui.addSection("Stats", { open: false });
gui.addMonitor("FPS", fps, { format: (v) => v.toFixed(0) });
gui.addMonitor("Status", note, { format: (v) => v || "ok" });
gui.addSection("Presets");
gui.addPresets(presets, { builtin: false });
gui.addSection("Share");
const copied = signal("");
gui.addButton("Copy link to this look", async () => {
  const url = `${location.origin}${location.pathname}?${params.$toQuery()}`;
  copied.set((await copyText(url)) ? "link copied" : "copy failed");
  setTimeout(() => copied.set(""), 1500);
});
gui.addMonitor("", copied);
gui.addSection("Reset");
gui.addButton("Reset to defaults", () => {
  params.$reset();
  presets.markCustom();
});

addEventListener("keydown", (e) => {
  if (e.code !== "Space" || ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
  e.preventDefault();
  params.paused.update((v) => !v);
});

if (!gl) {
  note.set("this browser has no WebGL2");
  document.querySelector("#about").insertAdjacentHTML(
    "beforeend",
    "<p style='color:#ff8a8a'>WebGL2 is unavailable here, so the field cannot render — the panel still works.</p>"
  );
} else {
  requestAnimationFrame(render);
}
