// dist/ is committed, and nothing else notices when it stops matching src/ — the bundle
// smoke test in test/dist.html exercises whatever is in dist, so it passes just as happily
// against a stale build. This rebuilds into a temporary directory and compares.

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
// Beside dist/ rather than in the system temp: source maps record paths relative to their
// own directory, so a build at a different depth would differ for that reason alone.
const out = join(root, ".dist-check");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`  ${cond ? "ok  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
};

try {
  execFileSync(process.execPath, ["build.mjs"], {
    cwd: root,
    env: { ...process.env, GUSPIRA_OUT: out },
    stdio: "ignore",
  });

  const built = readdirSync(out).sort();
  const shipped = readdirSync(join(root, "dist")).sort();

  check("dist has every file a build produces", built.every((f) => shipped.includes(f)),
    built.filter((f) => !shipped.includes(f)).join(", "));
  check("…and nothing a build does not", shipped.every((f) => built.includes(f)),
    shipped.filter((f) => !built.includes(f)).join(", "));

  const differing = built.filter(
    (f) => readFileSync(join(out, f), "utf8") !== readFileSync(join(root, "dist", f), "utf8")
  );
  check("dist matches what src builds to", differing.length === 0,
    differing.length ? `stale: ${differing.join(", ")} — run npm run build` : "");
} finally {
  rmSync(out, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} FAILURES` : "\ndist is in step with src");
process.exit(failures ? 1 : 0);
