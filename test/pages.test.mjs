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
  for (const page of pages) {
    // --dump-dom returns the DOM after scripts have run; a page that threw during module
    // evaluation leaves its panel and readouts empty.
    const out = spawnSync(
      CHROME,
      [
        "--headless=new",
        // software GL rather than --disable-gpu: the flagship demo is a shader, and a
        // shader that stopped compiling should fail this suite, not render a blank page
        "--use-gl=swiftshader",
        "--no-sandbox",
        "--virtual-time-budget=2500",
        "--dump-dom",
        `http://localhost:${PORT}${page}`,
      ],
      { encoding: "utf8", timeout: 30000 }
    ).stdout || "";

    const isGallery = page.endsWith("/demo/index.html");
    const rows = (out.match(/gui-row/g) || []).length;
    const emptyReadout = /id="state"><\/div>/.test(out);
    // the gallery and the slider page have no panel by design
    const needsPanel = !isGallery && !page.endsWith("range-slider.html");

    // demo/warp.js writes its shader-compile result into a monitor row
    const shaderBroken = /gui-monitor">shader error/.test(out) || /gui-monitor">no WebGL2/.test(out);
    const bad = (needsPanel && rows === 0) || emptyReadout || shaderBroken;
    console.log(
      `  ${bad ? "FAIL" : "ok  "} ${page.padEnd(28)} ${rows} rows` +
        (emptyReadout ? " · readout never filled" : "") +
        (shaderBroken ? " · shader did not compile" : "")
    );
    if (bad) failures++;
  }
} finally {
  server.kill();
}

console.log(failures ? `\n${failures} PAGES BROKEN` : "\nevery page runs without throwing");
process.exit(failures ? 1 : 0);
