// Micro-benchmarks for the reactive core. Not a test — a way to check that a change to the
// hot paths (signal writes, effect re-tracking) actually moved the number it was meant to.
//
//   node test/bench.mjs

import { signal, effect, batch } from "../src/reactive.js";
import { precision, formatFloat } from "../src/format.js";

const bench = (name, iterations, fn) => {
  fn(); // warm up
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) fn();
  const ns = Number(process.hrtime.bigint() - start) / iterations;
  const rate = 1e9 / ns;
  console.log(
    `  ${name.padEnd(46)} ${ns.toFixed(0).padStart(8)} ns/op  ${
      rate > 1e6 ? `${(rate / 1e6).toFixed(1)}M` : `${(rate / 1e3).toFixed(0)}k`
    }/s`
  );
};

console.log("\nsignal writes");
{
  const s = signal(0);
  let n = 0;
  bench("write, no subscribers", 200000, () => s.set(++n));
}
{
  const s = signal(0);
  effect(() => s());
  let n = 0;
  bench("write, 1 subscriber", 200000, () => s.set(++n));
}
{
  const s = signal(0);
  for (let i = 0; i < 10; i++) effect(() => s());
  let n = 0;
  bench("write, 10 subscribers", 100000, () => s.set(++n));
}
{
  const s = signal(0);
  bench("write, unchanged value (early out)", 200000, () => s.set(0));
}

console.log("\neffect re-tracking (cost of a change scales with deps read)");
for (const deps of [1, 10, 100]) {
  const sigs = Array.from({ length: deps }, (_, i) => signal(i));
  effect(() => sigs.forEach((s) => s()));
  let n = 0;
  bench(`change 1 of ${deps} deps in one effect`, deps > 50 ? 20000 : 100000, () =>
    sigs[0].set(++n)
  );
}
for (const deps of [100]) {
  const sigs = Array.from({ length: deps }, (_, i) => signal(i));
  sigs.forEach((s) => effect(() => s()));
  let n = 0;
  bench(`change 1 of ${deps}, one effect each`, 100000, () => sigs[0].set(++n));
}

console.log("\nbatch");
{
  const sigs = Array.from({ length: 20 }, (_, i) => signal(i));
  effect(() => sigs.forEach((s) => s()));
  let n = 0;
  bench("20 writes, unbatched", 20000, () => sigs.forEach((s) => s.set(++n)));
  bench("20 writes, batched", 20000, () => batch(() => sigs.forEach((s) => s.set(++n))));
}

console.log("\nformatting (runs on every slider step)");
{
  bench("precision(0.05)", 500000, () => precision(0.05));
  bench("formatFloat(0.37, 0.05)", 500000, () => formatFloat(0.37, 0.05));
}
console.log();
