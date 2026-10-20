import type { Signal } from "./reactive.js";

export interface CounterOptions {
  /** Report the mean over this many milliseconds. */
  average?: number;
}

/** A counter is a signal with the measuring methods on it. */
export interface CounterSignal extends Signal<number> {
  readonly counterName: string;
  readonly isCounter: true;
}

export interface Timer extends CounterSignal {
  start(): this;
  end(): this;
  /** End, then start: the gap between successive calls. */
  tick(): this;
}

export interface FpsCounter extends CounterSignal {
  tick(): this;
}

export interface Counter extends CounterSignal {
  sample(value: number): this;
  add(amount?: number): this;
  clear(): this;
}

export interface Stats {
  timer(name: string, options?: CounterOptions): Timer;
  /** `window` is the milliseconds frames are counted over. */
  fps(options?: CounterOptions & { window?: number }): FpsCounter;
  counter(name: string, options?: CounterOptions): Counter;
  /** Publishes every counter in one batch. */
  flush(): void;
  counters(): Signal<number>[];
}

export function createStats(options?: { clock?: () => number }): Stats;
