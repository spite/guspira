// Load tests for the reactive core. bench.mjs asks how fast a thing is; this asks whether it
// still behaves once there is a lot of it — no missed runs, no doubled runs, nothing left
// subscribed after it was stopped, and no accidental O(n²).
//
// Assertions are on counts and identities rather than on the clock, so the suite does not go
// red on a busy machine. The one timing check compares a size against twice that size, which
// catches quadratic behaviour without caring how fast the host is.
//
//   node test/stress.test.mjs

import { signal, computed, effect, batch, tweened } from "../src/reactive.js";

let failures = 0;
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}${extra ? ` — ${extra}` : ""}`);
  else { console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ""}`); failures++; }
};
const ms = (fn) => { const t = process.hrtime.bigint(); fn(); return Number(process.hrtime.bigint() - t) / 1e6; };

console.log("\nwide fan-out");
{
  const WIDE = 20000;
  const s = signal(0);
  let runs = 0;
  const stops = [];
  for (let i = 0; i < WIDE; i++) stops.push(effect(() => { s(); runs++; }));
  check(`${WIDE} effects each ran once on creation`, runs === WIDE, String(runs));

  runs = 0;
  s.set(1);
  check("one write runs each subscriber exactly once", runs === WIDE, String(runs));

  runs = 0;
  const elapsed = ms(() => { for (let i = 2; i <= 11; i++) s.set(i); });
  check("10 writes run each subscriber exactly once", runs === WIDE * 10, String(runs));
  console.log(`       (${(WIDE * 10).toLocaleString()} effect runs in ${elapsed.toFixed(0)}ms)`);

  // A write that changes nothing must not wake anybody.
  runs = 0;
  s.set(11);
  check("an unchanged write wakes nobody", runs === 0, String(runs));

  // Stopping must actually unsubscribe: a leftover subscriber would still increment.
  stops.forEach((stop) => stop());
  runs = 0;
  s.set(12);
  check("nothing runs after all subscribers stop", runs === 0, String(runs));
}

console.log("\ndeep dependency chain");
{
  const DEEP = 2000;
  const root = signal(0);
  let node = computed(() => root());
  for (let i = 0; i < DEEP; i++) {
    const prev = node;
    node = computed(() => prev() + 1);
  }
  let runs = 0;
  let seen = null;
  effect(() => { seen = node(); runs++; });
  check(`a ${DEEP}-deep chain evaluates correctly`, seen === DEEP, String(seen));

  runs = 0;
  root.set(5);
  check("the tail effect runs once for one write", runs === 1, `${runs} runs`);
  check("…and sees the settled value", seen === DEEP + 5, String(seen));
}

console.log("\ndense graph");
{
  // One source, many computeds, one effect reading all of them: the effect must run once per
  // write no matter how many paths the change reaches it by.
  const FAN = 5000;
  const source = signal(1);
  const mids = [];
  for (let i = 0; i < FAN; i++) mids.push(computed(() => source() + i));
  let runs = 0;
  let total = 0;
  effect(() => { total = mids.reduce((sum, m) => sum + m(), 0); runs++; });
  check(`an effect over ${FAN} computeds ran once`, runs === 1, String(runs));

  runs = 0;
  source.set(2);
  check("one write, one run — not one per path", runs === 1, `${runs} runs`);
  check("…with every branch settled", total === FAN * 2 + (FAN * (FAN - 1)) / 2, String(total));
}

console.log("\nbatching");
{
  const s = signal(0);
  let runs = 0;
  effect(() => { s(); runs++; });
  runs = 0;
  const WRITES = 100000;
  const elapsed = ms(() => batch(() => { for (let i = 1; i <= WRITES; i++) s.set(i); }));
  check(`${WRITES.toLocaleString()} writes in one batch cost one run`, runs === 1, `${runs} runs`);
  console.log(`       (${elapsed.toFixed(0)}ms)`);

  // Nested batches settle once, at the outermost close.
  runs = 0;
  batch(() => { s.set(-1); batch(() => { s.set(-2); batch(() => s.set(-3)); }); });
  check("nested batches settle once", runs === 1, `${runs} runs`);
}

console.log("\nchurn");
{
  // Effects created and stopped over and over must leave nothing behind. A survivor would
  // still increment the counter, so this is exact rather than a memory guess.
  const s = signal(0);
  const CYCLES = 50000;
  let runs = 0;
  const elapsed = ms(() => {
    for (let i = 0; i < CYCLES; i++) {
      const stop = effect(() => { s(); runs++; });
      stop();
    }
  });
  runs = 0;
  s.set(1);
  check(`${CYCLES.toLocaleString()} create/stop cycles leave no subscribers`, runs === 0, `${runs} woke up`);
  console.log(`       (${elapsed.toFixed(0)}ms)`);
}

console.log("\ndependency switching");
{
  // An effect that reads a different signal each pass must drop the one it stopped reading,
  // or every source it ever touched keeps waking it forever.
  const which = signal(0);
  const sources = Array.from({ length: 500 }, (_, i) => signal(i));
  let runs = 0;
  effect(() => { sources[which()](); runs++; });

  for (let i = 1; i < sources.length; i++) which.set(i);

  runs = 0;
  for (let i = 0; i < sources.length - 1; i++) sources[i].set(-1);
  check("abandoned dependencies stop waking the effect", runs === 0, `${runs} runs`);

  runs = 0;
  sources[sources.length - 1].set(-1);
  check("…while the current one still does", runs === 1, `${runs} runs`);
}

console.log("\nnested effects under load");
{
  // The parent re-running many times must leave exactly one live child, not one per pass.
  const outer = signal(0);
  const inner = signal(0);
  let childRuns = 0;
  const PASSES = 20000;
  const stop = effect(() => { outer(); effect(() => { inner(); childRuns++; }); });

  const elapsed = ms(() => { for (let i = 1; i <= PASSES; i++) outer.set(i); });
  childRuns = 0;
  inner.set(1);
  check(`${PASSES.toLocaleString()} parent passes leave one live child`, childRuns === 1, `${childRuns} ran`);
  console.log(`       (${elapsed.toFixed(0)}ms)`);

  stop();
  childRuns = 0;
  inner.set(2);
  check("stopping the parent takes the child with it", childRuns === 0, `${childRuns} ran`);
}

console.log("\nruntime scaling");
{
  // Doubling the number of subscribers should roughly double the work. Draining used to take
  // the queue apart one entry at a time, which meant a fresh Set iterator per effect walking
  // past everything already removed — quadratic, and it landed near 4x here. Linear measures
  // about 2x, so the ceiling sits between the two with room for a noisy host.
  const once = (count) => {
    const s = signal(0);
    for (let i = 0; i < count; i++) effect(() => s());
    return ms(() => { for (let i = 1; i <= 50; i++) s.set(i); });
  };
  // The best of several runs rather than one. Noise on a busy machine only ever adds time, so
  // the minimum is the closest thing to the cost of the work itself — a single run made this
  // check flap between 1.9x and 3.2x on an otherwise idle laptop.
  const timeFor = (count) => Math.min(once(count), once(count), once(count));
  once(1000); // warm up
  const small = timeFor(5000);
  const large = timeFor(10000);
  const ratio = large / Math.max(small, 0.01);
  check("doubling subscribers does not square the cost", ratio < 3,
        `${small.toFixed(0)}ms -> ${large.toFixed(0)}ms (${ratio.toFixed(1)}x for 2x the work)`);
}

console.log("\ntweens under load");
{
  const COUNT = 2000;
  const tweens = Array.from({ length: COUNT }, () => tweened(0, 50));
  batch(() => tweens.forEach((t, i) => t.set(i)));
  // Tweens advance on a clock. Without a frame loop the value has not arrived yet, but the
  // target — which is what the panel, presets and persistence read — is correct immediately.
  const settled = tweens.filter((t, i) => t.peek() === i).length;
  check(`${COUNT} tweens all took their target`, tweens.every((t, i) => t.target.peek() === i),
        `${settled}/${COUNT} already at rest`);

  // Jumped to rest, so none of them is still booking frames when the suite exits.
  tweens.forEach((t, i) => t.reset(i));
}

console.log("\nrunaway guard");
{
  // An effect that writes what it reads cannot settle. It must give up with an error rather
  // than spin forever — a hang is much worse than a throw.
  const s = signal(0);
  const realError = console.error;
  console.error = () => {};
  let message = "never threw";
  const elapsed = ms(() => {
    try {
      effect(() => s.set(s() + 1));
      s.set(1);
    } catch (error) {
      message = error.message;
    }
  });
  console.error = realError;
  check("a self-feeding effect gives up instead of hanging",
        /never settled/.test(message), `${message.slice(0, 60)} (${elapsed.toFixed(0)}ms)`);
}

{
  // A pass that is merely large is not a runaway: the guard counts how often one effect
  // repeats, not how many effects there are.
  const wide = signal(0);
  const WIDE = 120000;
  let wideRuns = 0;
  const stops = [];
  for (let i = 0; i < WIDE; i++) stops.push(effect(() => { wide(); wideRuns++; }));
  wideRuns = 0;
  let wideMessage = "";
  try { wide.set(1); } catch (error) { wideMessage = error.message; }
  check(`one write reaching ${WIDE.toLocaleString()} effects is not mistaken for a loop`,
        wideRuns === WIDE && wideMessage === "", `${wideRuns} ran${wideMessage ? ` — ${wideMessage.slice(0, 40)}` : ""}`);
  stops.forEach((stop) => stop());
}

console.log("\nmemory");
{
  if (typeof globalThis.gc === "function") {
    const s = signal(0);
    globalThis.gc();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 100000; i++) {
      const stop = effect(() => s());
      stop();
    }
    globalThis.gc();
    const grew = (process.memoryUsage().heapUsed - before) / 1024 / 1024;
    check("100k stopped effects are collectable", grew < 8, `heap grew ${grew.toFixed(1)}MB`);
  } else {
    console.log("  --   heap growth: run with `node --expose-gc test/stress.test.mjs` to measure");
  }
}

console.log(failures ? `\n${failures} FAILURES` : "\nall stress tests passed");
process.exit(failures ? 1 : 0);
