/** A value that can be read and subscribed to. Call it to read; inside an effect that subscribes. */
export interface ReadonlySignal<T> {
  (): T;
  /** Reads without subscribing. */
  peek(): T;
  readonly isSignal: true;
}

/** A signal that can be written. */
export interface WritableSignal<T> extends ReadonlySignal<T> {
  set(value: T): void;
  update(updater: (value: T) => T): void;
}

export interface Signal<T> extends WritableSignal<T> {
  /** What was last set: the signal itself, or on a tween the destination it is travelling to. */
  readonly target: WritableSignal<T>;
}

export interface Computed<T> extends ReadonlySignal<T> {
  stop(): void;
}

/** Maps progress 0..1 to eased progress. */
export type Easing = (t: number) => number;

export interface Tweened<T> extends Signal<T> {
  /** Jumps to a value without animating. */
  reset(value: T): void;
  /** Milliseconds a write takes to arrive. */
  duration: number;
  easing: Easing;
}

/** What a queue is handed: the effect waiting for its turn. */
export interface EffectJob {
  run(): unknown;
  /** Runs unless the effect was paused while it waited. */
  runQueued(): void;
}

export interface Scheduler {
  schedule(job: EffectJob): void;
  /** Takes a waiting job back out. True if it was queued. */
  unschedule(job: EffectJob): boolean;
  /** Runs everything queued and returns how many jobs ran. */
  flush(): number;
  readonly size: number;
  /** Drops pending work without running it. */
  clear(): void;
  pause(): void;
  resume(): void;
  readonly paused: boolean;
}

export interface EffectOptions {
  /** A queue to wait in, or a function handed the job to run later. */
  scheduler?: Scheduler | ((job: EffectJob) => void);
  /** Create the effect without running it. */
  lazy?: boolean;
}

/** Calling it stops the effect. */
export interface EffectHandle {
  (): void;
  stop(): void;
  run(): unknown;
  pause(): void;
  resume(): void;
}

export function signal<T>(initialValue: T): Signal<T>;
export function signal<T = undefined>(): Signal<T | undefined>;

export function computed<T>(fn: () => T): Computed<T>;

/** Runs `fn` now and whenever what it read changes. A function it returns is its teardown. */
export function effect(fn: () => unknown, options?: EffectOptions): EffectHandle;

/** An effect on the shared frame queue: one run per animation frame. */
export function effectRAF(fn: () => unknown): EffectHandle;

/** `driver` is handed the flush function and returns a way to cancel the flush it booked. */
export function createScheduler(driver?: ((flush: () => number) => () => void) | null): Scheduler;

export const frame: Scheduler;
export const microtask: Scheduler;

/** Defers every effect triggered inside `fn` until it returns. */
export function batch<T>(fn: () => T): T;

/** Reads inside `fn` do not subscribe the surrounding effect. */
export function untrack<T>(fn: () => T): T;

export function tweened(initialValue: number, duration?: number, easing?: Easing): Tweened<number>;
export function tweened<T>(
  initialValue: T,
  duration: number | undefined,
  easing: Easing | undefined,
  interpolate: (from: T, to: T, t: number) => T
): Tweened<T>;

export const easings: {
  linear: Easing;
  quadIn: Easing;
  quadOut: Easing;
  quadInOut: Easing;
  cubicOut: Easing;
  expoOut: Easing;
  backOut: Easing;
  elasticOut: Easing;
};

export function isSignal(value: unknown): value is ReadonlySignal<unknown>;

/** Wraps a plain value in a signal; passes a signal through untouched. */
export function toSignal<S extends ReadonlySignal<any>>(value: S): S;
export function toSignal<T>(value: T): Signal<T>;
