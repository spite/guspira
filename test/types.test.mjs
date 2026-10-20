// The declarations in src/*.d.ts are written by hand, so two things keep them honest. The
// names are compared with the source, which needs nothing but node: an export or a panel
// method added on one side and not the other fails here. Then test/types/usage.ts is compiled
// against them, which is what catches a signature that is wrong rather than missing.
//
// The compile step is skipped (with a note) when TypeScript is not installed.

import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");

let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`  ${cond ? "ok  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
};

const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// Names a module exports as values. `export type` and `export interface` are not values.
function valueExports(text) {
  const names = new Set();
  const source = withoutComments(text);
  for (const m of source.matchAll(/^export\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|class)\s+([\w$]+)/gm)) {
    names.add(m[1]);
  }
  for (const m of source.matchAll(/^export\s+(type\s+)?\{([^}]*)\}/gm)) {
    if (m[1]) continue;
    for (const part of m[2].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) names.add(name);
    }
  }
  if (/^export\s+default\b/m.test(source)) names.add("default");
  return names;
}

// Members of each class: methods and accessors, and for the source the fields it assigns.
function classMembers(text, { fields }) {
  const classes = new Map();
  let current = null;
  for (const line of withoutComments(text).split("\n")) {
    const opening = line.match(/^(?:export\s+)?(?:default\s+)?class\s+([\w$]+)/);
    if (opening) {
      current = new Set();
      classes.set(opening[1], current);
      continue;
    }
    if (!current) continue;
    if (/^\}/.test(line)) {
      current = null;
      continue;
    }
    const member = line.match(/^ {2}(?:static\s+)?(?:readonly\s+)?(?:get\s+|set\s+)?([\w$]+)\s*(?:[<(:?=]|;)/);
    if (member && member[1] !== "constructor") current.add(member[1]);
    if (fields) for (const m of line.matchAll(/\bthis\.([\w$]+)\s*=(?!=)/g)) current.add(m[1]);
  }
  return classes;
}

const modules = readdirSync(join(root, "src")).filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3));

for (const name of modules) {
  if (!existsSync(join(root, `src/${name}.d.ts`))) {
    check(`src/${name}.js has declarations`, false, `src/${name}.d.ts is missing`);
    continue;
  }
  const source = read(`src/${name}.js`);
  const declared = read(`src/${name}.d.ts`);

  const fromSource = valueExports(source);
  const fromTypes = valueExports(declared);
  const undeclared = [...fromSource].filter((n) => !fromTypes.has(n));
  const invented = [...fromTypes].filter((n) => !fromSource.has(n));
  check(`${name}: every export is declared`, undeclared.length === 0, undeclared.join(", "));
  check(`${name}: nothing is declared that is not exported`, invented.length === 0, invented.join(", "));

  const sourceClasses = classMembers(source, { fields: true });
  for (const [className, members] of classMembers(declared, { fields: false })) {
    const real = sourceClasses.get(className) || new Set();
    const missing = [...members].filter((m) => !real.has(m));
    check(`${name}: every declared member of ${className} exists`, missing.length === 0, missing.join(", "));
  }
}

// The panel's classes are the API, so there the check runs the other way too: a method added
// to the source has to be declared. The elements declare only what is meant to be called.
{
  const types = read("src/gui.d.ts");
  const declared = classMembers(types, { fields: false });
  for (const [className, members] of classMembers(read("src/gui.js"), { fields: false })) {
    // What a class overrides is already declared on the class it extends.
    const parent = types.match(new RegExp(`class ${className} extends ([\\w$]+)`));
    const known = new Set([...(declared.get(className) || []), ...((parent && declared.get(parent[1])) || [])]);
    const missing = [...members].filter((m) => !m.startsWith("_") && !known.has(m));
    check(`gui: every public member of ${className} is declared`, missing.length === 0, missing.join(", "));
  }
}

// The package has to say where the declarations are, for a consumer whose resolution does
// not look beside the .js file.
{
  const pkg = JSON.parse(read("package.json"));
  check("package.json points at the root declarations",
    pkg.types === "./src/index.d.ts" && pkg.exports["."].types === "./src/index.d.ts");
  check("…with the types condition first", Object.keys(pkg.exports["."])[0] === "types");
  const unshipped = Object.entries(pkg.exports)
    .filter(([, target]) => typeof target === "string" && target.startsWith("./src/") && target.endsWith(".js"))
    .filter(([, target]) => !existsSync(join(root, target.replace(/\.js$/, ".d.ts"))))
    .map(([subpath]) => subpath);
  check("every subpath that is a module has declarations beside it", unshipped.length === 0, unshipped.join(", "));
}

// Compiled twice: the way node resolves a package, and the way a bundler does. The usage file
// imports the package by name, so the exports map is on the path being tested.
const tsc = join(root, "node_modules/typescript/bin/tsc");
if (!existsSync(tsc)) {
  console.log("  --   compile check skipped: TypeScript is not installed (npm install)");
} else {
  for (const [label, flags] of [
    ["node resolution", []],
    ["bundler resolution", ["--module", "esnext", "--moduleResolution", "bundler"]],
  ]) {
    const run = spawnSync(process.execPath, [tsc, "-p", "test/types/tsconfig.json", ...flags], {
      cwd: root,
      encoding: "utf8",
    });
    const output = `${run.stdout || ""}${run.stderr || ""}`.trim();
    check(`test/types/usage.ts compiles under ${label}`, run.status === 0, output.split("\n").slice(0, 6).join(" | "));
  }
}

console.log(failures ? `\n${failures} FAILURES` : "\nthe declarations match the source");
process.exit(failures ? 1 : 0);
