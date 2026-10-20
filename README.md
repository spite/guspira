# Guspira

A small reactive GUI toolkit for creative-coding sketches. Signals, sliders, tabs, presets.

[![npm](https://img.shields.io/npm/v/guspira.svg)](https://www.npmjs.com/package/guspira)

```js
import GUI from "guspira/gui";
import { signal, effect } from "guspira/reactive";

const count = signal(400);

const gui = new GUI("Sketch");
gui.addSlider("Count", count, 10, 2000, 10);

// nothing to poll, nothing to wire up:
effect(() => rebuild(count()));
```

Every control binds to a **signal**, and the signal *is* the value. Move the slider and the
signal updates; set the signal and the slider moves. There is no second copy of the state to
keep in step, which is the thing dat.gui-style controllers spend most of their code on.

## Install

```sh
npm install guspira
```

There are no dependencies. The panel's appearance lives entirely in one stylesheet, so import
that alongside the modules — without it the controls work and look like nothing at all:

```js
import GUI from "guspira/gui";
import { signal, effect } from "guspira/reactive";
import "guspira/css/gui.css";
```

If your bundler doesn't take CSS through an import, link it from wherever it serves files:

```html
<link rel="stylesheet" href="/node_modules/guspira/css/gui.css" />
```

Import from `guspira` for everything at once, or from a subpath to take only the part you
need — `guspira/reactive`, `guspira/params`, `guspira/color`, `guspira/presets`,
`guspira/keyboard`, `guspira/random`, `guspira/format`, `guspira/range-slider`,
`guspira/stats`, `guspira/stats-graph`, `guspira/curve`.
`guspira/reactive` has no DOM dependency at all, so it stands on its own — in a worker, in a
test, in node.

The package entry is `src/`, not a bundle: your tooling sees the modules as they were written,
and drops the ones you never import.

### TypeScript

Declarations ship with the package, one `.d.ts` beside each module, so every entry above is
typed with nothing to install or configure:

```ts
import GUI from "guspira/gui";
import { signal, type Signal } from "guspira/reactive";
import { createParams } from "guspira/params";

const params = createParams({ count: 400, palette: "warm", range: [0.2, 0.8] });
params.count;                 // Signal<number>
params.palette.set(3);        // error: this parameter holds a string

const gui = new GUI("Sketch");
gui.addSlider("Count", params.count, 10, 2000, 10, { onChange: (v) => v.toFixed(0) });
gui.addSlider("Palette", params.palette, 0, 1, 0.1);   // error: a slider binds a number
```

A control checks the signal it is handed against what it writes, `onChange` is given that
type, and a `computed` is refused by anything that would write to it. The names worth knowing
are `Signal<T>`, `ReadonlySignal<T>`, `Tweened<T>`, `Params<T>` and `PresetStore<T>`, with the
option types beside the functions that take them. `document.createElement("range-slider")` and
`"stats-graph"` are typed as their elements.

### Without a build step

`dist/guspira.iife.min.js` puts the same API on a `Guspira` global, with nothing to install:

```html
<link rel="stylesheet" href="https://unpkg.com/guspira@0.1.1/dist/guspira.min.css" />
<script src="https://unpkg.com/guspira@0.1.1/dist/guspira.iife.min.js"></script>
<script>
  const { GUI, signal } = Guspira;

  const count = signal(400);
  const gui = new GUI("Sketch");
  gui.addSlider("Count", count, 10, 2000, 10);
</script>
```

Or as a module, straight from the CDN — no bundler, no install:

```html
<script type="module">
  import { GUI, signal } from "https://cdn.jsdelivr.net/npm/guspira@0.1.1/dist/guspira.min.js";
</script>
```

unpkg and jsdelivr both mirror the package, and either serves either file. Pin the version in
anything meant to keep working: an unpinned URL follows whatever `latest` becomes.

### From the repo

The toolkit is plain ES modules with nothing underneath it, so copying `src/` and
`css/gui.css` into a project works too — import them by path and there is nothing else to
bring along:

```js
import GUI from "./src/gui.js";
import { signal, effect } from "./src/reactive.js";
```

To run this repo itself, any static server will do:

```sh
npm start          # then open http://localhost:3000/
```

The root page explains the two halves — signals, and the panel built on them — with both
running live on it. `/demo/` is the gallery.

## Demos

`demo/` is a gallery — one page per part of the toolkit, each a working sketch with its panel
beside it and its source in `demo/<name>.js`.

| | |
| --- | --- |
| [Warp field](demo/warp.html) | the whole toolkit in one sketch: a GPU noise field where every control is a uniform |
| [Controls](demo/controls.html) | every control, each showing the signal it is bound to |
| [Vectors & pads](demo/vector.html) | array signals: a row of axes, and an `[x, y]` you can drag |
| [Colour](demo/colour.html) | one swatch, four value shapes, a codec of your own, and mixing through OKLab |
| [Options](demo/options.html) | `onChange`, `disabled`, `visibleWhen`, `title`, `randomizable` |
| [Tabs & sections](demo/structure.html) | grouping, folding, conditional sections, remembered layout |
| [Controllers](demo/controllers.html) | building and tearing down rows at runtime |
| [Extending](demo/extending.html) | custom controls from `createRow` + `bind` + `onDestroy` |
| [Reactivity](demo/reactivity.html) | signals, computed, batching — with every effect run counted |
| [Values that travel](demo/easing.html) | tweens: the panel shows the target, your code reads the journey |
| [Rendering](demo/rendering.html) | `render()` as an effect: draw only when something changed |
| [Params & persistence](demo/persistence.html) | a typed store that survives reloads and travels in a link |
| [Presets](demo/presets.html) | built-in and saved looks, export and import |
| [Randomize & keyboard](demo/randomize.html) | rerolls, key bindings, a seeded random source |
| [Theming](demo/theming.html) | restyle the panel live through its CSS variables |
| [Stats](demo/stats.html) | counters after rStats: timers, framerate, and where a frame went |
| [`<range-slider>`](demo/range-slider.html) | the slider element alone, in a plain form |

## Reactivity

`src/reactive.js` is a standalone module — no imports, no DOM. Use it on its own in a sketch
that doesn't want a panel, in a worker, or in node:

```js
import { signal, computed, effect, effectRAF, batch, untrack, tweened } from "guspira/reactive";

const count = signal(400);
count();              // read (and subscribe, inside an effect)
count.set(800);       // write
count.update((v) => v * 2);
count.peek();         // read without subscribing

const doubled = computed(() => count() * 2);

const stop = effect(() => console.log(count()));   // runs now, and on every change
stop();                                            // unsubscribe

// an effect that returns a function is handing back its teardown
effect(() => {
  const id = setInterval(tick, 100);
  return () => clearInterval(id);   // before the next run, and on stop
});

batch(() => {   // one effect run for the whole block, not one per write
  count.set(1000);
  radius.set(2);
});
```

Signals compare before triggering, arrays element-wise — so a range slider handing back a
fresh `[min, max]` on every pointer move only fires effects when the numbers actually change.

**An effect created inside another belongs to it.** It is disposed when the parent re-runs and
when the parent stops, on the same terms as a teardown function — so a branch that builds
effects does not accumulate a new one on every pass:

```js
effect(() => {
  if (mode() === "trail") {
    effect(() => draw(position()));   // replaced each time the outer effect re-runs
  }
});
```

`computed` is owned the same way. When you want one to outlive its creator, build it inside
`untrack` — nothing created there has a parent, and it lives until you stop it yourself.

**What a write costs.** A write collects its subscribers and drains them in one pass. A
`computed` is marked out of date the moment its source changes and recomputed for whoever
reads it first, so an effect reading a signal and things derived from it — however many levels
down — runs once and never sees a half-updated value. Effects that throw are reported and
skipped rather than taking the rest of the pass — one broken control cannot stop every other
control bound to the same signal. An effect that writes a signal it also reads is caught and
named instead of overflowing the stack.

**One effect per thing, not one effect over everything.** An effect re-tracks its whole
dependency set on each run, so a single effect reading 250 parameters pays 250 subscription
updates every time any one of them moves — about 30× the cost of 250 effects reading one
parameter each. `test/bench.mjs` measures it:

```
change 1 of 100 deps in one effect       6406 ns/op
change 1 of 100, one effect each          137 ns/op
```

Reach for the wide effect only when the work genuinely depends on everything (a snapshot, a
serialisation), and give it a scheduler so the burst collapses into one run.

### Values that travel

A tween is a signal whose value moves to where you put it instead of jumping there. Reading it
gives the value on its way; `.target()` gives the destination:

```js
import { tweened, easings } from "guspira/reactive";

const radius = tweened(1, 400, easings.cubicOut);

radius.set(10);
radius()             // 3.7, then 6.2, then 8.9… — what you draw
radius.target()      // 10 — where it is heading
radius.update((v) => v + 1)   // from the target, so two in a row add up
radius.target.set(4) // the same as radius.set(4): the value travels there
radius.reset(0.5)    // jump, no animation
radius.duration = 0  // duration and easing are writable, so a control can drive them
radius.easing = easings.elasticOut
```

Both readings are signals, so an effect on the value re-runs every frame of the animation
while one on the target re-runs once, when something actually changed.

`easings` ships eight curves — `linear`, `quadIn/Out/InOut`, `cubicOut`, `expoOut`, `backOut`,
`elasticOut` — and any `t => t` function of your own works. Two of them overshoot 0…1 on
purpose, which is the point for a number and clamps for a colour.

Arrays of numbers travel too, a component at a time — so a vector or an `[r, g, b]` colour
eases like anything else. A colour kept as an array is indistinguishable from a position kept
as one, so the perceptual path is asked for by name:

```js
createParams(defaults, { ease: { duration: 350, interpolate: { glow: mixRgb } } });
```

A tween travels between numbers by default. Pass an interpolator as the fourth argument and it
travels between anything — `mixColors` moves through OKLab, so the path between two colours
stays as bright as its ends instead of going through mud:

```js
import { mixColors } from "guspira/color";

const tint = tweened("#ffb347", 700, easings.cubicOut, mixColors);
tint.set("#7fd4ff");   // eases through the colours between
```

#### A whole store that travels

`createParams` takes the same idea as an option, and then this is the whole story: **the panel
writes and displays the target, your code reads the value.**

```js
const params = createParams(DEFAULTS, {
  storageKey: "my-sketch",
  ease: {
    duration: 450,
    easing: easings.cubicOut,
    skip: ["quality", "octaves", "paused"],
  },
});

gui.addSlider("Scale", params.scale, 0, 8, 0.05);   // writes and shows the destination
gl.uniform1f(uScale, params.scale());                // draws the journey
params.$ease(0);                                     // retime; 0 arrives at once
```

Nothing needs telling which is which. A control binds to `params.x.target()` on its own — it
has to, or the thumb would be rewritten from the animation on every frame and fight your hand.
Saves, presets and links record the target, so a file never captures a value mid-flight. And on
a parameter that does not travel, the target *is* the signal, so all of this stays true.

**What can travel is decided by the value; what should is decided by you.** Numbers ease, hex
colours ease through OKLab, arrays of numbers ease a component at a time, and anything else —
booleans, option strings — has no meaningful path between two of them. `only` and `skip` narrow it further.

The [warp demo](demo/warp.html) drives its whole shader this way, behind its **Ease** slider,
and the [easing demo](demo/easing.html) puts both readings on screen at once.

## Scheduling, and render() as an effect

An effect runs synchronously by default, which means five writes in a row rebuild your geometry
five times. Deferring the re-run fixes that, and *when* it re-runs is a real choice:

```js
effect(fn)                            // synchronously, on every change
effect(fn, { scheduler: microtask })  // once at the end of the turn — no added latency
effect(fn, { scheduler: frame })      // once per animation frame (this is effectRAF)
effect(fn, { scheduler: myQueue })    // when you say so
```

`frame` and `microtask` are ready-made shared queues; `createScheduler()` gives you your own,
and passing it a driver makes it flush itself. `effectRAF` is the convenient case, not the good
one. It books its own animation frame, so in a sketch that already has a render loop there are
two schedulers racing: your rebuild may land before or after the draw that needed it, depending
on registration order. When you own a frame loop, own the flush point too:

```js
import { createScheduler, effect } from "guspira/reactive";

const renderQueue = createScheduler();

// Reading the params inside is the subscription — there is no dependency list to maintain.
effect(() => draw(params.count(), params.hue()), { scheduler: renderQueue });

function loop(t) {
  requestAnimationFrame(loop);
  if (animating) time.set(t / 1000);
  renderQueue.flush();   // pending work runs here, in a defined order, and only if there is any
}
```

That is `render()` as an effect. Two things fall out of it:

- **Nothing changed, nothing drawn.** An idle sketch flushes an empty queue and burns no time.
  `renderQueue.size` tells you whether there is work; `pause()`/`resume()` stop and catch up the
  whole queue at once, which is the right granularity for a hidden panel or a paused sketch.
- **Animation stops being a special case.** Keep a `time` signal and write it from the loop.
  An effect that reads it redraws every frame; one that doesn't, doesn't. Animating and
  reacting to a slider become the same mechanism.

Work queued *during* a flush lands in the next one, so an effect that writes a signal another
effect reads can't spin the current pass forever.

The [rendering demo](demo/rendering.html) runs both modes side by side with the draw count per
second on screen.

## Controls

Every `add*` takes a label, a signal, and whatever that control needs. They all return a
[controller](#controllers).

```js
gui.addSlider("Speed", params.speed, 0, 10, 0.1);
gui.addRangeSlider("Size", params.sizeRange, 0.1, 3, 0.05);   // signal holds [min, max]
gui.addCheckbox("Paused", params.paused);
gui.addSelect("Palette", params.palette, ["warm", "cool"]);   // or [[value, label], …]
gui.addSegmented("Blend", params.blend, ["over", "add", "screen"]);   // the same, as buttons
gui.addColor("Tint", params.tint);                            // "#ff6500" by default
gui.addColor("Glow", params.glow, { format: "rgb" });         // …or [r, g, b] in 0..1
gui.addTextInput("Name", params.name);
gui.addTextArea("Notes", params.notes, { rows: 3 });
gui.addNumber("Seed", params.seed, { min: 0, step: 1 });
gui.addVector("Position", params.position, { min: -10, max: 10, step: 0.1 });
gui.addPad("Aim", params.aim, { invertY: true });             // signal holds [x, y]
gui.addMonitor("FPS", fps, { format: (v) => v.toFixed(1), below: 55 });  // read-only
gui.addGraph("Frame", frame, { over: 16.7 });                 // plotted over time — see Stats
gui.addButton("Export", () => save());
gui.addButtons(null, [                                        // several on one row
  { label: "Export", onClick: save },
  { label: "Import", onClick: load },
]);
gui.addFileButton("Load model…", (file) => load(file), { accept: ".glb" });
gui.addRandomizeButton("Randomize", () => rebuild());
gui.addLabel("Section heading");
gui.addText("Free <b>HTML</b>.");
gui.addSeparator();
gui.addElement(myCustomWidget, { label: "Custom" });
```

A slider's value can be dragged, nudged with the arrow keys, or typed — click the number, or
press <kbd>Enter</kbd> with the slider focused. Leave `step` out and it takes a hundredth of
the range, rounded down to a power of ten. Stops are counted from `min`, so a slider from 1 to
10 in steps of 2 lands on 1, 3, 5, 7 and 9 — and `max` stays reachable when it falls between
two of them.

**A slider's track need not be linear.** `curve` bends it — a number is an exponent on the
track position, and `"log"` gives every ratio the same width:

```js
gui.addSlider("Radius", radius, 0, 10, 0.01, { curve: 2 });        // low end gets more room
gui.addSlider("Detail", detail, 0, 1, 0.01, { curve: 0.5 });       // high end does
gui.addSlider("Frequency", freq, 20, 20000, 1, { curve: "log" });  // equal per decade
```

Same slider from 0 to 10, read at three points along the track:

| track | `curve: 1` | `curve: 2` | `curve: 0.5` |
|---|---|---|---|
| 25% | 2.5 | 0.63 | 5.0 |
| 50% | 5.0 | 2.5 | 7.1 |
| 75% | 7.5 | 5.6 | 8.7 |

`step` stays in real units, so snapping, the typed editor, presets and persistence are
untouched, and an arrow key moves by exactly one step wherever you are on the track. A `"log"`
track needs `min` and `max` non-zero and the same sign — zero has no logarithm — and says so at
construction rather than leaving you a thumb that will not move. A number curve is applied to
the normalised position, so it is happy with a range that crosses zero.

Randomising a curved slider rolls along the **track**, not across the values: on a log slider
from 20 to 20000, a uniform roll of the value would land above 2 kHz nine times in ten.

**Number fields scrub.** Drag one sideways and it counts up and down: one step per pixel, ten
per pixel with <kbd>Shift</kbd>. Without a `step` the rate comes from the stated range, so a
whole sweep stays within a hand's reach; without a range either, it counts in ones. A press
that never travels is still a click, which focuses the field and selects it so the first
keystroke replaces the value, and a field already being edited is left alone so selecting a
digit with the mouse does what it looks like. `{ scrub: false }` turns it off.

A typed number is held to `min`, `max` and `step` the same as a dragged one. The field keeps
what you are typing while it has focus, and shows what was stored once focus leaves.

`addSegmented` is `addSelect` with the options on show — worth it for two to four choices,
where a dropdown hides the alternatives behind a click. It is a radiogroup: one tab stop for
the whole control, arrows to move within it.

`addTextArea` takes the full width with its label above, the same as a graph, because a box
three lines tall has nothing to line up with a label beside it.

### Colour

The signal holds whatever your sketch wants to hold, and the control converts — because the
alternative is your sketch converting on every read, which is the friction worth removing:

| `format` | the signal holds |
| --- | --- |
| `"hex"` *(default)* | `"#ff6500"` |
| `"rgb"` | `[1, 0.4, 0]` — 0..1, what a shader wants |
| `"rgb255"` | `[255, 101, 0]` |
| `{ toHex, fromHex }` | anything at all |

Nothing is inferred. `addVector` can count its own axes because array length is unambiguous,
but `[1, 0, 0]` is pure red in 0..1 and near-black in 0..255 — so the default stays hex and
anything else says so.

A codec of your own is two functions, and `fromHex` is handed the value it is replacing:

```js
gui.addColor("Tint", signal([200, 1, 0.5]), {
  format: {
    toHex: ([h, s, l]) => hslToHex(h, s, l),
    fromHex: (hex, previous) => {
      const [h, s, l] = hexToHsl(hex);
      return [s === 0 ? previous[0] : h, s, l];   // a grey keeps the hue it came from
    },
  },
});
```

That second argument is why HSL and OKLCH are usable rather than merely accepted: hex cannot
carry a hue through grey, so without the value it replaces, dragging through a desaturated
colour would snap the hue to red on the way out.

The conversion is deliberately one-way most of the time. Value → hex runs on every display
update and never writes back, so a value carrying more than 8-bit sRGB keeps all of it. Hex →
value runs only when someone picked from the swatch — the one moment quantising to what the
swatch can represent is honest. Editing *in* a wider space needs channel sliders rather than a
swatch, which is a different control; `createRow` builds it, as
[demo/extending.html](demo/extending.html) shows.

Every format, a custom codec and the mixing are in [`demo/colour.html`](demo/colour.html).

### Values with more than one number

`addVector` binds one signal holding an array. How many axes it draws comes from the value it
is given, so the same call makes a vec2, a vec3 or a vec4, and `min`, `max` and `step` each take
either one number for every axis or an array with an entry per axis:

```js
const rotation = signal([0, 0, 0]);

gui.addVector("Rotation", rotation, {
  min: [-180, -90, -180],   // yaw and roll go all the way round, pitch only half
  max: [180, 90, 180],
  step: 1,
  axes: ["yaw", "pitch", "roll"],   // default is x, y, z, w
});
```

Editing one axis writes a **new** array rather than mutating the one your sketch is holding.
Signals compare arrays element-wise, so rewriting one with the same numbers still costs its
readers nothing.

`addPad` drags an `[x, y]` around a square. Both axes default to `0..1`, and `min`/`max`/`step`
take one number for both or `[x, y]` when they differ:

```js
gui.addPad("Light", signal([0.5, 0.5]), { invertY: true, height: 96 });
```

The pad reads top-left downwards, the way screen coordinates do; `invertY` flips it so up is
larger, the way most graphics maths has it. It captures the pointer, so a drag that leaves the
pad keeps working, and it is a tab stop: arrows move by one step, <kbd>Shift</kbd> by ten.

Both are in [`demo/vector.html`](demo/vector.html), driving a wireframe cube.

Everything the panel does is reachable without a mouse: the title and section headings are
buttons that fold with <kbd>Enter</kbd>, the tab bar takes <kbd>←</kbd>/<kbd>→</kbd> and
<kbd>Home</kbd>/<kbd>End</kbd> as a tablist should, and <kbd>Alt</kbd>+<kbd>R</kbd> rerolls the
control you are on — a shortcut on the row rather than a tab stop per label, so tabbing to the
twentieth slider still takes twenty stops and not forty. Every control is named after its
row's label, and a section's rows are a group named after its title.

### Options

Every control takes an optional trailing options object:

| Option | Meaning |
| --- | --- |
| `onChange` | Called on user input, after the signal is set. Not called on programmatic writes. |
| `disabled` / `disabledWhen` | Greys the row out and stops it responding, to the keyboard as well as the pointer: the row is `inert`. |
| `visible` / `visibleWhen` | `false` removes the row entirely. |
| `title` | Tooltip on the label. |
| `randomizable` | `false` to keep the control out of label-click and panel randomisation. |

The two state options come in pairs, and both names accept both kinds of value — a boolean for
a state that never changes, a predicate for one that does. The `When` spelling is the one to
reach for with a predicate, because it says out loud that the rule keeps holding:

```js
gui.addSlider("ISO", params.iso, 50, 6400, 50, {
  disabledWhen: () => params.mode() === "auto",   // a rule, re-evaluated
});

gui.addSlider("Build", params.build, 0, 9, 1, {
  disabled: true,                                  // a fact, decided once
});
```

A predicate re-evaluates whenever anything it reads changes, so the rule lives in one place
instead of in every handler that might affect it. `addSection` takes the same pair, which hides
or greys a whole group at once.

### Structure

```js
gui.addSelect("Preset", params.preset, presetNames); // above the tabs: always visible

gui.addTab("Motion");                    // following controls go in this tab
gui.addSection("Field");                 // …and in this section
gui.addSlider("Speed", params.speed, 0, 2, 0.01);

gui.addSection("Attractor", { visibleWhen: () => params.field() === "attractor" });
gui.addSlider("Scale", params.scale, 0.2, 3, 0.05);

gui.addTab("Look");
gui.addSection("Colour", { open: false }); // folded to start
```

Sections fold when their title is clicked. With a `storageKey` on the GUI, which section is
folded and which tab is open are remembered between reloads:

```js
const gui = new GUI("Sketch", document.querySelector("#gui"), { storageKey: "my-sketch" });
```

Building a panel is sequential, but adding a row later is not. `into()` targets a tab or
section whenever you need it — for a button that appends to a section built long before:

```js
const layers = gui.addSection("Layers");
gui.addButton("Add layer", () => {
  gui.into(layers, () => gui.addSlider(`Layer ${n}`, opacity, 0, 1, 0.01));
});
```

The handles `addTab` and `addSection` return do the rest:

```js
const look = gui.addTab("Look");
const colour = gui.addSection("Colour");
gui.addSection("Notes", { collapsible: false });   // a plain heading
gui.endSection();                                  // back out: what follows sits in the tab

look.select();          // or gui.selectTab(1), by position
colour.setOpen(false);  // fold it; colour.toggle() flips it
```

The panel itself takes its options as the constructor's third argument:

| Option | Meaning |
| --- | --- |
| `storageKey` | Remember the open tab, folded sections and whether the panel is collapsed. |
| `expanded` | Start unfolded or folded. Left out, a window narrower than 950px starts folded. |
| `visible` | `false` builds the panel hidden; `gui.show()` and `gui.hide()` switch it later. |
| `className` | An extra class on the container, `"gui-light"` for the light theme. |
| `onBeforeRandomize` | Called before any reroll: a label click, <kbd>Alt</kbd>+<kbd>R</kbd>, the button or its key. |

### Randomizing

Clicking a control's label rerolls it. `addRandomizeButton` rerolls the whole panel and then
runs its callback — bound to <kbd>R</kbd> unless you pass another `key` (or `key: null`).
Controls marked `randomizable: false`, and any control currently disabled — on its own row or
by the section around it — are left alone. The whole reroll is one `batch()`, so an effect
reading several of the controls runs once.

```js
gui.addRandomizeButton("Randomize (R)", () => rebuild());
gui.addSlider("Count", params.count, 100, 10000, 100);
gui.addSlider("Seed", params.seed, 0, 9999, 1, { randomizable: false });

gui.randomizeAll();                                        // by hand
gui.addRandomizeButton("Roll these", rebuild, { scope: "following" });  // only what comes after
```

A control rolls across its whole declared range, which is not always the range worth landing
in. Its roll lives on the controller as `randomize`, and replacing it narrows the reroll
without narrowing what the control can be dragged to. The label, <kbd>Alt</kbd>+<kbd>R</kbd>
and the randomize button all go through the property, so they cannot disagree — and clearing
it is the late equivalent of `randomizable: false`:

```js
const detail = gui.addSlider("Detail", params.detail, 0, 64, 1);
detail.randomize = () => params.detail.set(Math.round(randomInRange(8, 16)));
detail.randomize = null;  // stop rerolling this one at all
```

Sketches using a seeded PRNG can point the toolkit at it, so a reroll is reproducible:

```js
import { setRandomSource } from "guspira/random";
setRandomSource(() => myPrng());
```

### Controllers

`add*` returns a handle on the row it built:

```js
const c = gui.addSlider("Radius", params.radius, 0, 4, 0.01);
c.row        // the .gui-row element
c.el         // the widget itself
c.signal     // the bound signal
c.labelEl    // its label
c.randomize  // its reroll — call it, replace it, or null it out
c.setVisible(false)
c.setDisabled(true)
c.destroy()  // removes the row and stops its effects
```

A few controls add their own: a select has `setOptions(list)` for a list that changes, a
button has `setLabel(text)`, and a vector has `inputs`, one per axis.

`destroy()` matters for panels that change shape at runtime — without it a removed row stays
subscribed to its signal, and neither is ever collected. `gui.destroy()` tears down the whole
panel the same way.

The same three pieces build controls the toolkit doesn't ship: `createRow` for the row, `bind`
for effects it owns, `onDestroy` for anything else that must be undone.

```js
GUI.prototype.addDial = function (label, value, opts = {}) {
  const sig = toSignal(value);
  const controller = this.createRow(label, opts);   // row, label, disabled, visibleWhen

  const widget = document.createElement("div");
  widget.className = "gui-control";                 // the same column the built-ins sit in
  controller.row.append(controller.labelled(widget)); // named after the row's label

  controller.bind(() => paint(sig()));              // an effect the row owns
  controller.onDestroy(() => removeEventListener("pointermove", move));
  controller.randomize = () => sig.set(randomInRange(0, 360));   // now it rerolls like the rest
  return controller;
};
```

Assigning `randomize` is the whole of joining in: the label, <kbd>Alt</kbd>+<kbd>R</kbd> and
`randomizeAll()` all read it. A row built while an effect is running does not belong to that
effect — it lives until `destroy()`, like every other row.

Give the widget `class="gui-control"` and it lines up with every other row. That class also
sets `min-width: 0`, which is the part worth knowing: a flex item will not shrink below its
content's intrinsic width without it, so a widget holding anything naturally wide — a number
input is about 160px — pushes the label out of the row instead of fitting the column.

[Extending demo →](demo/extending.html)

## Stats

Performance counters, after [rStats](https://github.com/spite/rstats), wired to signals. A
counter *is* a signal, with the measuring methods hanging off it the way a tweened signal
carries its `.target` — so anything that takes a signal takes a counter.

```js
import { createStats } from "guspira";

const stats    = createStats();
const fps      = stats.fps();
const frame    = stats.timer("frame");
const simulate = stats.timer("simulate");
const draw     = stats.timer("draw");
const drawn    = stats.counter("drawn");

gui.addGraph("Frame", frame, { min: 0, over: 16.7 });
gui.addGraph("Breakdown", [simulate, draw], { over: 16.7 });   // stacked
gui.addMonitor("FPS", fps, { format: (v) => v.toFixed(0) });

function loop() {
  frame.start();
  simulate.start(); step();   simulate.end();
  draw.start();     render(); draw.end();
  frame.end();
  fps.tick();
  stats.flush();        // one batched write for every counter
  requestAnimationFrame(loop);
}
```

`timer` measures the span between `start()` and `end()`; `tick()` is end-then-start, for the gap
between successive calls. `fps()` counts frames inside a rolling window rather than inverting one
frame, so a single long frame dents the figure instead of replacing it. `counter` is for things
you count rather than time — draw calls, particles — with `add()`, `sample()` and `clear()`.

`{ average: 250 }` reports the mean over a window. A raw per-frame millisecond figure is right
for a graph, where the spikes are the information, and unreadable as text — so it is per counter.
A counter built up with `add()` is averaged once per `flush()`, on the frame's total, so three
draw calls a frame read as 3 however they were counted.

`flush()` publishes every counter in one `batch()`, so a frame of measuring costs one pass of
effects however many counters there are. Nothing in `src/stats.js` touches the DOM: a sketch with
no panel can still measure itself, and the arithmetic is checked in node against a fake clock.

### `<stats-graph>`

The graph is a standalone custom element, like `<range-slider>` — no panel and no signals needed:

```html
<stats-graph min="0" max="33" over="16"></stats-graph>
<stats-graph stacked samples="48"></stats-graph>
```

```js
graph.source = () => currentFrameTime();   // it samples on its own clock
graph.push(12.4);                          // …or feed it by hand
```

A graph row runs the full width of the panel with its label and reading on a line above it,
rather than sitting in the control column — a wider track is more history, and a label centred
against a two-line legend has nothing to line up with.

When a stacked graph is given several counters it labels its own bands: `stats.timer("render")`
already knows its name, so no option is needed. Pass `{ series: ["Update", "Render"] }` for
plain signals, and with no names available it renders no legend rather than a misleading one.
Past the five `--gui-series-*` colours, further bands take generated hues, so two of them never
share a swatch.

**Pausing.** A graph pulls on its own clock, so a paused sketch does not stop it — the counters
simply hold their last value and the graph scrolls that flat line across, erasing the spike you
paused to look at. `pausedWhen` makes the source *decline* to sample instead, so the history
holds, and the plot dims to say it is held rather than flat:

```js
gui.addGraph("Frame", frame, { pausedWhen: () => params.paused() });
gui.addGraph("Frame", frame, { paused: true });   // a constant works, like `disabled`
```

Underneath, a `source` that returns `undefined` is declining to sample that frame — the
pull-side equivalent of simply not calling `push()`. Anything supplying its own `source` gets
the same control without needing the option at all.

`over` and `below` draw a dashed budget line and turn the reading beside it warm when crossed.
`addMonitor` takes the same two, so a bare readout can say it is past budget without needing a
plot to say it for it.
Without a `max` it scales to whatever it has seen. Two things it does that matter:

- **It samples on a clock, not on a change.** A value that holds still for a second is a second
  of information, not an absence of it — which is the one place a signal's change-driven model
  is the wrong tool, so the element owns a frame loop instead.
- **It does nothing while it cannot be seen.** Off screen, folded into a closed section, or in a
  collapsed panel all read as "not intersecting", and it stops sampling and drawing entirely.
  The one job of a performance monitor is to not be the thing slowing you down.

## Parameters and persistence

`createParams` builds one signal per key from a defaults object. The defaults double as the
schema: they fix the key set and the type of each value, so a stale save or a hand-edited link
can't put a string where a number belongs.

```js
import { createParams } from "guspira/params";

const params = createParams(
  { count: 65536, speed: 0.5, palette: "warm", paused: false },
  {
    storageKey: "my-sketch",  // persisted (debounced) to localStorage
    exclude: ["paused"],      // …except these
    url: true,                // ?count=2000&palette=cool overrides the stored value
    migrate: (stored) => stored, // rewrite an older save before it is applied
  }
);

params.count();          // it's just a signal
params.count.set(2048);
```

Helpers hang off the store under `$` names, so `Object.keys(params)` stays exactly the
parameters:

| Helper | |
| --- | --- |
| `params.$snapshot()` | plain object of the current values |
| `params.$apply(values)` | write a batch of values, skipping unknown keys and wrong types |
| `params.$reset()` | back to defaults — every key, `exclude`d ones included |
| `params.$toQuery()` | query string of everything that differs from defaults |
| `params.$ease(ms)` | retime every parameter that travels |
| `params.$flush()` | force the pending storage write |
| `params.$stop()` | stop persisting |
| `params.$clear()` | remove the stored save, and any write still waiting |

Writes are debounced and flushed on `pagehide`, so dragging a slider doesn't hammer
`localStorage` and closing the tab doesn't lose the last change.

Only what differs from the defaults is stored, and nothing is written until something changes.
A default you change later therefore reaches everyone who never moved that control, and
opening somebody's link does not replace your own save unless you go on to edit it.

The schema is checked all the way down: an array has to match element by element, a number has
to be finite, and where the default is a hex colour the value has to be one too.

## Presets

```js
import { createPresetStore } from "guspira/presets";

const presets = createPresetStore(params, {
  builtin: { calm: { speed: 0.2, count: 4096 }, chaos: { speed: 2, count: 500000 } },
  storageKey: "my-sketch-presets",
});

gui.addSection("Presets");
gui.addPresets(presets);   // picker, saved list, save / load / delete / export / import
```

Built-in presets are partial — a preset says only what it changes. User presets are full
snapshots in `localStorage`, and the same JSON goes in and out of a file. `presets.toJSON()`
gives you the whole state to paste into a bug report.

`presets.apply(name)` applies a built-in or, failing that, a saved preset of that name;
`presets.load(name)` is always the saved one, so a look saved under a built-in's name is still
reachable. The picker of built-ins only appears when there are some, and it sits out
panel-wide rerolls — rolling it would apply a whole preset over the roll.

`addPresets` builds four rows, not eight: the picker, the saved list with **Load** and **✕**
beside it, the name field with **Save** beside it, and **Export** / **Import** sharing a row.
**Export** downloads the values on screen, named after the name field or the preset in effect.
From code, `presets.exportFile(name)` writes the saved preset of that name, or the current
state when there is none, and `presets.exportFile(name, values)` writes exactly what it is given.
The same two pieces are available on their own — `addButtons` for a row of buttons, and the
`gui-compact` class for a field with a button next to it.

## Keyboard

```js
import { bindKey } from "guspira/keyboard";

const unbind = bindKey("KeyC", () => toggleRecording());
```

Bindings ignore key presses while a field has focus, and a bare letter doesn't fire when Ctrl
or Cmd is held — so `KeyC` doesn't fight Ctrl+C. They also stay out of the way of a control
that answers the key itself: Space on a focused button presses the button, and an arrow on a
slider moves the slider, without running a binding as well.

| Option | Meaning |
| --- | --- |
| `ctrl`, `shift`, `alt`, `meta` | Modifiers that must be held. All default to `false`, and must match exactly. |
| `repeat` | `true` to keep firing while the key is held. By default a held key fires once. |
| `preventDefault` | Stop the browser's own handling of the key. |
| `allowWhileTyping` | Fire even with a field or a control focused. |
| `target` | Where to listen. Defaults to `window`. |

## Theming

Everything visual is a CSS custom property on `.gui`, so a theme is an override, not a fork:

```css
.gui {
  --gui-bg: #14141a;
  --gui-fg: #e8e8ef;
  --gui-accent: #7dd3fc;
  --gui-label-width: 120px;
}
```

Colours: `--gui-bg`, `--gui-fg`, `--gui-muted`, `--gui-field-bg`, `--gui-border`,
`--gui-focus`, `--gui-accent`, `--gui-btn-bg`, `--gui-btn-hover`, `--gui-btn-active`,
`--gui-track`, `--gui-fill`, `--gui-thumb`, `--gui-thumb-hover`, `--gui-check`, `--gui-warn`,
`--gui-series-1` … `--gui-series-5`.
Metrics: `--gui-font`, `--gui-font-size`, `--gui-padding`, `--gui-gap`, `--gui-row-height`,
`--gui-label-width`, `--gui-radius`, `--gui-panel-radius`, `--gui-track-height`,
`--gui-check-size`, `--gui-max-height`, `--gui-graph-height`, `--gui-pad-height`,
`--gui-pad-dot-size`. `--gui-font-size` is the label size, and the smaller text in the panel
is set a pixel or three below it, so the one variable scales all of it.

Nothing is left to the platform: the checkbox is drawn by the stylesheet too, so it picks up
`--gui-accent` when checked and draws its tick in `--gui-check`, which defaults to the panel
background — whatever the accent is, the tick contrasts with it.

The variables reach the slider's shadow root too. A light theme ships as
`<div class="gui gui-light">` — pass `{ className: "gui-light" }` to the constructor.

The panel is positioned by its container, not by the toolkit:

```css
#gui-container { position: fixed; top: 10px; right: 10px; width: 340px; }
```

## `<range-slider>`

The slider is a standalone form-associated custom element — usable without the rest:

```html
<range-slider min="0" max="1" step="0.01" value="0.4"></range-slider>
<range-slider dual min="0" max="1" step="0.01" value="0.2,0.8"></range-slider>
<range-slider min="20" max="20000" step="1" value="632" curve="log"></range-slider>
```

`value` is a number, or `[min, max]` in `dual` mode. Without one the thumb starts mid-range,
and a dual slider spans the whole of it. It emits `input` while dragging and `change` on
release, and supports arrows, Page keys and Home/End (Shift moves the lower handle of a dual
slider). `curve` takes the same values as the panel option above; `min`, `max` and `curve` can
be assigned in any order, and a log track over a range it cannot cover falls back to a linear
one with a warning.

The mapping itself lives in `src/curve.js` rather than in the element, because it is arithmetic
with no DOM in it: the panel needs the same functions to reroll a curved slider along its track,
and a test should be able to check them without a browser. The pair has to stay invertible —
dragging needs position → value, drawing the thumb needs value → position — which is why
`curve` is a closed set rather than a function you supply.

## Tests

```sh
npm test           # the core, params/presets, example coverage, types, dist freshness, every page
```

Seven suites, none of which need a browser except the last, which skips itself when no Chrome
is installed:

- **the reactive core and the params/preset layer**, in node
- **stress** — the core under load: 20 000 effects on one signal, a 2 000-deep chain, 100 000
  writes in a batch, 50 000 create/stop cycles. It asserts on counts rather than on the clock
  (every subscriber ran exactly once; nothing runs after `stop()`), so it does not go red on a
  busy machine. The one timing check compares a size against twice that size, which is enough
  to catch an accidentally quadratic drain without caring how fast the host is
- **example coverage** — every public export, panel method, option and theme variable has to
  appear in a demo. Documentation drifts; a test doesn't. Anything genuinely not demonstrable
  is listed with its reason in `test/coverage.test.mjs` rather than quietly skipped.
- **types** — the declarations are written by hand, so their exports and the panel's methods
  are compared with the source by name, and `test/types/usage.ts` is compiled against them
  under both node and bundler resolution. It imports the package by name, which puts the
  `exports` map on the path being tested.
- **dist freshness** — `dist/` is committed, so this rebuilds it into a scratch directory and
  fails if the result differs. Without it a commit without `npm run build` ships stale code
  with a green suite.
- **every page**, loaded in headless Chrome and failed if it threw. An effect runs the moment
  it is created, so a `let` declared below the effect that reads it is still in its temporal
  dead zone — that class of mistake reaches the browser and nothing else.

The DOM half needs a browser: serve the project and open `/test/`, which builds panels and
drives them with real events — drags, key presses, label clicks, folding, `destroy()` — then
prints the results on the page. `/test/dist.html` runs the same kind of check against the files
in `dist/`.

`test/bench.mjs` is a benchmark rather than a test: it measures signal writes, effect
re-tracking and batching, so a change to the hot path can be checked against a number.
`npm run stress` runs the load suite with `--expose-gc`, which adds a heap-growth check that
is skipped otherwise.

## Licence

MIT
