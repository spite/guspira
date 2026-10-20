// Checks that every public export and every panel method is actually shown somewhere in
// demo/ or on the landing page. Documentation drifts; a test doesn't.
//
// Anything genuinely not demonstrable goes in ALLOWED with the reason, so the exception is
// a decision on the record rather than a gap nobody noticed.

import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ALLOWED = {
  createRow: "shown via the custom controls in demo/extending.js, which call it through GUI.prototype",
  RangeSlider: "the class itself; demo/range-slider.js uses the element it registers",
  StatsGraph: "the class itself; demo/stats.js uses the element through addGraph",
};

const read = (p) => readFileSync(p, "utf8");
const root = fileURLToPath(new URL("..", import.meta.url));

const examples = [
  ...readdirSync(join(root, "demo"))
    .filter((f) => f.endsWith(".js"))
    .map((f) => read(join(root, "demo", f))),
  read(join(root, "landing.js")),
  read(join(root, "index.html")),
  ...readdirSync(join(root, "demo"))
    .filter((f) => f.endsWith(".html"))
    .map((f) => read(join(root, "demo", f))),
].join("\n");

const gui = read(join(root, "src/gui.js"));
const index = read(join(root, "src/index.js"));
const guiCss = read(join(root, "css/gui.css"));
const theming = read(join(root, "demo/theming.js"));

// The classes, from the first one down: helper functions above them are indented the same way.
const classes = gui.slice(gui.search(/^class /m));
const methods = [...classes.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9]*)\(/gm)]
  .map((m) => m[1])
  .filter((m) => m !== "constructor");

const exports = [
  ...index.matchAll(/export \{([^}]*)\} from/gs),
]
  .flatMap((m) => m[1].split(","))
  .map((name) => name.trim().split(/\s+as\s+/).pop())
  .filter(Boolean);

const OPTIONS = [
  "onChange", "disabled", "disabledWhen", "visible", "visibleWhen", "randomizable", "title",
  "format", "placeholder",
  "accept", "collapsible", "open", "storageKey", "className", "expanded",
  "onBeforeRandomize", "migrate", "exclude", "url", "builtin", "lazy", "scheduler", "key",
  "axes", "invertY", "height", "scrub", "curve",
  "stacked", "samples", "over", "below", "average", "interval", "rows", "spellcheck",
  "paused", "pausedWhen", "series", "interpolate", "repeat", "preventDefault",
];

let failures = 0;
// An option counts as demonstrated when a demo passes it — `curve: "log"` or curve="log" —
// not when the word merely appears. Matching the bare word let `curve` pass on the sentence
// "the curve the value is following" in a comment, which is exactly the false comfort this
// suite exists to prevent. A method has to be called, and not on a classList: `toggle` used
// to pass on classList.toggle(). An export is matched as an identifier.
const usage = (kind, name) =>
  kind === "options"
    ? new RegExp(`\\b${name}\\s*:|\\b${name}=`)
    : kind === "GUI methods"
      ? new RegExp(`(?<!classList)\\.${name}\\(`)
      : new RegExp(`\\b${name}\\b`);

const check = (kind, names) => {
  const missing = names.filter((name) => !ALLOWED[name] && !usage(kind, name).test(examples));
  const skipped = names.filter((name) => ALLOWED[name]);
  console.log(
    `  ${missing.length ? "FAIL" : "ok  "} ${kind}: ${names.length - missing.length}/${names.length} demonstrated` +
      (skipped.length ? ` (${skipped.length} allowed)` : "")
  );
  if (missing.length) {
    console.log(`       not shown anywhere: ${missing.join(", ")}`);
    failures++;
  }
};

// The theming demo is the documentation for the custom properties, so it has to keep up
// with them: a variable added to the stylesheet and not exposed there is invisible.
const cssVars = [...new Set([...guiCss.matchAll(/(--gui-[a-z0-9-]+):/g)].map((m) => m[1]))];
const missingVars = cssVars.filter((v) => !theming.includes(v));
console.log(
  `  ${missingVars.length ? "FAIL" : "ok  "} theme variables: ${
    cssVars.length - missingVars.length
  }/${cssVars.length} shown in demo/theming.js`
);
if (missingVars.length) {
  console.log(`       not exposed: ${missingVars.join(", ")}`);
  failures++;
}

// The theming page states the count in prose, and it was wrong the moment a variable was
// added — which is exactly the drift the rest of this file exists to catch.
{
  const page = read(join(root, "demo/theming.html"));
  const claimed = page.match(/all (\d+) of\s+them/);
  const stated = claimed ? Number(claimed[1]) : null;
  const right = stated === cssVars.length;
  console.log(
    `  ${right ? "ok  " : "FAIL"} the theming page's stated count: ${stated} (css/gui.css declares ${cssVars.length})`
  );
  if (!right) failures++;
}

// The landing page states the control count in prose. It has drifted five times.
{
  const WORDS = { 15: "Fifteen", 16: "Sixteen", 17: "Seventeen", 18: "Eighteen", 19: "Nineteen",
    20: "Twenty", 21: "Twenty-one", 22: "Twenty-two", 23: "Twenty-three", 24: "Twenty-four" };
  const landing = read(join(root, "index.html"));
  const rowControls = [...new Set(methods)].filter(
    (m) => m.startsWith("add") && !["addSection", "addTab", "addPresets"].includes(m)
  ).length;
  const word = WORDS[rowControls];
  const right = word && landing.includes(`${word} controls`);
  console.log(
    `  ${right ? "ok  " : "FAIL"} the landing page's control count: ${rowControls} (${word ?? "?"} controls)`
  );
  if (!right) failures++;
}

// The browser suite is one module scope, and a name declared twice in it is a SyntaxError
// that takes every assertion in the file down with it. That has happened six times. The
// browser run does report it, but only as "no summary" — this names the clash instead.
{
  const suite = read(join(root, "test/index.html"));
  const seen = new Map();
  const clashes = [];
  // Top level of that file is six spaces in; anything deeper is inside a block of its own.
  for (const line of suite.split("\n")) {
    const declaration = line.match(/^ {6}(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/);
    if (!declaration) continue;
    const name = declaration[1];
    if (seen.has(name)) clashes.push(name);
    else seen.set(name, true);
  }
  console.log(
    `  ${clashes.length ? "FAIL" : "ok  "} no duplicate declarations in the browser suite` +
      (clashes.length ? ` — ${[...new Set(clashes)].join(", ")}` : ` (${seen.size} names)`)
  );
  if (clashes.length) failures++;
}

// A uniform name that does not exist resolves to null, and gl.uniform*(null, …) is a silent
// no-op: the control goes dead and nothing anywhere says so. The flagship demo has 22 of them.
{
  const warp = read(join(root, "demo/warp.js"));
  const used = [...new Set([...warp.matchAll(/\bu\.(u[A-Za-z0-9]+)/g)].map((m) => m[1]))];
  const declared = new Set();
  for (const match of warp.matchAll(/uniform\s+\w+\s+([^;]+);/g)) {
    for (const name of match[1].split(",")) declared.add(name.trim());
  }
  const missing = used.filter((name) => !declared.has(name));
  const unused = [...declared].filter((name) => !used.includes(name));
  const bad = missing.length || unused.length;
  console.log(
    `  ${bad ? "FAIL" : "ok  "} warp uniforms: ${used.length} set, ${declared.size} declared` +
      (missing.length ? ` · set but not declared: ${missing.join(", ")}` : "") +
      (unused.length ? ` · declared but never set: ${unused.join(", ")}` : "")
  );
  if (bad) failures++;
}

// The narrow-viewport suite names the pages it measures, and a page added later would simply
// go unmeasured without anything saying so.
{
  const mobile = read(join(root, "test/mobile.html"));
  const listed = new Set([...mobile.matchAll(/"(\/[\w./-]+\.html)"/g)].map((m) => m[1]));
  const pages = ["/index.html", ...readdirSync(join(root, "demo"))
    .filter((f) => f.endsWith(".html"))
    .map((f) => `/demo/${f}`)];
  const unmeasured = pages.filter((page) => !listed.has(page));
  console.log(
    `  ${unmeasured.length ? "FAIL" : "ok  "} narrow-viewport suite covers every page ` +
      `(${pages.length})${unmeasured.length ? ` — missing ${unmeasured.join(", ")}` : ""}`
  );
  if (unmeasured.length) failures++;
}

check("GUI methods", [...new Set(methods)]);
check("public exports", [...new Set(exports)]);
check("options", OPTIONS);

for (const [name, reason] of Object.entries(ALLOWED)) {
  console.log(`  --   ${name}: ${reason}`);
}

console.log(failures ? `\n${failures} FAILURES` : "\nevery public name appears in an example");
process.exit(failures ? 1 : 0);
