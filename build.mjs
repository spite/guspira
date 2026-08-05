// Builds dist/. The library itself needs no build — src/ is plain ES modules and every demo
// loads it directly — so this exists only for the ways people consume a library that are not
// "serve the folder": a single file to drop in, a global for a <script> tag with no modules,
// and something a CDN can point at.
//
//   node build.mjs            build
//   node build.mjs --watch    rebuild on change

import { build, context } from "esbuild";
import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const watch = process.argv.includes("--watch");
// Overridable so a test can build somewhere else and compare, without disturbing the
// checked-in dist/.
const outdir = process.env.GUSPIRA_OUT || "dist";

const pkg = JSON.parse(await readFile("package.json", "utf8"));

// npm wants `repository.url` in its canonical `git+https://….git` form; a human reading the
// top of a built file wants the address they can paste into a browser.
const repoUrl = pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");

// Kept in the built files so a copy that has drifted from a project can still be identified.
const banner = `/*! ${pkg.name} v${pkg.version} — ${pkg.description.split(" — ")[0]}
 * ${repoUrl}
 * MIT License, Copyright (c) 2026 ${pkg.author.split(" <")[0]}
 */`;

// Every entry is built in a readable and a minified form. `format` esm keeps the named
// exports; iife exposes a single `Guspira` global for pages that are not using modules.
const targets = [
  { entry: "src/index.js", name: "guspira", format: "esm" },
  { entry: "src/index.js", name: "guspira.iife", format: "iife", global: "Guspira" },
  // The signals layer on its own — it has no DOM dependency, and plenty of sketches want
  // just this part.
  { entry: "src/reactive.js", name: "guspira-reactive", format: "esm" },
  { entry: "src/reactive.js", name: "guspira-reactive.iife", format: "iife", global: "GuspiraReactive" },
];

async function buildAll() {
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });

  for (const target of targets) {
    for (const minify of [false, true]) {
      await build({
        entryPoints: [target.entry],
        outfile: join(outdir, `${target.name}${minify ? ".min" : ""}.js`),
        bundle: true,
        format: target.format,
        globalName: target.global,
        minify,
        // A browser target new enough for the things the source actually uses (static class
        // fields in the custom element, `??`, private-free classes).
        target: ["es2022"],
        charset: "utf8",
        legalComments: "none",
        banner: { js: banner },
        sourcemap: minify ? true : false,
      });
    }
  }

  // The stylesheet ships alongside: the panel needs it, and a single <link> is the whole
  // setup step for anyone using the IIFE build.
  await build({
    entryPoints: ["css/gui.css"],
    outfile: join(outdir, "guspira.css"),
    bundle: true,
    minify: false,
    banner: { css: banner },
  });
  await build({
    entryPoints: ["css/gui.css"],
    outfile: join(outdir, "guspira.min.css"),
    bundle: true,
    minify: true,
    banner: { css: banner },
  });

  await report();
}

async function report() {
  const files = (await readdir(outdir)).filter((f) => !f.endsWith(".map")).sort();
  const rows = [];
  for (const file of files) {
    const source = await readFile(join(outdir, file));
    rows.push({
      file,
      raw: source.length,
      gzip: gzipSync(source).length,
    });
  }

  const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
  const width = Math.max(...rows.map((r) => r.file.length));
  console.log(`\n${outdir}/`);
  for (const r of rows) {
    console.log(`  ${r.file.padEnd(width)}  ${kb(r.raw).padStart(9)}  ${kb(r.gzip).padStart(9)} gzipped`);
  }

  // A machine-readable copy, so the sizes quoted in the README can be checked rather than
  // remembered.
  await writeFile(
    join(outdir, "sizes.json"),
    // No timestamp: dist/ is committed, and a file that changes on every build for no
    // reason turns every rebuild into a diff.
    JSON.stringify({ version: pkg.version, files: rows }, null, 2)
  );
}

if (watch) {
  const ctx = await context({
    entryPoints: ["src/index.js"],
    outfile: join(outdir, "guspira.js"),
    bundle: true,
    format: "esm",
    target: ["es2022"],
    banner: { js: banner },
  });
  await ctx.watch();
  console.log("watching src/ — writing dist/guspira.js on change");
} else {
  await buildAll();
}
