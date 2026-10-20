/*! guspira v0.2.0 — A reactive GUI toolkit for creative coding sketches
 * https://github.com/spite/guspira
 * MIT License, Copyright (c) 2026 Jaume Sanchez
 */

// src/reactive.js
var hasRAF = typeof requestAnimationFrame === "function";
var now = () => typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
var rafSchedule = hasRAF ? (fn) => requestAnimationFrame(fn) : (fn) => setTimeout(() => fn(now()), 16);
var rafCancel = hasRAF ? (id) => cancelAnimationFrame(id) : (id) => clearTimeout(id);
var activeEffect = null;
var batchDepth = 0;
var pending = /* @__PURE__ */ new Set();
var queue = [];
var queueIndex = 0;
var marked = [];
var passId = 0;
var MAX_RUNS_PER_PASS = 1e5;
var ReactiveEffect = class {
  constructor(fn, scheduler) {
    this.fn = fn;
    this.scheduler = scheduler;
    this.deps = /* @__PURE__ */ new Set();
    this.active = true;
    this.paused = false;
    this.dirty = false;
    this.cleanupFn = null;
    this.children = null;
    this.downstream = null;
    this.stale = false;
    this.unschedule = null;
    this.pass = 0;
    this.passRuns = 0;
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
    const prev = activeEffect;
    activeEffect = this;
    try {
      const result = this.fn();
      if (typeof result === "function") this.cleanupFn = result;
      return result;
    } finally {
      activeEffect = prev;
      if (!this.active) this.dispose();
    }
  }
  runCleanup() {
    if (!this.cleanupFn) return;
    const fn = this.cleanupFn;
    this.cleanupFn = null;
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
};
function track(subscribers) {
  if (activeEffect && activeEffect.active) {
    subscribers.add(activeEffect);
    activeEffect.deps.add(subscribers);
  }
}
function reportError(error, what = "effect threw") {
  if (typeof console !== "undefined") console.error(`[guspira] ${what}:`, error);
}
function drain() {
  batchDepth++;
  passId++;
  try {
    while (queueIndex < queue.length) {
      const effect2 = queue[queueIndex++];
      pending.delete(effect2);
      if (effect2.downstream && !effect2.stale) continue;
      if (effect2.pass !== passId) {
        effect2.pass = passId;
        effect2.passRuns = 0;
      }
      if (++effect2.passRuns > MAX_RUNS_PER_PASS) {
        reset();
        throw new Error(
          "[guspira] reactive update never settled — an effect is very likely writing a signal it also reads. Use peek() to read without subscribing, or untrack()."
        );
      }
      try {
        effect2.notify();
      } catch (error) {
        reportError(error);
      }
    }
    reset();
  } finally {
    batchDepth--;
  }
}
function reset() {
  pending.clear();
  queue.length = 0;
  queueIndex = 0;
  for (const computation of marked) computation.stale = false;
  marked.length = 0;
}
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
    subscribers.forEach((effect2) => {
      if (effect2.downstream) markStale(effect2);
      if (pending.has(effect2)) return;
      pending.add(effect2);
      queue.push(effect2);
    });
  } finally {
    batchDepth--;
    if (batchDepth === 0) drain();
  }
}
function same(a, b) {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.every((v, i) => Object.is(v, b[i]));
  }
  return false;
}
function createSignal(initialValue) {
  let value = initialValue;
  const subscribers = /* @__PURE__ */ new Set();
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
  sig.peek = () => value;
  sig.isSignal = true;
  sig.target = sig;
  return { sig, subscribers };
}
function signal(initialValue) {
  return createSignal(initialValue).sig;
}
function computed(fn) {
  const { sig: value, subscribers } = createSignal(void 0);
  const computation = new ReactiveEffect(() => {
    computation.stale = false;
    value.set(fn());
  });
  computation.downstream = subscribers;
  computation.run();
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
function createScheduler(driver = null) {
  const queue2 = /* @__PURE__ */ new Set();
  let cancel = null;
  let paused = false;
  const flush = () => {
    cancel = null;
    if (paused) return 0;
    const jobs = [...queue2];
    queue2.clear();
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
    queue2.add(job);
    if (driver && !cancel && !paused) cancel = driver(flush);
  };
  return {
    schedule,
    // Takes a job back out, for an effect stopped or paused while it waited. True if it was in.
    unschedule: (job) => queue2.delete(job),
    flush,
    get size() {
      return queue2.size;
    },
    // Drops pending work without running it.
    clear() {
      queue2.clear();
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
      if (queue2.size) flush();
    },
    get paused() {
      return paused;
    }
  };
}
var frame = createScheduler((flush) => {
  const id = rafSchedule(flush);
  return () => rafCancel(id);
});
var microtask = createScheduler((flush) => {
  let cancelled = false;
  queueMicrotask(() => {
    if (!cancelled) flush();
  });
  return () => {
    cancelled = true;
  };
});
function effect(fn, options = {}) {
  const { scheduler, lazy = false } = options;
  const enqueue = !scheduler ? void 0 : typeof scheduler === "function" ? scheduler : (job) => scheduler.schedule(job);
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
function effectRAF(fn) {
  return effect(fn, { scheduler: frame });
}
function batch(fn) {
  batchDepth++;
  try {
    return fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) drain();
  }
}
function untrack(fn) {
  const prev = activeEffect;
  activeEffect = null;
  try {
    return fn();
  } finally {
    activeEffect = prev;
  }
}
var lerpNumber = (from, to, t) => from + (to - from) * t;
function tweened(initialValue, duration = 400, easing = (t) => t, interpolate = lerpNumber) {
  const value = signal(initialValue);
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
  const targetView = () => target();
  targetView.peek = target.peek;
  targetView.isSignal = true;
  targetView.set = (newValue) => sig.set(newValue);
  targetView.update = (updater) => sig.update(updater);
  sig.target = targetView;
  sig.set = (newValue) => {
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
      }
    },
    easing: {
      get: () => easing,
      set: (fn) => {
        easing = typeof fn === "function" ? fn : (t) => t;
      }
    }
  });
  return sig;
}
var easings = {
  linear: (t) => t,
  quadIn: (t) => t * t,
  quadOut: (t) => t * (2 - t),
  quadInOut: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  cubicOut: (t) => 1 - Math.pow(1 - t, 3),
  expoOut: (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  backOut: (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2),
  elasticOut: (t) => t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * 2.094) + 1
};
var isSignal = (v) => typeof v === "function" && v.isSignal === true;
var toSignal = (v) => isSignal(v) ? v : signal(v);
export {
  batch,
  computed,
  createScheduler,
  easings,
  effect,
  effectRAF,
  frame,
  isSignal,
  microtask,
  signal,
  toSignal,
  tweened,
  untrack
};
