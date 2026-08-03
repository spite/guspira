// Checks that every public export and every panel method is actually shown somewhere in
// demo/ or on the landing page. Documentation drifts; a test doesn't.
//
// Anything genuinely not demonstrable goes in ALLOWED with the reason, so the exception is
// a decision on the record rather than a gap nobody noticed.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ALLOWED = {
  createRow: "shown via the custom controls in demo/extending.js, which call it through GUI.prototype",
  RangeSlider: "the class itself; demo/range-slider.js uses the element it registers",
  StatsGraph: "the class itself; demo/stats.js uses the element through addGraph",
};

const read = (p) => readFileSync(p, "utf8");
const root = new URL("..", import.meta.url).pathname;

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

const methods = [...gui.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9]*)\(/gm)]
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
  "stacked", "samples", "over", "below", "average", "interval",
];

let failures = 0;
// An option counts as demonstrated when a demo passes it — `curve: "log"` or curve="log" —
// not when the word merely appears. Matching the bare word let `curve` pass on the sentence
// "the curve the value is following" in a comment, which is exactly the false comfort this
// suite exists to prevent. Everything else is matched as a call or an identifier.
const usage = (kind, name) =>
  kind === "options"
    ? new RegExp(`\\b${name}\\s*:|\\b${name}=`)
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

check("GUI methods", [...new Set(methods)]);
check("public exports", [...new Set(exports)]);
check("options", OPTIONS);

for (const [name, reason] of Object.entries(ALLOWED)) {
  console.log(`  --   ${name}: ${reason}`);
}

console.log(failures ? `\n${failures} FAILURES` : "\nevery public name appears in an example");
process.exit(failures ? 1 : 0);
