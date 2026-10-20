// The declarations, checked against the way the README and the demos use the library. Nothing
// here runs: compiling it is the test, and every @ts-expect-error has to stay an error.

import GUI, { Controller, Section, Tab } from "guspira/gui";
import {
  signal, computed, effect, effectRAF, batch, untrack, tweened, easings,
  createScheduler, frame, microtask, isSignal, toSignal,
} from "guspira/reactive";
import type { Signal, Tweened, ReadonlySignal } from "guspira/reactive";
import { createParams, readStorage, writeStorage } from "guspira/params";
import { createPresetStore, copyText } from "guspira/presets";
import { mixColors, mixRgb, hexToRgb, rgbToHex, isHexColor, colorCodec } from "guspira/color";
import { bindKey } from "guspira/keyboard";
import { setRandomSource, random, randomInRange, randomElement, randomBool, randomHexColor } from "guspira/random";
import { snap, precision, formatFloat } from "guspira/format";
import { createStats } from "guspira/stats";
import { curveToValue, valueToCurve, normalizeCurve, curveFitsRange, assertCurveRange } from "guspira/curve";
import RangeSlider from "guspira/range-slider";
import StatsGraph from "guspira/stats-graph";
import * as everything from "guspira";
import type { Params, PresetStore, Curve, GUIOptions } from "guspira";

// --- signals ------------------------------------------------------------------------------
const count = signal(400);
const n: number = count();
count.set(800);
count.update((v) => v * 2);
const peeked: number = count.peek();
// @ts-expect-error a number signal does not take a string
count.set("many");

const doubled = computed(() => count() * 2);
const d: number = doubled();
doubled.stop();
// @ts-expect-error a computed cannot be written
doubled.set(1);

const stop = effect(() => {
  const id = setInterval(() => {}, 100);
  return () => clearInterval(id);
});
effect(() => (document.title = String(count())));
stop.pause();
stop.resume();
stop.run();
stop();

const queue = createScheduler();
const queued = effect(() => count(), { scheduler: queue });
const ran: number = queue.flush();
const waiting: number = queue.size;
queue.pause();
queue.resume();
queued.stop();
effect(() => count(), { scheduler: frame, lazy: true });
effect(() => count(), { scheduler: microtask });
effect(() => count(), { scheduler: (job) => job.run() });
effectRAF(() => count());
const custom = createScheduler((flush) => {
  const id = setTimeout(flush, 0);
  return () => clearTimeout(id);
});
custom.clear();

const total: number = batch(() => {
  count.set(1);
  return count.peek();
});
const quiet: number = untrack(() => count());

const radius = tweened(1, 400, easings.cubicOut);
radius.set(10);
const heading: number = radius.target();
radius.target.set(4);
radius.update((v) => v + 1);
radius.reset(0.5);
radius.duration = 0;
radius.easing = easings.elasticOut;
const tint: Tweened<string> = tweened("#ffb347", 700, easings.cubicOut, mixColors);
tint.set("#7fd4ff");
// @ts-expect-error a string cannot travel without an interpolator
tweened("#ffb347", 700);

const maybe: unknown = count;
if (isSignal(maybe)) maybe.peek();
const wrapped: Signal<number> = toSignal(7);
const passed: Signal<number> = toSignal(count);
const readOnly: ReadonlySignal<number> = doubled;

// --- params and presets ---------------------------------------------------------------------
const DEFAULTS = {
  count: 500,
  speed: 1.5,
  palette: "ember",
  trails: true,
  range: [0.2, 0.8],
  glow: [1, 0.42, 0.15],
  tint: "#ff8a3d",
};

const params = createParams(DEFAULTS, {
  storageKey: "my-sketch",
  exclude: ["trails"],
  url: true,
  migrate: (stored) => {
    if ("density" in stored) stored.count = stored.density;
    return stored;
  },
  ease: { duration: 350, easing: easings.cubicOut, skip: ["count"], interpolate: { glow: mixRgb } },
});
const speed: number = params.speed();
params.palette.set("ice");
const destination: number[] = params.range.target();
const applied: string[] = params.$apply({ count: 1200, nonsense: true });
const snapshot = params.$snapshot();
const maybeCount: number | undefined = snapshot.count;
params.$reset();
params.$reset(["count", "speed"]);
params.$ease(0);
params.$flush();
params.$clear();
params.$stop();
const query: string = params.$toQuery();
const keys: string[] = params.$keys;
// @ts-expect-error not one of the parameters
params.nonsense;
// @ts-expect-error not a key of the defaults
createParams(DEFAULTS, { exclude: ["nonsense"] });
createParams({ a: 1 }, { ease: 400, url: ["a"], delay: 100 });
const typedStore: Params<{ a: number }> = createParams({ a: 1 });
const stored: Record<string, unknown> = readStorage("key");
const wrote: boolean = writeStorage("key", { a: 1 });

const presets = createPresetStore(params, {
  builtin: { ember: { speed: 0.2, count: 4096 }, ice: { palette: "ice" } },
  storageKey: "my-sketch-presets",
  onApply: (name, applied) => console.log(name, applied.join()),
});
presets.apply("ember");
presets.apply({ speed: 2 });
presets.load("mine");
presets.save("mine");
presets.remove("mine");
presets.markCustom();
presets.exportFile("look");
presets.exportFile("look", presets.snapshot());
presets.importFile(new File(["{}"], "look.json")).then((keys) => keys.length);
const current: string = presets.current();
const names: string[] = [...presets.builtinNames(), ...presets.userNames()];
const json: string = presets.toJSON();
const asStore: PresetStore<typeof DEFAULTS> = presets;
// @ts-expect-error a built-in preset holds values of the parameters' own types
createPresetStore(params, { builtin: { broken: { speed: "fast" } } });
copyText("text").then((ok: boolean) => ok);

// --- the panel --------------------------------------------------------------------------------
const options: GUIOptions = { storageKey: "panel", expanded: true, className: "gui-light", onBeforeRandomize: () => {} };
const gui = new GUI("Sketch", document.body, options);
new GUI();
gui.show().hide();

const slider = gui.addSlider("Speed", params.speed, 0.1, 10, 0.1, {
  onChange: (v) => v.toFixed(1),
  disabledWhen: () => params.trails(),
  title: "How fast",
  curve: "log",
});
slider.el.value = 2;
slider.signal.set(3);
slider.randomize?.();
slider.randomize = () => params.speed.set(randomInRange(1, 2));
slider.randomize = null;
slider.setVisible(false).setDisabled(true);
slider.labelEl?.textContent;
gui.addSlider("No step", signal(0.5), 0, 1);
gui.addSlider("Plain value", 0.5, 0, 1, 0.01);
// @ts-expect-error options go after the step
gui.addSlider("Speed", params.speed, 0, 10, { onChange() {} });
// @ts-expect-error a slider needs a number
gui.addSlider("Palette", params.palette, 0, 10, 1);
// @ts-expect-error a computed cannot be bound to a control that writes
gui.addSlider("Doubled", doubled, 0, 10, 1);

gui.addRangeSlider("Size", params.range, 0, 1, 0.05, { curve: 2 });
gui.addCheckbox("Trails", params.trails, { onChange: (on) => on === true });
const select = gui.addSelect("Palette", params.palette, ["ember", "ice"], { onChange: (v) => v.length });
select.setOptions(["ember", "ice", ["mono", "Monochrome"]]);
gui.addSelect("Numbers", signal(2), [1, 2, 3]);
gui.addSegmented("Blend", signal("add"), ["over", "add", "screen"]);
gui.addColor("Tint", params.tint);
gui.addColor("Glow", params.glow, { format: "rgb" });
gui.addColor("Sky", signal({ h: 200 }), {
  format: {
    toHex: (v) => (v.h > 100 ? "#0000ff" : "#ff0000"),
    fromHex: (hex, previous) => ({ h: hex === "#808080" ? previous.h : 0 }),
  },
});
// @ts-expect-error an array needs a format saying what it holds
gui.addColor("Glow", params.glow);
gui.addTextInput("Name", signal("guspira"), { placeholder: "untitled" });
gui.addTextArea("Notes", signal("x"), { rows: 3, spellcheck: false });
gui.addNumber("Seed", signal(1), { min: 0, step: 1, scrub: false });
const vector = gui.addVector("Rotation", signal([0, 0, 0]), {
  min: [-180, -90, -180],
  max: [180, 90, 180],
  step: 1,
  axes: ["yaw", "pitch", "roll"],
});
vector.inputs[0].focus();
gui.addPad("Aim", signal([0.5, 0.5]), { invertY: true, height: 96 });

const stats = createStats();
const frameTimer = stats.timer("frame", { average: 250 });
const fps = stats.fps({ window: 500 });
const drawn = stats.counter("drawn");
frameTimer.start().end().tick();
fps.tick();
drawn.clear().add().add(3).sample(9);
stats.flush();
const reading: number = frameTimer();
const all: number = stats.counters().length;

const graph = gui.addGraph("Frame", frameTimer, { min: 0, over: 16.7, pausedWhen: () => params.trails() });
graph.el.over = 8;
gui.addGraph("Breakdown", [frameTimer, drawn], { series: ["Frame", "Drawn"], stacked: true, samples: 48, interval: 200 });
gui.addMonitor("FPS", fps, { format: (v) => v.toFixed(0), below: 55 });
gui.addMonitor("Status", signal("ok"), { format: (v) => v.toUpperCase() });
gui.addMonitor("Doubled", doubled);

const button = gui.addButton("Export", function () {
  this.textContent = "saved";
});
button.setLabel("Again");
gui.addButtons(null, [{ label: "Save", onClick: () => {} }, { label: "Load", onClick: () => {}, title: "Load it" }]);
gui.addFileButton("Load model…", (file) => file.name, { accept: ".glb" }).fileInput.click();
gui.addRandomizeButton("Randomize", () => {}, { scope: "following", key: null });
gui.addLabel("A label");
gui.addText("Free <b>HTML</b>.", { visibleWhen: () => true });
gui.addSeparator();
gui.addElement(document.createElement("canvas"), { label: "Custom" }).el.getContext("2d");

const tab: Tab = gui.addTab("Look");
const section: Section = gui.addSection("Colour", { open: false, collapsible: true, visibleWhen: () => true });
gui.endSection();
tab.select();
gui.selectTab(0);
section.setOpen(false).toggle();
const open: boolean = section.open();
const late = gui.into(section, () => gui.addSlider("Late", signal(1), 0, 2, 0.1));
late.destroy();
gui.into(tab).addLabel("Sticky");
gui.randomizeAll();
gui.randomizeAll(slider);

const rows = gui.addPresets(presets, { label: "style", saveLabel: "Keep", onImportError: (e) => console.warn(e) });
rows.builtin?.el.value;
rows.refresh("mine");
rows.load.click();

// a control the toolkit does not ship
const row: Controller = gui.createRow("Dial", { disabled: true });
const dial = row.labelled(document.createElement("div"));
row.row.append(dial);
row.bind(() => (dial.textContent = String(count())));
row.onDestroy(() => {});
row.randomize = () => count.set(randomInRange(0, 360));
const isController: boolean = section instanceof Controller;

gui.destroy();

// --- the rest ---------------------------------------------------------------------------------
const unbind = bindKey("KeyC", (e) => e.code, { shift: true, repeat: true, preventDefault: true });
unbind();
// @ts-expect-error not an option
bindKey("KeyC", () => {}, { control: true });

setRandomSource(() => 0.5);
const rolled: number = random() + randomInRange(0, 1);
const picked: string = randomElement(["a", "b"]);
const flip: boolean = randomBool(0.2);
const hex: string = randomHexColor();

const snapped: number = snap(0.37, 0.05, 0, 1);
const decimals: number = precision(0.05);
const text: string = formatFloat(0.37, 0.05);

const [r, g, b] = hexToRgb("#ff6500");
const back: string = rgbToHex([r, g, b]);
const mixedHex: string = mixColors("#ff6500", "#0066ff", 0.5);
const mixedRgb: number[] = mixRgb([1, 0, 0], [0, 0, 1], 0.5);
const hexish: boolean = isHexColor("#ff6500");
const codec = colorCodec<number[]>("rgb");
const asHex: string = codec.toHex([1, 0, 0]);

const curve: Curve = normalizeCurve("log");
const value: number = curveToValue(0.5, 20, 20000, curve);
const position: number = valueToCurve(value, 20, 20000, "log");
const fits: boolean = curveFitsRange("log", 0, 1);
assertCurveRange(2, 0, 1, "here");

const element = document.createElement("range-slider");
element.min = 0;
element.max = "10";
element.curve = "log";
element.value = [2, 8];
const held: number | [number, number] = element.value;
const isSlider: boolean = element instanceof RangeSlider;

const plot = document.createElement("stats-graph");
plot.source = () => (Math.random() > 0.5 ? 12 : undefined);
plot.series = ["a", "b"];
plot.push([1, 2]).push(3);
plot.over = 16;
plot.min = undefined;
const latest: number = plot.current;
const isGraph: boolean = plot instanceof StatsGraph;

// everything is also on the root entry
const viaRoot = new everything.GUI("Root");
const rootSignal: Signal<number> = everything.signal(1);
const rootStats = everything.createStats();
// @ts-expect-error the curated root leaves colorCodec to guspira/color
everything.colorCodec;
