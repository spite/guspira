// Loads every page in a headless browser and fails if one threw. Three demos have shipped
// broken during development for the same reason — an effect runs the moment it is created,
// so a `let` declared below the effect that reads it is still in its temporal dead zone —
// and each time it was only caught by looking at the page. This catches it.
//
// Skipped (with a note) when no Chrome is around, so `npm test` still works anywhere.

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
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

const pages = [
  "/index.html",
  ...readdirSync(join(root, "demo"))
    .filter((f) => f.endsWith(".html"))
    .map((f) => `/demo/${f}`),
];

const server = spawn(
  process.execPath,
  [
    "-e",
    `const http=require("http"),fs=require("fs"),path=require("path");
     const types={".html":"text/html",".js":"text/javascript",".mjs":"text/javascript",".css":"text/css",".json":"application/json"};
     http.createServer((req,res)=>{
       const file=path.join(${JSON.stringify(root)}, decodeURIComponent(req.url.split("?")[0]));
       fs.readFile(file,(e,d)=>{
         if(e){res.writeHead(404);res.end();return;}
         res.writeHead(200,{"content-type":types[path.extname(file)]||"application/octet-stream"});
         res.end(d);
       });
     }).listen(${PORT});`,
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
  const load = (page, budget) =>
    spawnSync(
      CHROME,
      [
        "--headless=new",
        // software GL rather than --disable-gpu: the flagship demo is a shader, and a
        // shader that stopped compiling should fail this suite, not render a blank page
        "--use-gl=swiftshader",
        "--no-sandbox",
        `--virtual-time-budget=${budget}`,
        "--dump-dom",
        `http://localhost:${PORT}${page}`,
      ],
      { encoding: "utf8", timeout: 30000 }
    ).stdout || "";

  const verdict = (page, out) => {
    const isGallery = page.endsWith("/demo/index.html");
    const rows = (out.match(/gui-row/g) || []).length;
    const emptyReadout = /id="state"><\/div>/.test(out);
    // the gallery and the slider page have no panel by design
    const needsPanel = !isGallery && !page.endsWith("range-slider.html");

    // demo/warp.js writes its shader-compile result into a monitor row
    const shaderBroken = /gui-monitor">shader error/.test(out) || /gui-monitor">no WebGL2/.test(out);
    const bad = (needsPanel && rows === 0) || emptyReadout || shaderBroken;
    return { bad, rows, emptyReadout, shaderBroken };
  };

  for (const page of pages) {
    // --dump-dom returns the DOM after scripts have run; a page that threw during module
    // evaluation leaves its panel and readouts empty.
    let result = verdict(page, load(page, 2500));
    if (result.bad) result = verdict(page, load(page, 8000));

    console.log(
      `  ${result.bad ? "FAIL" : "ok  "} ${page.padEnd(28)} ${result.rows} rows` +
        (result.emptyReadout ? " · readout never filled" : "") +
        (result.shaderBroken ? " · shader did not compile" : "")
    );
    if (result.bad) failures++;
  }
  // The DOM suites are the only place drags, key presses and destroy() are exercised, and
  // they run in a browser rather than here. Three times a duplicate `const` in test/index.html
  // has thrown during module evaluation, taking every assertion in the file with it and
  // leaving a page that reports nothing at all — which looks exactly like a page nobody ran.
  // So the summary is read back: no summary is a failure, not a silence.
  for (const suite of ["/test/index.html", "/test/dist.html"]) {
    const out =
      spawnSync(
        CHROME,
        [
          "--headless=new",
          "--use-gl=swiftshader",
          "--no-sandbox",
          "--virtual-time-budget=12000",
          "--dump-dom",
          `http://localhost:${PORT}${suite}`,
        ],
        { encoding: "utf8", timeout: 60000 }
      ).stdout || "";

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
}

console.log(failures ? `\n${failures} PAGES BROKEN` : "\nevery page runs, and both browser suites pass");
process.exit(failures ? 1 : 0);
