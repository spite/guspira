// The live parts of the landing page: the two islands and the reference grid. Everything on
// this page that looks like a control is a control — the page is built with the library it
// documents.

import GUI from "./src/gui.js";
import { highlight } from "./demo/shell.js";
import { signal, computed, effect } from "./src/reactive.js";
import { createParams } from "./src/params.js";
import { createPresetStore } from "./src/presets.js";

// --- part one: signals -------------------------------------------------------------------
// The point of this island is the run counter. Two buttons write to the same signal — one
// with the value it already holds, one with a different value — and only the second one
// makes the effect run. Watching the counter hold, then move, is the whole demonstration.
{
  const width = signal(4);
  const height = signal(3);
  const area = computed(() => width() * height());

  const out = document.querySelector("#signals-out");
  const note = signal("drag a slider, or press a button below");
  let runs = 0;

  const paint = () => {
    out.textContent = [
      `${width.peek()} × ${height.peek()} = ${area.peek()}`,
      ``,
      `the effect has run ${runs} time${runs === 1 ? "" : "s"}`,
      ``,
      note.peek(), // peek, or the counting effect below would subscribe to this line
    ].join("\n");
  };

  // The effect being demonstrated: it reads the signals, and counts its own runs.
  effect(() => {
    width();
    height();
    area();
    runs++;
    paint();
  });

  // A second, independent effect repaints the status line — so writing that line can never
  // be mistaken for the effect above having run.
  effect(() => {
    note();
    paint();
  });

  const gui = new GUI("Try it", document.querySelector("#signals-gui"));
  gui.addSlider("width", width, 1, 20, 1);
  gui.addSlider("height", height, 1, 20, 1);
  gui.addMonitor("area (computed)", area);
  gui.addButtons(null, [
    {
      label: "Write the same value",
      title: "width.set(width.peek()) — the value it already holds",
      onClick: () => {
        const before = runs;
        width.set(width.peek());
        note.set(
          runs === before
            ? `width ← ${width.peek()}  ·  unchanged, so nothing re-ran`
            : `width ← ${width.peek()}  ·  the effect ran`
        );
      },
    },
    {
      label: "Write a different one",
      title: "the same call with a value that differs",
      onClick: () => {
        const before = runs;
        width.set(width.peek() === 20 ? 1 : width.peek() + 1);
        note.set(
          runs === before
            ? `width ← ${width.peek()}  ·  unchanged, so nothing re-ran`
            : `width ← ${width.peek()}  ·  changed, so the effect ran`
        );
      },
    },
  ]);
}

// --- part two: a panel bound to a sketch ----------------------------------------------------
{
  const params = {
    count: signal(28),
    shape: signal("ring"),
    tint: signal("#ffb347"),
    size: signal(9),
  };

  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "width:100%;height:190px;display:block;border:1px solid var(--line);border-radius:6px;background:#0d0d12";
  const out = document.querySelector("#gui-out");
  out.before(canvas);

  const ctx = canvas.getContext("2d");
  let w = 0;
  let h = 0;

  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  };
  addEventListener("resize", resize);

  function draw() {
    if (!w) return;
    ctx.clearRect(0, 0, w, h);
    const n = params.count();
    const size = params.size();
    ctx.fillStyle = params.tint();
    if (params.shape() === "ring") {
      const r = Math.min(w, h) * 0.34;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      const cols = Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);
      const stepX = w / (cols + 1);
      const stepY = h / (rows + 1);
      for (let i = 0; i < n; i++) {
        const x = (1 + (i % cols)) * stepX;
        const y = (1 + Math.floor(i / cols)) * stepY;
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // The whole wiring between panel and sketch: one effect reading the same signals.
  effect(() => {
    draw();
    out.textContent = JSON.stringify(
      { count: params.count(), shape: params.shape(), tint: params.tint(), size: params.size() },
      null,
      2
    );
  });

  const gui = new GUI("Sketch", document.querySelector("#panel-gui"));
  gui.addSlider("Count", params.count, 1, 200, 1);
  gui.addSelect("Shape", params.shape, ["ring", "grid"]);
  gui.addColor("Tint", params.tint);
  gui.addSlider("Dot size", params.size, 2, 24, 1);
  gui.addSeparator();
  gui.addText("Click a label to reroll it, or press <b>R</b>.");
  gui.addRandomizeButton("Randomize (R)", () => {});

  resize();
}

// --- part three: the reference, built from the library itself -----------------------------
// Every entry is a one-row panel bound to a live signal, above the line that made it. A
// reference for a GUI toolkit should be the thing itself, not a picture of it.
{
  const grid = document.querySelector("#reference");

  const entry = (code, build) => {
    const cell = document.createElement("div");
    cell.className = "ref-item";
    const host = document.createElement("div");
    const pre = document.createElement("pre");
    pre.className = "code";
    pre.textContent = code;
    cell.append(host, pre);
    grid.append(cell);
    build(new GUI("", host, { expanded: true, className: "gui-bare" }));
    highlight(pre);
  };

  entry('gui.addSlider("Count", count, 0, 200, 1);', (g) =>
    g.addSlider("Count", signal(64), 0, 200, 1)
  );

  entry('gui.addRangeSlider("Size", size, 0, 1, 0.05);', (g) =>
    g.addRangeSlider("Size", signal([0.25, 0.75]), 0, 1, 0.05)
  );

  entry('gui.addSelect("Shape", shape, ["ring", "grid"]);', (g) =>
    g.addSelect("Shape", signal("ring"), ["ring", "grid", "spiral"])
  );

  entry('gui.addCheckbox("Trails", trails);', (g) => g.addCheckbox("Trails", signal(true)));

  entry('gui.addColor("Tint", tint);', (g) => g.addColor("Tint", signal("#ffb347")));

  entry('gui.addVector("Position", position, { step: 0.1 });', (g) =>
    g.addVector("Position", signal([0, 1.5, -2]), { min: -10, max: 10, step: 0.1 })
  );

  entry('gui.addPad("Aim", aim, { invertY: true });', (g) =>
    g.addPad("Aim", signal([0.5, 0.5]), { invertY: true, height: 76 })
  );

  entry('gui.addTextInput("Name", name);', (g) =>
    g.addTextInput("Name", signal("guspira"), { placeholder: "untitled" })
  );

  entry('gui.addNumber("Seed", seed, { step: 1 });', (g) =>
    g.addNumber("Seed", signal(1337), { step: 1 })
  );

  // A monitor is read-only, so this one is ticking on its own.
  const clock = signal(0);
  setInterval(() => clock.set(performance.now() / 1000), 100);
  entry('gui.addMonitor("Uptime", uptime, { format });', (g) =>
    g.addMonitor("Uptime", clock, { format: (v) => `${v.toFixed(1)} s` })
  );

  entry('gui.addButton("Export", save);', (g) =>
    g.addButton("Export", function () {
      this.textContent = "saved ✓";
      setTimeout(() => (this.textContent = "Export"), 900);
    })
  );

  entry(
    'gui.addButtons(null, [\n  { label: "Save", onClick: save },\n  { label: "Load", onClick: load },\n]);',
    (g) =>
      g.addButtons(null, [
        { label: "Save", onClick: () => {} },
        { label: "Load", onClick: () => {} },
      ])
  );

  entry('gui.addFileButton("Load…", onFile);', (g) =>
    g.addFileButton("Load…", () => {}, { accept: ".glb,.gltf" })
  );

  // Bound to nothing here, so it rerolls only the swatch beneath it.
  entry('gui.addRandomizeButton("Randomize", rebuild);', (g) => {
    g.addRandomizeButton("Randomize", () => {}, { key: null });
    g.addColor("Tint", signal("#7dd3fc"));
  });

  entry('gui.addElement(myWidget, { label: "Level" });', (g) => {
    const level = signal(0.62);
    const bar = document.createElement("div");
    bar.className = "gui-control";
    bar.style.cssText = "height:10px;border-radius:5px;background:var(--gui-field-bg);overflow:hidden";
    const fill = document.createElement("div");
    fill.style.cssText = "height:100%;background:var(--gui-fill)";
    bar.append(fill);
    effect(() => (fill.style.width = `${level() * 100}%`));
    g.addSlider("Level", level, 0, 1, 0.01);
    g.addElement(bar, { label: "Meter" });
  });

  // The one composite: four rows from one call, so it earns a cell of its own.
  entry("gui.addPresets(store);", (g) => {
    const params = createParams({ hue: 28, spread: 0.4 });
    const store = createPresetStore(params, { builtin: { warm: { hue: 20 }, cool: { hue: 200 } } });
    g.addPresets(store);
  });

  entry(
    'gui.addLabel("A bare label row");\ngui.addSeparator();\ngui.addText("Free-form <b>HTML</b>.");',
    (g) => {
      g.addLabel("A bare label row");
      g.addSeparator();
      g.addText('Free-form <b>HTML</b> — a legend, or a <a href="./demo/">link</a>.');
    }
  );
}
