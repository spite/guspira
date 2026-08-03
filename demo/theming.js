// Theming: the panel restyles itself by writing the custom properties on its own container.
// Nothing here touches css/gui.css — a theme is only ever a set of variable values.

import GUI from "../src/gui.js";
import { signal, effect, batch } from "../src/reactive.js";
import { highlight } from "./shell.js";

const THEMES = {
  default: {},
  midnight: {
    "--gui-bg": "#10131a",
    "--gui-fg": "#c9d4e4",
    "--gui-muted": "#5d6b83",
    "--gui-field-bg": "#1a1f2b",
    "--gui-border": "#2b3344",
    "--gui-accent": "#7dd3fc",
    "--gui-fill": "#7dd3fc",
    "--gui-thumb": "#e0f2fe",
    "--gui-btn-bg": "#1e2532",
    "--gui-btn-hover": "#28324a",
    "--gui-check": "#10131a",
  },
  ember: {
    "--gui-bg": "#1c1410",
    "--gui-fg": "#f5e6d8",
    "--gui-muted": "#8a7060",
    "--gui-field-bg": "#2a1e17",
    "--gui-border": "#4a352a",
    "--gui-accent": "#ff9f45",
    "--gui-fill": "#ff9f45",
    "--gui-thumb": "#ffd9a8",
    "--gui-btn-bg": "#33241b",
    "--gui-btn-hover": "#45301f",
    "--gui-check": "#1c1410",
  },
  paper: {
    "--gui-bg": "#f4f1ea",
    "--gui-fg": "#2b2823",
    "--gui-muted": "#7d7568",
    "--gui-field-bg": "#ffffff",
    "--gui-border": "#d6cfc2",
    "--gui-accent": "#2b2823",
    "--gui-fill": "#4a4336",
    "--gui-track": "#ded7ca",
    "--gui-thumb": "#ffffff",
    "--gui-btn-bg": "#e8e3d8",
    "--gui-btn-hover": "#ded7ca",
    "--gui-check": "#f4f1ea",
  },
};

const theme = signal("default");
const light = signal(false);

// Individual variables, so they can be nudged after a theme is picked.
const vars = {
  "--gui-font-size": signal(13),
  "--gui-padding": signal(20),
  "--gui-gap": signal(8),
  "--gui-row-height": signal(24),
  "--gui-label-width": signal(140),
  "--gui-radius": signal(4),
  "--gui-panel-radius": signal(6),
  "--gui-track-height": signal(4),
  "--gui-max-height": signal(720),
  "--gui-check-size": signal(16),
  "--gui-pad-height": signal(90),
  "--gui-pad-dot-size": signal(10),
};

const METRIC_DEFAULTS = Object.fromEntries(
  Object.entries(vars).map(([name, sig]) => [name, sig.peek()])
);

// --gui-font is a font stack rather than a number, so it gets a picker of its own.
const fontStack = signal('"Segoe UI", system-ui, sans-serif');

// One signal per colour the stylesheet declares, so the demo covers the whole set rather
// than a sample of it. test/coverage.test.mjs fails if gui.css grows one this misses.
const colours = {
  "--gui-bg": signal("#2c2c2c"),
  "--gui-fg": signal("#e0e0e0"),
  "--gui-muted": signal("#888888"),
  "--gui-field-bg": signal("#3e3e3e"),
  "--gui-border": signal("#555555"),
  "--gui-focus": signal("#888888"),
  "--gui-accent": signal("#ffffff"),
  "--gui-btn-bg": signal("#4a4a4a"),
  "--gui-btn-hover": signal("#5a5a5a"),
  "--gui-btn-active": signal("#333333"),
  "--gui-track": signal("#333333"),
  "--gui-fill": signal("#e0e0e0"),
  "--gui-thumb": signal("#ffffff"),
  "--gui-thumb-hover": signal("#f0f0f0"),
  // The checkbox tick. Its default is var(--gui-bg), so it follows the panel unless set.
  "--gui-check": signal("#2c2c2c"),
};

const COLOUR_DEFAULTS = Object.fromEntries(
  Object.entries(colours).map(([name, sig]) => [name, sig.peek()])
);

const gui = new GUI("Theming", document.querySelector("#gui-container"), {
  className: "demo-theming", // any extra class on the container, for page-level styling
  expanded: true, // start unfolded regardless of window width
});

gui.addSection("Theme");
gui.addSelect("Preset theme", theme, Object.keys(THEMES), {
  onChange: () => {
    // Re-seed every colour control from the theme that was just applied.
    const t = THEMES[theme()];
    for (const [name, sig] of Object.entries(colours)) sig.set(t[name] || COLOUR_DEFAULTS[name]);
  },
});
gui.addCheckbox("Light theme class", light, {
  title: "Adds .gui-light — a second set of variable values, nothing more",
});

gui.addSection("Colours");
for (const [name, sig] of Object.entries(colours)) gui.addColor(name, sig);

gui.addSection("Font");
gui.addSelect("--gui-font", fontStack, [
  ['"Segoe UI", system-ui, sans-serif', "system"],
  ["ui-monospace, monospace", "monospace"],
  ["Georgia, serif", "serif"],
]);

gui.addSection("Metrics");
gui.addSlider("--gui-font-size", vars["--gui-font-size"], 10, 18, 1);
gui.addSlider("--gui-padding", vars["--gui-padding"], 6, 32, 1);
gui.addSlider("--gui-gap", vars["--gui-gap"], 2, 20, 1);
gui.addSlider("--gui-row-height", vars["--gui-row-height"], 18, 40, 1);
gui.addSlider("--gui-label-width", vars["--gui-label-width"], 80, 200, 5);
gui.addSlider("--gui-radius", vars["--gui-radius"], 0, 14, 1);
gui.addSlider("--gui-panel-radius", vars["--gui-panel-radius"], 0, 20, 1);
gui.addSlider("--gui-track-height", vars["--gui-track-height"], 2, 12, 1);
gui.addSlider("--gui-max-height", vars["--gui-max-height"], 200, 1200, 20, {
  title: "How tall the scrolling area may get",
});
gui.addSlider("--gui-check-size", vars["--gui-check-size"], 12, 28, 1);
gui.addSlider("--gui-pad-height", vars["--gui-pad-height"], 40, 180, 2);
gui.addSlider("--gui-pad-dot-size", vars["--gui-pad-dot-size"], 4, 22, 1);

gui.addSection("Reset");
gui.addButton("Back to the shipped look", () => {
  batch(() => {
    theme.set("default");
    light.set(false);
    fontStack.set('"Segoe UI", system-ui, sans-serif');
    for (const [name, sig] of Object.entries(colours)) sig.set(COLOUR_DEFAULTS[name]);
    for (const [name, sig] of Object.entries(vars)) sig.set(METRIC_DEFAULTS[name]);
  });
});

const code = document.querySelector("#code");

// One effect writes every variable onto the panel's container and mirrors it as CSS text.
effect(() => {
  const el = gui.container;
  const applied = { ...THEMES[theme()] };
  for (const [name, sig] of Object.entries(colours)) applied[name] = sig();
  for (const [name, sig] of Object.entries(vars)) applied[name] = `${sig()}px`;
  applied["--gui-font"] = fontStack();

  el.style.cssText = "";
  for (const [name, value] of Object.entries(applied)) el.style.setProperty(name, value);
  el.classList.toggle("gui-light", light());

  code.textContent = `.gui${light() ? ".gui-light" : ""} {\n${Object.entries(applied)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n")}\n}`;
  highlight(code);
});
