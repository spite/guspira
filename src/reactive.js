// Minimal signal/effect reactivity: a signal is a getter function with `.set`, and an
// effect is a function that re-runs when any signal it read changes. Reads are tracked by
// running the effect with it installed as `activeEffect`, so no dependency declaration is
// needed. Everything here is synchronous unless a scheduler says otherwise.
//
// This module stands on its own — no imports, no DOM. The two pieces that need a clock,
// effectRAF and tweened, use requestAnimationFrame when there is one and fall back to
// timers elsewhere, so it runs unchanged in node, in a worker, or in a test.

const hasRAF = typeof requestAnimationFrame === "function";

const now = () =>
  typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();

// ~60Hz off a timer when there are no frames to hook into. The callback is handed a
// timestamp either way, so schedulers don't have to care which one they got.
const rafSchedule = hasRAF
  ? (fn) => requestAnimationFrame(fn)
  : (fn) => setTimeout(() => fn(now()), 16);

const rafCancel = hasRAF ? (id) => cancelAnimationFrame(id) : (id) => clearTimeout(id);

let activeEffect = null;
let batchDepth = 0;
// The queue an update drains. The Set answers "is this effect already waiting", so one woken
// twice still runs once; the array remembers the order they were woken in. They are kept in
// step: an effect is in exactly one of the two states, waiting or already run.
const pending = new Set();
const queue = [];
let queueIndex = 0;
// Computeds flagged out of date during the current pass.
const marked = [];
// The runaway guard counts repeats of one effect in a pass, not the size of the pass.
let passId = 0;
const MAX_RUNS_PER_PASS = 100000;

class ReactiveEffect {
  constructor(fn, scheduler) {
    this.fn = fn;
    this.scheduler = scheduler;
    this.deps = new Set();
    this.active = true;
    this.paused = false;
    this.dirty = false;
    this.cleanupFn = null;
    this.children = null;
    // Set on a computed's effect: the readers of its value, and whether that value is out of date.
    this.downstream = null;
    this.stale = false;
    // Takes the effect back out of the queue it is waiting in, when it has one.
    this.unschedule = null;
    this.pass = 0;
    this.passRuns = 0;
    // An effect born while another one is running belongs to it, and is disposed when the
    // parent re-runs or stops — the same lifetime its cleanup function gets. Without this,
    // an effect that creates effects starts a fresh one on every pass, never disposes the
    // previous, and leaves them all running after the parent has stopped. `untrack` is the
    // way out: nothing created inside it has a parent, so it lives until stopped by hand.
    if (activeEffect) (activeEffect.children ??= []).push(this);
  }

  // What a dependency change does to this effect: run it, or hand it to its scheduler to be
  // run later. A paused effect only remembers that it went stale.
  notify() {
    if (!this.active) return;
    if (this.paused) {
      this.dirty = true;
      return;
    }
    if (this.scheduler) this.scheduler(this);
    else this.run();
  }

  // A run already waiting in a queue is taken out and remembered as a change to catch up on.
  pause() {
    this.paused = true;
    if (this.unschedule && this.unschedule(this)) this.dirty = true;
  }

  // What a queue calls when the effect's turn comes.
  runQueued() {
    if (this.paused) this.dirty = true;
    else this.run();
  }

  // Catches up immediately rather than through the scheduler: resuming is itself the moment
  // the caller chose, so waiting for another frame after it would just add latency.
  resume() {
    if (!this.paused) return;
    this.paused = false;
    if (this.dirty) {
      this.dirty = false;
      this.run();
    }
  }

  run() {
    if (!this.active) return;
    this.stopChildren();
    this.runCleanup();
    this.cleanup();
    // Saved and restored rather than nulled, so an effect created inside another effect
    // doesn't swallow the outer one's remaining reads.
    const prev = activeEffect;
    activeEffect = this;
    try {
      const result = this.fn();
      // An effect that returns a function is handing back its teardown — the listener it
      // added, the timer it started. It runs before the next run, and on stop.
      if (typeof result === "function") this.cleanupFn = result;
      return result;
    } finally {
      activeEffect = prev;
      // Stopped from inside its own run: what it set up after that point goes too.
      if (!this.active) this.dispose();
    }
  }

  runCleanup() {
    if (!this.cleanupFn) return;
    const fn = this.cleanupFn;
    this.cleanupFn = null;
    // Untracked: tearing something down must not subscribe the effect to what it reads.
    untrack(fn);
  }

  cleanup() {
    this.deps.forEach((depSet) => depSet.delete(this));
    this.deps.clear();
  }

  // Cleared before the list is walked: a child stopping itself in the process must not be
  // walking the array we are still iterating.
  stopChildren() {
    if (!this.children) return;
    const children = this.children;
    this.children = null;
    children.forEach((child) => child.stop());
  }

  dispose() {
    this.stopChildren();
    this.runCleanup();
    this.cleanup();
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    if (this.unschedule) this.unschedule(this);
    this.dispose();
  }
}

function track(subscribers) {
  if (activeEffect && activeEffect.active) {
    subscribers.add(activeEffect);
    activeEffect.deps.add(subscribers);
  }
}

// Reports an effect that threw without letting it take the rest of the pass with it. One
// broken control must not stop every other control bound to the same signal from updating.
function reportError(error, what = "effect threw") {
  if (typeof console !== "undefined") console.error(`[guspira] ${what}:`, error);
}

// Drains the queue one at a time rather than snapshotting it. Because it is a Set, an effect
// re-queued while the pass is running collapses into the entry already waiting — which is
// what stops a value and something derived from it running the same effect twice.
function drain() {
  batchDepth++; // writes made by these effects join this pass instead of starting their own
  passId++;
  try {
    // Walked with an index rather than by lifting entries out of the Set: taking the first
    // entry means building a fresh iterator that has to step over everything already removed,
    // so draining n effects would cost O(n²). Effects woken part-way through are appended and
    // reached by the same loop, which keeps the order a single queue gives — an effect still
    // waiting is never queued a second time, so it runs once however many paths reach it.
    while (queueIndex < queue.length) {
      const effect = queue[queueIndex++];
      // Dropped from the waiting set before it runs, so an effect that wakes itself queues
      // again rather than being silently swallowed.
      pending.delete(effect);
      // A computed that a reader already asked for is up to date.
      if (effect.downstream && !effect.stale) continue;
      if (effect.pass !== passId) {
        effect.pass = passId;
        effect.passRuns = 0;
      }
      if (++effect.passRuns > MAX_RUNS_PER_PASS) {
        reset();
        throw new Error(
          "[guspira] reactive update never settled — an effect is very likely writing a " +
            "signal it also reads. Use peek() to read without subscribing, or untrack()."
        );
      }
      try {
        effect.notify();
      } catch (error) {
        reportError(error);
      }
    }
    reset();
  } finally {
    batchDepth--;
  }
}

// Emptied in one go once an update has settled, so the array does not hold on to every effect
// it ran until the next write comes along.
function reset() {
  pending.clear();
  queue.length = 0;
  queueIndex = 0;
  // A flag still up was a false alarm: nothing that computed reads actually changed.
  for (const computation of marked) computation.stale = false;
  marked.length = 0;
}

// Flags a computed and everything derived from it, ahead of the queue reaching them.
function markStale(computation) {
  const stack = [computation];
  while (stack.length) {
    const next = stack.pop();
    if (next.stale) continue;
    next.stale = true;
    marked.push(next);
    next.downstream.forEach((reader) => {
      if (reader.downstream && !reader.stale) stack.push(reader);
    });
  }
}

function trigger(subscribers) {
  if (subscribers.size === 0) return;
  batchDepth++;
  try {
    // Only adds to the queue, so there is nothing to disturb by iterating the live set, and
    // no copy to allocate.
    subscribers.forEach((effect) => {
      if (effect.downstream) markStale(effect);
      if (pending.has(effect)) return;
      pending.add(effect);
      queue.push(effect);
    });
  } finally {
    batchDepth--;
    if (batchDepth === 0) drain();
  }
}

// Values are compared before triggering, so setting a signal to what it already holds is
// free. Arrays are compared element-wise — range sliders hand back a fresh [min, max] on
// every pointer move, and identity comparison would make every one of them a change.
function same(a, b) {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.every((v, i) => Object.is(v, b[i]));
  }
  return false;
}

// The signal, and the set of effects reading it — which a computed needs a hold of.
function createSignal(initialValue) {
  let value = initialValue;
  const subscribers = new Set();

  const sig = () => {
    track(subscribers);
    return value;
  };

  sig.set = (newValue) => {
    if (same(value, newValue)) return;
    value = newValue;
    trigger(subscribers);
  };

  sig.update = (updater) => sig.set(updater(value));

  // Reads without subscribing — for effects that should act on a value without re-running
  // when it changes.
  sig.peek = () => value;

  sig.isSignal = true;

  // What was last set. On a plain signal that is the signal itself; on a tweened one it is a
  // separate signal, because the two answers differ while an animation is running. Anything
  // that must react to a deliberate change — a control's own display, a save, a rebuild —
  // reads this rather than the value.
  sig.target = sig;

  return { sig, subscribers };
}

export function signal(initialValue) {
  return createSignal(initialValue).sig;
}

export function computed(fn) {
  // A signal written by an effect. signal.set already compares before notifying, so a
  // recomputation that lands on the same value costs its readers nothing — there is no
  // second copy of the track/trigger machinery here.
  const { sig: value, subscribers } = createSignal(undefined);
  const computation = new ReactiveEffect(() => {
    computation.stale = false;
    value.set(fn());
  });
  computation.downstream = subscribers;
  computation.run();

  // Out of date and not yet reached by the queue: recomputed for whoever is asking.
  const refresh = () => {
    if (!computation.stale || !computation.active) return;
    try {
      computation.run();
    } catch (error) {
      reportError(error);
    }
  };

  const computedSignal = () => {
    refresh();
    return value();
  };
  computedSignal.peek = () => {
    refresh();
    return value.peek();
  };
  computedSignal.isSignal = true;
  computedSignal.stop = () => computation.stop();

  return computedSignal;
}

// A queue of effects waiting to re-run. Whoever owns the queue decides when they run —
// which is the point: a sketch already has a frame loop, and reactive work should happen at
// a chosen moment inside it, not on a second animation frame racing the first.
//
//   const frame = createScheduler();
//   effect(() => rebuild(params.count()), { scheduler: frame });
//
//   function loop() {
//     frame.flush();   // pending work happens exactly here, before the draw
//     draw();
//     requestAnimationFrame(loop);
//   }
//
// `driver` is optional: pass one and the queue flushes itself (that is all frameScheduler
// and microtaskScheduler are). It receives the flush function and returns a cancel function.
export function createScheduler(driver = null) {
  const queue = new Set();
  let cancel = null;
  let paused = false;

  const flush = () => {
    cancel = null;
    if (paused) return 0;
    // Snapshotted: an effect that re-runs may queue others, and those belong to the next
    // flush rather than extending this one indefinitely.
    const jobs = [...queue];
    queue.clear();
    for (const job of jobs) {
      try {
        job.runQueued();
      } catch (error) {
        reportError(error);
      }
    }
    return jobs.length;
  };

  const schedule = (job) => {
    queue.add(job);
    if (driver && !cancel && !paused) cancel = driver(flush);
  };

  return {
    schedule,
    // Takes a job back out, for an effect stopped or paused while it waited. True if it was in.
    unschedule: (job) => queue.delete(job),
    flush,
    get size() {
      return queue.size;
    },
    // Drops pending work without running it.
    clear() {
      queue.clear();
      if (cancel) cancel();
      cancel = null;
    },
    // Stops the whole queue at once — a hidden panel or a stopped sketch costs nothing,
    // and the work that piled up runs on resume.
    pause() {
      paused = true;
      if (cancel) cancel();
      cancel = null;
    },
    resume() {
      if (!paused) return;
      paused = false;
      if (queue.size) flush();
    },
    get paused() {
      return paused;
    },
  };
}

// Two ready-made queues. `frame` flushes once per animation frame and is what backs
// effectRAF — one shared frame for every effect on it, so they run together in a defined
// order instead of each booking its own callback. `microtask` flushes at the end of the
// current turn, which is the right unit for coalescing a burst of writes with no frame loop
// involved, since it adds no latency at all.
export const frame = createScheduler((flush) => {
  const id = rafSchedule(flush);
  return () => rafCancel(id);
});

export const microtask = createScheduler((flush) => {
  let cancelled = false;
  queueMicrotask(() => {
    if (!cancelled) flush();
  });
  return () => {
    cancelled = true;
  };
});

// Runs `fn` now, and again whenever anything it read changes.
//
//   effect(fn)                          — synchronously, on every change
//   effect(fn, { scheduler: frame })     — coalesced into one run per animation frame
//   effect(fn, { scheduler: myQueue })   — queued until you call myQueue.flush()
//   effect(fn, { lazy: true })           — created but not run yet
//
// Returns a stop function that also carries `.pause()`, `.resume()`, `.run()` and `.stop()`.
export function effect(fn, options = {}) {
  const { scheduler, lazy = false } = options;
  const enqueue = !scheduler
    ? undefined
    : typeof scheduler === "function"
      ? scheduler
      : (job) => scheduler.schedule(job);

  const e = new ReactiveEffect(fn, enqueue);
  if (scheduler && typeof scheduler.unschedule === "function") {
    e.unschedule = (job) => scheduler.unschedule(job);
  }
  if (!lazy) e.run();

  const handle = () => e.stop();
  handle.stop = () => e.stop();
  handle.run = () => e.run();
  handle.pause = () => e.pause();
  handle.resume = () => e.resume();
  return handle;
}

// The common case, kept as it was: coalesce re-runs into one per animation frame. It is now
// just `effect` on the shared frame queue — worth reaching for when there is no render loop
// to hang the work off, and worth replacing with your own scheduler when there is.
export function effectRAF(fn) {
  return effect(fn, { scheduler: frame });
}

// Defers every effect triggered inside `fn` until it returns, then runs each once. Use it
// when writing many signals at once (applying a preset, resetting to defaults) so
// downstream work happens one time instead of once per parameter.
export function batch(fn) {
  batchDepth++;
  try {
    return fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) drain();
  }
}

// Reads inside `fn` don't subscribe the surrounding effect.
export function untrack(fn) {
  const prev = activeEffect;
  activeEffect = null;
  try {
    return fn();
  } finally {
    activeEffect = prev;
  }
}

const lerpNumber = (from, to, t) => from + (to - from) * t;

// A signal that eases towards whatever it is set to, over `duration` ms. `.reset(v)` jumps to
// a value without animating, and `.duration` / `.easing` are writable, so a transition time
// can sit behind a control like anything else.
//
// Numbers by default. Pass `interpolate` — an (from, to, t) => value — and it will travel
// between anything; createParams eases colours through mixColors on exactly that.
export function tweened(initialValue, duration = 400, easing = (t) => t, interpolate = lerpNumber) {
  const value = signal(initialValue);
  // The destination is a signal of its own, so a control can subscribe to "what was set"
  // without waking on every frame of the journey there.
  const target = signal(initialValue);
  let from = initialValue;
  let to = initialValue;
  let startTime = null;
  let frameId = null;

  const stopAnimation = () => {
    if (frameId !== null) rafCancel(frameId);
    frameId = null;
    startTime = null;
  };

  // Timed from the write; a frame stamped just before it counts as zero progress.
  const tick = (time) => {
    if (startTime === null) startTime = time;
    const progress = Math.min(Math.max(0, time - startTime) / duration, 1);
    value.set(progress < 1 ? interpolate(from, to, easing(progress)) : to);
    if (progress < 1) frameId = rafSchedule(tick);
    else stopAnimation();
  };

  const sig = () => value();
  sig.peek = value.peek;
  sig.isSignal = true;
  // A view of the destination whose writes go through the tween.
  const targetView = () => target();
  targetView.peek = target.peek;
  targetView.isSignal = true;
  targetView.set = (newValue) => sig.set(newValue);
  targetView.update = (updater) => sig.update(updater);
  sig.target = targetView;

  sig.set = (newValue) => {
    // Only the default interpolator can say what a bad value is; a custom one was supplied
    // by someone who knows what they are travelling between.
    if (interpolate === lerpNumber && (typeof newValue !== "number" || !isFinite(newValue))) {
      reportError(new Error(`tweened() interpolates numbers; got ${String(newValue)}`), "write refused");
      return;
    }
    if (newValue === to) return;
    stopAnimation();
    from = value.peek();
    to = newValue;
    target.set(newValue);
    if (duration === 0) {
      value.set(to);
    } else {
      startTime = now();
      frameId = rafSchedule(tick);
    }
  };

  // From the destination, not the value in flight: two updates in a row must add up.
  sig.update = (updater) => sig.set(updater(target.peek()));

  sig.reset = (newValue) => {
    stopAnimation();
    from = newValue;
    to = newValue;
    target.set(newValue);
    value.set(newValue);
  };

  Object.defineProperties(sig, {
    duration: {
      get: () => duration,
      set: (ms) => {
        duration = Math.max(0, ms);
      },
    },
    easing: {
      get: () => easing,
      set: (fn) => {
        easing = typeof fn === "function" ? fn : (t) => t;
      },
    },
  });

  return sig;
}

// A few easings to pass to tweened(), or to write your own against: each maps 0..1 to 0..1.
export const easings = {
  linear: (t) => t,
  quadIn: (t) => t * t,
  quadOut: (t) => t * (2 - t),
  quadInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  cubicOut: (t) => 1 - Math.pow(1 - t, 3),
  expoOut: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  backOut: (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2),
  elasticOut: (t) =>
    t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * 2.094) + 1,
};

export const isSignal = (v) => typeof v === "function" && v.isSignal === true;

// Wraps a plain value in a signal; passes a signal through untouched. Lets controls accept
// either without branching at every call site.
export const toSignal = (v) => (isSignal(v) ? v : signal(v));
