// Runs in plain node: the reactive core must not need a DOM, a bundler, or a browser
// clock. Anything that breaks that breaks "usable on its own".
import {
  signal, computed, effect, effectRAF, batch, untrack, tweened, toSignal,
  createScheduler, microtask, easings,
} from "../src/reactive.js";
import { precision, formatFloat, snap } from "../src/format.js";
import { normalizeCurve, assertCurveRange, curveToValue, valueToCurve } from "../src/curve.js";
import { createStats } from "../src/stats.js";

let failures = 0;
const check = (name, cond) => {
  if (cond) console.log(`  ok   ${name}`);
  else { console.log(`  FAIL ${name}`); failures++; }
};

// basic tracking
const a = signal(1);
let runs = 0;
let seen = null;
effect(() => { runs++; seen = a(); });
check("effect runs immediately", runs === 1 && seen === 1);
a.set(2);
check("effect re-runs on change", runs === 2 && seen === 2);
a.set(2);
check("setting the same value is a no-op", runs === 2);

// array equality
const arr = signal([1, 2]);
let arrRuns = 0;
effect(() => { arr(); arrRuns++; });
arr.set([1, 2]);
check("equal arrays do not trigger", arrRuns === 1);
arr.set([1, 3]);
check("different arrays trigger", arrRuns === 2);

// peek
let peekRuns = 0;
const p = signal(0);
effect(() => { peekRuns++; p.peek(); });
p.set(5);
check("peek does not subscribe", peekRuns === 1);

// computed
const b = signal(2);
const sum = computed(() => a() + b());
check("computed initial", sum() === 4);
let cRuns = 0;
effect(() => { cRuns++; sum(); });
b.set(10);
check("computed propagates", sum() === 12 && cRuns === 2);

// stop
const s = signal(0);
let stopRuns = 0;
const stop = effect(() => { stopRuns++; s(); });
s.set(1);
stop();
s.set(2);
check("stopped effect stops re-running", stopRuns === 2);

// batch
const x = signal(0), y = signal(0);
let batchRuns = 0;
effect(() => { batchRuns++; x(); y(); });
batch(() => { x.set(1); y.set(1); });
check("batch coalesces into one run", batchRuns === 2);

// untrack
const u = signal(0);
let uRuns = 0;
effect(() => { uRuns++; untrack(() => u()); });
u.set(1);
check("untrack does not subscribe", uRuns === 1);

// nested effects: the inner one must not swallow the outer's later reads
const outer = signal(0), inner = signal(0);
let outerRuns = 0, innerRuns = 0;
effect(() => {
  outerRuns++;
  effect(() => { innerRuns++; inner(); });
  outer(); // read AFTER the nested effect ran
});
outer.set(1);
check("outer effect still tracks reads after a nested effect", outerRuns === 2);

// dynamic dependencies drop stale ones
const cond = signal(true), left = signal("L"), right = signal("R");
let dynRuns = 0;
effect(() => { dynRuns++; cond() ? left() : right(); });
cond.set(false);
right.set("R2");
const afterRight = dynRuns;
left.set("L2");
check("stale dependency is dropped", dynRuns === afterRight);

// toSignal
const wrapped = toSignal(7);
check("toSignal wraps a plain value", wrapped() === 7);
check("toSignal passes a signal through", toSignal(a) === a);

// tweened with duration 0 is immediate
const t = tweened(0, 0);
t.set(10);
check("tweened(0) sets immediately", t() === 10);
t.reset(3);
check("tweened reset jumps", t() === 3);

// --- standalone: no DOM, no requestAnimationFrame ---------------------------------
check("running without a browser frame clock", typeof requestAnimationFrame === "undefined");
check("computed exposes peek without subscribing", sum.peek() === sum());

// --- format helpers ----------------------------------------------------------------
check("precision(1)", precision(1) === 0);
check("precision(0.5)", precision(0.5) === 1);
check("precision(0.25)", precision(0.25) === 2, String(precision(0.25)));
check("precision(0.05)", precision(0.05) === 2, String(precision(0.05)));
check("precision(0.005)", precision(0.005) === 3, String(precision(0.005)));
// the bug this replaced: -log10 rounding put 0.15 on a 0.1 grid
check("snap keeps a 0.05 grid", snap(0.15, 0.05, 0, 1) === 0.15, String(snap(0.15, 0.05, 0, 1)));
check("snap keeps a 0.25 grid", snap(0.75, 0.25, 0, 1) === 0.75, String(snap(0.75, 0.25, 0, 1)));
check("snap clamps to the range", snap(9, 0.5, 0, 1) === 1);
check("formatFloat pads to the step", formatFloat(1, 0.05) === "1.00", formatFloat(1, 0.05));

// performance counters — measured against a clock we control, so the numbers are exact
{
  let time = 0;
  const clock = () => time;
  const stats = createStats({ clock });
  const frame = stats.timer("frame");
  const fps = stats.fps();
  const drawn = stats.counter("drawn");

  frame.start();
  time += 16;
  frame.end();
  drawn.add(3);
  drawn.add(2);
  stats.flush();
  check("a timer reports the span it bracketed", frame() === 16, String(frame()));
  check("a counter accumulates within the frame", drawn() === 5, String(drawn()));

  // The bug this guards: naming a counter method `set` overwrote the signal's own write
  // method, so flush() measured instead of publishing and the value never moved.
  drawn.clear();
  drawn.sample(42);
  stats.flush();
  check("sample() records without shadowing signal.set", drawn() === 42, String(drawn()));
  check("the signal's own set is intact", typeof drawn.set === "function" && drawn.set !== drawn.sample);

  // fps counts frames inside a window rather than inverting one frame, so it publishes only
  // once that window is up. On its own clock, because the counters above have already moved
  // the shared one and the window would start part-spent.
  {
    let fpsTime = 0;
    const fpsStats = createStats({ clock: () => fpsTime });
    const rate = fpsStats.fps();
    for (let i = 0; i < 62; i++) {
      fpsTime += 16;
      rate.tick();
    }
    fpsStats.flush();
    check("fps says nothing until its window closes", rate() === 0, `${rate()} at ${fpsTime}ms`);
    fpsTime += 16;
    rate.tick();
    fpsStats.flush();
    check("fps counts the frames in the window", Math.abs(rate() - 62.5) < 0.6, String(rate()));
  }

  // tick() is end-then-start: the gap between calls
  const gap = stats.timer("gap");
  gap.tick();
  time += 20;
  gap.tick();
  stats.flush();
  check("tick measures the gap between calls", gap() === 20, String(gap()));

  // an averaging window holds one figure until the window is up
  const avgStats = createStats({ clock });
  const smooth = avgStats.timer("smooth", { average: 100 });
  const raw = avgStats.timer("raw");
  const before = time;
  for (const ms of [10, 20, 30, 40]) {
    smooth.start();
    raw.start();
    time += ms;
    smooth.end();
    raw.end();
    if (time - before < 100) avgStats.flush();
  }
  check("a raw timer follows every frame", raw() === 30, String(raw()));
  avgStats.flush();
  check("an averaged timer reports the mean of its window", Math.abs(smooth() - 25) < 1e-9, String(smooth()));

  // flush is one batched write however many counters there are
  let passes = 0;
  const batched = createStats({ clock });
  const one = batched.timer("one");
  const two = batched.timer("two");
  const three = batched.counter("three");
  effect(() => { one(); two(); three(); passes++; });
  passes = 0;
  one.start(); time += 1; one.end();
  two.start(); time += 2; two.end();
  three.add(1);
  batched.flush();
  check("flush costs one pass of effects for every counter", passes === 1, String(passes));

  check("counters() lists what was made", batched.counters().length === 3, String(batched.counters().length));
}

// slider curves — pure arithmetic, which is why they live outside the element
{
  const near = (a, b, tolerance = 1e-9) => Math.abs(a - b) < tolerance;

  check("linear is the default", normalizeCurve(undefined) === 1);
  check("an attribute string becomes a number", normalizeCurve("2") === 2);
  check("log survives as itself", normalizeCurve("log") === "log");
  for (const bad of ["logarithmic", 0, -1, "abc", NaN]) {
    let refused = false;
    try { normalizeCurve(bad); } catch { refused = true; }
    check(`curve ${JSON.stringify(bad)} is refused`, refused);
  }

  check("linear midpoint is half the range", curveToValue(0.5, 0, 10, 1) === 5);
  check("curve 2 midpoint is a quarter", curveToValue(0.5, 0, 10, 2) === 2.5);
  check("curve 0.5 midpoint is past two thirds", near(curveToValue(0.5, 0, 10, 0.5), 7.0710678, 1e-6));
  check("a log midpoint is the geometric mean", near(curveToValue(0.5, 20, 20000, "log"), 632.4555, 1e-3));
  check("a log quarter is the same ratio again", near(curveToValue(0.25, 20, 20000, "log"), 112.468, 1e-3));

  // The two directions have to agree, or the thumb sits somewhere the drag will not put it.
  let worst = 0;
  for (const curve of [1, 2, 3, 0.5, "log"]) {
    const [min, max] = curve === "log" ? [20, 20000] : [-5, 10];
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      worst = Math.max(worst, Math.abs(valueToCurve(curveToValue(t, min, max, curve), min, max, curve) - t));
    }
  }
  check("every curve round-trips position -> value -> position", worst < 1e-12, worst.toExponential(1));

  // A power curve is applied to the normalised position, so a range through zero is fine.
  check("a range crossing zero still works", curveToValue(0.5, -5, 5, 2) === -2.5);

  let logThroughZero = false;
  try { assertCurveRange("log", 0, 100, "addSlider"); } catch { logThroughZero = true; }
  check("a log range touching zero is refused", logThroughZero);
  let logCrossing = false;
  try { assertCurveRange("log", -10, 10, "addSlider"); } catch { logCrossing = true; }
  check("a log range crossing zero is refused", logCrossing);
  let linearThroughZero = false;
  try { assertCurveRange(2, 0, 100, "addSlider"); } catch { linearThroughZero = true; }
  check("a number curve through zero is fine", !linearThroughZero);
}

// --- the scheduled pieces fall back to timers -------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const a2 = signal(0);
let rafRuns = 0;
const scheduled = effectRAF(() => {
  rafRuns++;
  a2();
});
check("effectRAF runs immediately", rafRuns === 1);
a2.set(1);
a2.set(2);
a2.set(3);
check("effectRAF defers", rafRuns === 1);
await sleep(60);
check("effectRAF coalesces into one deferred run", rafRuns === 2, `runs=${rafRuns}`);

scheduled.pause();
a2.set(4);
await sleep(60);
check("paused effectRAF does not run", rafRuns === 2);
scheduled.resume();
check("resume catches up once", rafRuns === 3);
scheduled.stop();
a2.set(5);
await sleep(60);
check("stopped effectRAF stays stopped", rafRuns === 3);

const t2 = tweened(0, 120);
t2.set(10);
await sleep(40);
const mid = t2();
check("tweened animates without rAF", mid > 0 && mid < 10, String(mid));
await sleep(160);
check("tweened lands on its target", t2() === 10, String(t2()));

// --- schedulers: the app decides when reactive work happens ------------------------
const queue = createScheduler();
const q1 = signal(0);
const q2 = signal(0);
let queuedRuns = 0;
const queued = effect(() => {
  q1();
  q2();
  queuedRuns++;
}, { scheduler: queue });

check("a scheduled effect still runs once on creation", queuedRuns === 1);
q1.set(1);
q2.set(2);
q1.set(3);
check("changes do not run it", queuedRuns === 1);
check("the queue holds one job, not three", queue.size === 1, `size=${queue.size}`);
check("flush() runs it and reports how many", queue.flush() === 1 && queuedRuns === 2);
check("an empty flush is free", queue.flush() === 0 && queuedRuns === 2);

// work queued while flushing belongs to the next flush, not this one
const chain = signal(0);
const echo = signal(0);
let chainRuns = 0;
effect(() => {
  chain();
  chainRuns++;
  echo.set(chain.peek());
}, { scheduler: queue });
let echoRuns = 0;
effect(() => {
  echo();
  echoRuns++;
}, { scheduler: queue });
chain.set(1);
queue.flush();
check("a flush does not cascade indefinitely", queue.size === 1, `size=${queue.size}`);
queue.flush();
check("the cascade lands on the next flush", echoRuns === 2, `runs=${echoRuns}`);

// pausing the queue pauses everything on it
queue.pause();
q1.set(99);
check("a paused queue does not run", queuedRuns === 2);
check("…but still collects", queue.size > 0);
queue.resume();
check("resume flushes what piled up", queuedRuns === 3);

// clear drops pending work
q1.set(123);
queue.clear();
check("clear() drops the queue", queue.size === 0);
queue.flush();
check("…and the work never ran", queuedRuns === 3);

queued.stop();
q1.set(7);
check("stopping a scheduled effect unqueues it", queue.size === 0);

// --- effect handles ------------------------------------------------------------------
const h = signal(0);
let hRuns = 0;
const handle = effect(() => {
  h();
  hRuns++;
});
handle(); // the handle is itself the stop function
h.set(1);
check("the returned handle stops the effect when called", hRuns === 1);

let lazyRuns = 0;
const lazy = effect(() => {
  h();
  lazyRuns++;
}, { lazy: true });
check("a lazy effect does not run on creation", lazyRuns === 0);
lazy.run();
check("…until it is run", lazyRuns === 1);
lazy.stop();

// --- microtask scheduler ---------------------------------------------------------------
const micro = microtask;
const m = signal(0);
let microRuns = 0;
effect(() => {
  m();
  microRuns++;
}, { scheduler: micro });
m.set(1);
m.set(2);
check("a microtask effect defers within the turn", microRuns === 1);
await Promise.resolve();
check("…and has run by the next turn, once", microRuns === 2, `runs=${microRuns}`);

// --- robustness ----------------------------------------------------------------------
// console.error is muted here: several of these deliberately make effects throw, and the
// point is that the library keeps going, not that it stays quiet about it.
const realError = console.error;
const swallowed = [];
console.error = (...args) => swallowed.push(args);

// one throwing effect must not take the rest of the pass with it
{
  const s1 = signal(0);
  let after = 0;
  effect(() => {
    s1();
    if (s1() === 1) throw new Error("boom");
  });
  effect(() => {
    s1();
    after++;
  });
  s1.set(1);
  check("an effect after a throwing one still runs", after === 2, `ran ${after}x`);
  check("the throw was reported", swallowed.length > 0);
}

// …and the same on a queue
{
  const q = createScheduler();
  const s2 = signal(0);
  let after = 0;
  effect(() => {
    s2();
    if (s2() === 1) throw new Error("boom");
  }, { scheduler: q });
  effect(() => {
    s2();
    after++;
  }, { scheduler: q });
  s2.set(1);
  q.flush();
  check("a queue survives a job that throws", after === 2, `ran ${after}x`);
  check("…and does not strand the rest", q.size === 0);
}

// an effect that returns a function is handing back its teardown
{
  const s3 = signal(0);
  const log = [];
  const stopIt = effect(() => {
    const v = s3();
    log.push(`run ${v}`);
    return () => log.push(`cleanup ${v}`);
  });
  s3.set(1);
  check("cleanup runs before the next run", log.join() === "run 0,cleanup 0,run 1", log.join());
  stopIt();
  check("cleanup runs on stop", log[log.length - 1] === "cleanup 1", log.join());
  s3.set(2);
  check("a stopped effect stays stopped", log.length === 4);
}

// cleanup must not subscribe the effect to whatever it reads
{
  const watched = signal(0);
  const other = signal(0);
  let runs = 0;
  effect(() => {
    watched();
    runs++;
    return () => other(); // reading inside cleanup
  });
  watched.set(1);
  other.set(1);
  check("cleanup reads do not subscribe", runs === 2, `${runs} runs`);
}

// a value and something derived from it wake an effect once, not twice
{
  const w = signal(1);
  const doubled = computed(() => w() * 2);
  let runs = 0;
  let stale = false;
  effect(() => {
    runs++;
    if (doubled() !== w() * 2) stale = true;
  });
  w.set(2);
  check("a diamond runs the effect once", runs === 2, `${runs - 1} runs per change`);
  check("…and never with a stale derived value", !stale);
}

// an effect that writes what it reads fails loudly rather than blowing the stack
{
  const spin = signal(0);
  let message = "";
  try {
    effect(() => spin.set(spin() + 1));
  } catch (e) {
    message = e.message;
  }
  check("a self-writing effect is caught", message.includes("never settled"), message.slice(0, 60));
}

// tweened is for numbers
{
  const t2 = tweened(5, 0);
  t2.set("nope");
  check("tweened refuses a non-number", t2() === 5, String(t2()));
}

// duration and easing are writable, so they can sit behind a control
{
  const t3 = tweened(0, 500);
  t3.duration = 0;
  check("tweened duration is writable", t3.duration === 0);
  t3.set(4);
  check("…and a zero duration lands immediately", t3() === 4, String(t3()));
  t3.easing = easings.cubicOut;
  check("tweened easing is writable", t3.easing === easings.cubicOut);
  t3.easing = "not a function";
  check("…and a bad easing falls back to linear", t3.easing(0.5) === 0.5);
}

// an effect created inside another belongs to it, or an effect that creates effects starts a
// fresh one on every pass and never disposes the last
{
  const outer = signal(0);
  const inner = signal(0);
  let childRuns = 0;
  const stop = effect(() => {
    outer();
    effect(() => { inner(); childRuns++; });
  });
  for (let i = 1; i <= 5; i++) outer.set(i);
  childRuns = 0;
  inner.set(99);
  check("only the newest child is live after the parent re-runs", childRuns === 1, String(childRuns));

  stop();
  childRuns = 0;
  inner.set(100);
  check("children stop with the parent", childRuns === 0, String(childRuns));

  // grandchildren, and the child's own teardown
  const seq = [];
  let deepRuns = 0;
  const deep = signal(0);
  const stopDeep = effect(() => {
    effect(() => {
      effect(() => { deep(); deepRuns++; });
      return () => seq.push("child-cleanup");
    });
  });
  stopDeep();
  deepRuns = 0;
  deep.set(1);
  check("grandchildren stop too", deepRuns === 0, String(deepRuns));
  check("a child's cleanup runs when the parent disposes it", seq.includes("child-cleanup"), seq.join(","));

  // untrack is the way to opt out and keep an effect alive past its creator
  let looseRuns = 0;
  const loose = signal(0);
  const stopLoose = effect(() => {
    outer();
    untrack(() => effect(() => { loose(); looseRuns++; }));
  });
  stopLoose();
  looseRuns = 0;
  loose.set(1);
  check("untrack opts out of ownership", looseRuns === 1, String(looseRuns));

  // a computed built inside an effect is owned on the same terms
  let recomputes = 0;
  const source = signal(1);
  const stopHost = effect(() => {
    const c = computed(() => { recomputes++; return source(); });
    c();
  });
  stopHost();
  recomputes = 0;
  source.set(5);
  check("a computed created inside an effect is owned by it", recomputes === 0, String(recomputes));
}

// the shipped easings all map 0..1 onto 0..1
{
  const names = Object.keys(easings);
  const wrong = names.filter((n) => Math.abs(easings[n](0)) > 1e-6 || Math.abs(easings[n](1) - 1) > 1e-6);
  check("easings all start at 0 and end at 1", wrong.length === 0, wrong.join(", "));
  check("there is more than one of them", names.length === 8, String(names.length));
}

console.error = realError;

console.log(failures ? `\n${failures} FAILURES` : "\nall reactive tests passed");
process.exit(failures ? 1 : 0);
