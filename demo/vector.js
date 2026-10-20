// A wireframe cube whose transform is three array signals. The point is the binding: the
// panel writes `[x, y, z]`, the renderer reads `[x, y, z]`, and there is no third copy in
// between — the same story as a slider, with three numbers instead of one.

import GUI from "../src/gui.js";
import { signal, effect } from "../src/reactive.js";
import { readout, highlightAll } from "./shell.js";

const show = readout("#state");
const canvas = document.querySelector("#canvas");
const ctx = canvas.getContext("2d");

const state = {
  position: signal([0, 0, 0]),
  rotation: signal([24, -32, 0]),
  scale: signal([1, 1, 1]),
  light: signal([0.7, 0.75]), // where the shading comes from, in pad coordinates
  wire: signal("#ffb347"),
  perspective: signal(6),
};

const gui = new GUI("Transform", document.querySelector("#gui-container"));

gui.addSection("Cube");
// The number of axes comes from the value, so this is a vec3 without being told so.
gui.addVector("Position", state.position, { min: -3, max: 3, step: 0.05 });
// Per-axis ranges: yaw and roll turn the whole way round, pitch only half.
gui.addVector("Rotation", state.rotation, {
  min: [-180, -90, -180],
  max: [180, 90, 180],
  step: 1,
  axes: ["yaw", "pitch", "roll"], // hover an axis, or hear it read out
});
gui.addVector("Scale", state.scale, { min: 0.2, max: 2.5, step: 0.05 });

gui.addSection("Scene");
// invertY, because a light being "up" should be at the top of the pad.
gui.addPad("Light", state.light, { invertY: true, height: 96 });
gui.addSlider("Perspective", state.perspective, 2, 14, 0.1);
gui.addColor("Wire", state.wire);

// --- the cube ------------------------------------------------------------------------------

const CORNERS = [];
for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) CORNERS.push([x, y, z]);
// Two corners share an edge when they differ in exactly one axis.
const EDGES = [];
for (let a = 0; a < CORNERS.length; a++) {
  for (let b = a + 1; b < CORNERS.length; b++) {
    const differences = CORNERS[a].filter((v, i) => v !== CORNERS[b][i]).length;
    if (differences === 1) EDGES.push([a, b]);
  }
}

const rotate = ([x, y, z], [rx, ry, rz]) => {
  const rad = (d) => (d * Math.PI) / 180;
  let [sx, cx] = [Math.sin(rad(rx)), Math.cos(rad(rx))];
  let [sy, cy] = [Math.sin(rad(ry)), Math.cos(rad(ry))];
  let [sz, cz] = [Math.sin(rad(rz)), Math.cos(rad(rz))];
  [y, z] = [y * cx - z * sx, y * sx + z * cx];
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  [x, y] = [x * cz - y * sz, x * sz + y * cz];
  return [x, y, z];
};

function draw() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== Math.round(width * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  // Every read below subscribes this effect, so moving any one of them redraws.
  const position = state.position();
  const rotation = state.rotation();
  const scale = state.scale();
  const [lx, ly] = state.light();
  const distance = state.perspective();
  const wire = state.wire();

  const unit = Math.min(width, height) / 4.5;
  const project = ([x, y, z]) => {
    const depth = distance / (distance + z);
    return [width / 2 + x * unit * depth, height / 2 - y * unit * depth, depth];
  };

  const points = CORNERS.map((corner) => {
    const scaled = corner.map((v, i) => v * scale[i]);
    const turned = rotate(scaled, rotation);
    return project(turned.map((v, i) => v + position[i]));
  });

  // The light is a direction in the plane of the screen: the pad's x/y, centred.
  const lightX = lx * 2 - 1;
  const lightY = ly * 2 - 1;

  for (const [a, b] of EDGES) {
    const [x1, y1, d1] = points[a];
    const [x2, y2, d2] = points[b];
    const depth = (d1 + d2) / 2;

    // How much this edge faces the light, from its own direction on screen.
    const ex = x2 - x1;
    const ey = y1 - y2;
    const length = Math.hypot(ex, ey) || 1;
    const facing = Math.abs((ex / length) * lightX + (ey / length) * lightY);

    ctx.strokeStyle = wire;
    ctx.globalAlpha = 0.25 + 0.75 * facing * Math.min(1, depth);
    ctx.lineWidth = 0.7 + depth * (0.6 + facing);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  for (const [x, y, depth] of points) {
    ctx.fillStyle = wire;
    ctx.beginPath();
    ctx.arc(x, y, 1.2 + depth, 0, Math.PI * 2);
    ctx.fill();
  }
}

// One effect for the drawing. It reads six signals; any of them moving redraws the cube, and
// nothing has to say so.
effect(draw);
addEventListener("resize", draw);

effect(() =>
  show({
    position: state.position(),
    rotation: state.rotation(),
    scale: state.scale(),
    light: state.light(),
    perspective: state.perspective(),
  })
);

document.querySelector("#code").textContent = `gui.addVector("Position", state.position, {
  min: -3, max: 3, step: 0.05,
});

// one range per axis: yaw and roll go all the way round, pitch only half
gui.addVector("Rotation", state.rotation, {
  min: [-180, -90, -180],
  max: [180,  90,  180],
  step: 1,
});

// invertY, so that "up" on the pad is up in the scene
gui.addPad("Light", state.light, { invertY: true, height: 96 });

// the renderer just reads the same signals
effect(() => {
  const [x, y, z] = state.position();
  ...
});`;
highlightAll();
