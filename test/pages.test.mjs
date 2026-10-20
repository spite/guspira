// Loads every page in a headless browser and fails if one threw. Three demos have shipped
// broken during development for the same reason — an effect runs the moment it is created,
// so a `let` declared below the effect that reads it is still in its temporal dead zone —
// and each time it was only caught by looking at the page. This catches it.
//
// Skipped (with a note) when no Chrome is around, so `npm test` still works anywhere.

import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const PORT = 8111;

const CHROME = [
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => existsSync(p));

if (!CHROME) {
  console.log("  --   no Chrome found; page tests skipped");
  process.exit(0);
}

// A profile of its own, so a run never joins a browser that is already open: without one
// Chrome hands the page to the running instance and this process waits on nothing.
// Windows Chrome reached from WSL needs a Windows path, and is not killed by a signal sent
// from here, so its processes are stopped by that profile path once each run is over.
const WSL = CHROME.startsWith("/mnt/");
const drive = WSL ? CHROME.split("/")[2] : "";
const profileDir = WSL
  ? join(`/mnt/${drive}/Temp`, `guspira-test-${process.pid}`)
  : mkdtempSync(join(tmpdir(), "guspira-test-"));
if (WSL) mkdirSync(profileDir, { recursive: true });
const profileArg = WSL
  ? `${drive.toUpperCase()}:\\Temp\\guspira-test-${process.pid}`
  : profileDir;

const reap = () => {
  if (!WSL) return;
  spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | ` +
        `Where-Object { $_.CommandLine -like '*guspira-test-${process.pid}*' } | ` +
        `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
    ],
    { stdio: "ignore" }
  );
};

const chrome = (page, budget, timeout) => {
  const run = spawnSync(
    CHROME,
    [
      "--headless=new",
      `--user-data-dir=${profileArg}`,
      "--mute-audio",
      // software GL rather than --disable-gpu: the flagship demo is a shader, and a
      // shader that stopped compiling should fail this suite, not render a blank page
      "--use-gl=swiftshader",
      "--no-sandbox",
      `--virtual-time-budget=${budget}`,
      "--dump-dom",
      `http://localhost:${PORT}${page}`,
    ],
    { encoding: "utf8", timeout }
  );
  reap();
  return run;
};

const pages = [
  "/index.html",
  ...readdirSync(join(root, "demo"))
    .filter((f) => f.endsWith(".html"))
    .map((f) => `/demo/${f}`),
];

// This machine only, and only this folder: it is a file server for the length of a test run.
const server = spawn(
  process.execPath,
  [
    "-e",
    `const http=require("http"),fs=require("fs"),path=require("path");
     const types={".html":"text/html",".js":"text/javascript",".mjs":"text/javascript",".css":"text/css",".json":"application/json"};
     const root=${JSON.stringify(root)};
     http.createServer((req,res)=>{
       const file=path.join(root, decodeURIComponent(req.url.split("?")[0]));
       if(!file.startsWith(root)){res.writeHead(403);res.end();return;}
       fs.readFile(file,(e,d)=>{
         if(e){res.writeHead(404);res.end();return;}
         res.writeHead(200,{"content-type":types[path.extname(file)]||"application/octet-stream"});
         res.end(d);
       });
     }).listen(${PORT}, "127.0.0.1");`,
  ],
  { stdio: "ignore" }
);

await new Promise((r) => setTimeout(r, 400));

let failures = 0;
try {
  // Loading a page is a race against a fixed time budget, and the flagship demo has a shader
  // to compile under software GL. A page that is genuinely broken fails every time; one that
  // merely ran out of budget on a busy machine passes on the second go. Retried once, so the
  // suite reports breakage rather than load.
  //
  // The wall-clock timeout scales with the budget instead of sitting at a flat 30s. Virtual
  // time runs faster than the clock, but compiling a shader under swiftshader costs real
  // seconds either way — and a killed Chrome flushes no DOM at all, so a retry that asked for
  // more budget under the same wall-clock ceiling reported "0 rows" and looked like breakage.
  const load = (page, budget) => {
    const run = chrome(page, budget, Math.max(30000, budget * 8));
    // Killed on the timeout: an empty DOM here says nothing about the page.
    const killed = run.error?.code === "ETIMEDOUT" || run.signal !== null;
    return { out: run.stdout || "", killed };
  };

  const verdict = (page, { out, killed }) => {
    const isGallery = page.endsWith("/demo/index.html");
    const rows = (out.match(/gui-row/g) || []).length;
    const emptyReadout = /id="state"><\/div>/.test(out);
    // the gallery and the slider page have no panel by design
    const needsPanel = !isGallery && !page.endsWith("range-slider.html");

    // demo/warp.js writes its shader-compile result into a monitor row
    const shaderBroken = /gui-monitor">[^<]*(shader error|no WebGL2)/.test(out);
    const bad = (needsPanel && rows === 0) || emptyReadout || shaderBroken;
    return { bad, rows, emptyReadout, shaderBroken, killed };
  };

  for (const page of pages) {
    // --dump-dom returns the DOM after scripts have run; a page that threw during module
    // evaluation leaves its panel and readouts empty.
    let result = verdict(page, load(page, 2500));
    if (result.bad) result = verdict(page, load(page, 8000));

    console.log(
      `  ${result.bad ? "FAIL" : "ok  "} ${page.padEnd(28)} ${result.rows} rows` +
        (result.emptyReadout ? " · readout never filled" : "") +
        (result.shaderBroken ? " · shader did not compile" : "") +
        // Named rather than left to look like an empty page, so a slow machine is not
        // mistaken for a broken demo the next time this fails.
        (result.killed ? " · browser killed on the wall-clock timeout" : "")
    );
    if (result.bad) failures++;
  }
  // The DOM suites are the only place drags, key presses and destroy() are exercised, and
  // they run in a browser rather than here. Three times a duplicate `const` in test/index.html
  // has thrown during module evaluation, taking every assertion in the file with it and
  // leaving a page that reports nothing at all — which looks exactly like a page nobody ran.
  // So the summary is read back: no summary is a failure, not a silence.
  // The narrow-viewport suite loads every page again inside an iframe, so it needs longer.
  for (const [suite, budget] of [
    ["/test/index.html", 12000],
    ["/test/dist.html", 12000],
    ["/test/mobile.html", 40000],
  ]) {
    const out = chrome(suite, budget, 120000).stdout || "";

    const text = out.replace(/<[^>]+>/g, "\n");
    const passed = (text.match(/^\s*ok\s{2,}/gm) || []).length;
    const summary = text.match(/^\s*(ALL PASS|\d+ FAILURES)\s*$/m);
    const bad = !summary || summary[1] !== "ALL PASS" || passed === 0;
    console.log(
      `  ${bad ? "FAIL" : "ok  "} ${suite.padEnd(28)} ${passed} checks` +
        (summary ? ` · ${summary[1]}` : " · no summary — the suite threw before it finished")
    );
    if (bad) failures++;
  }
} finally {
  server.kill();
  reap();
  // Windows can hold the profile's files for a moment after the browser is gone.
  try {
    rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {}
}

console.log(failures ? `\n${failures} PAGES BROKEN` : "\nevery page runs, and both browser suites pass");
process.exit(failures ? 1 : 0);
