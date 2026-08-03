/*! guspira v0.1.0 — A reactive GUI toolkit for creative coding sketches
 * https://github.com/spite/guspira
 * MIT License, Copyright (c) 2026 Jaume Sanchez
 */
var GuspiraReactive = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/reactive.js
  var reactive_exports = {};
  __export(reactive_exports, {
    batch: () => batch,
    computed: () => computed,
    createScheduler: () => createScheduler,
    easings: () => easings,
    effect: () => effect,
    effectRAF: () => effectRAF,
    frame: () => frame,
    isSignal: () => isSignal,
    microtask: () => microtask,
    signal: () => signal,
    toSignal: () => toSignal,
    tweened: () => tweened,
    untrack: () => untrack
  });
  var hasRAF = typeof requestAnimationFrame === "function";
  var now = () => typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  var rafSchedule = hasRAF ? (fn) => requestAnimationFrame(fn) : (fn) => setTimeout(() => fn(now()), 16);
  var rafCancel = hasRAF ? (id) => cancelAnimationFrame(id) : (id) => clearTimeout(id);
  var activeEffect = null;
  var batchDepth = 0;
  var pending = /* @__PURE__ */ new Set();
  var queue = [];
  var queueIndex = 0;
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
    pause() {
      this.paused = true;
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
    stop() {
      if (!this.active) return;
      this.stopChildren();
      this.runCleanup();
      this.cleanup();
      this.active = false;
    }
  };
  function track(subscribers) {
    if (activeEffect) {
      subscribers.add(activeEffect);
      activeEffect.deps.add(subscribers);
    }
  }
  function reportError(error) {
    if (typeof console !== "undefined") console.error("[guspira] effect threw:", error);
  }
  function drain() {
    batchDepth++;
    try {
      let guard = 0;
      while (queueIndex < queue.length) {
        if (++guard > 1e5) {
          reset();
          throw new Error(
            "[guspira] reactive update never settled — an effect is very likely writing a signal it also reads. Use peek() to read without subscribing, or untrack()."
          );
        }
        const effect2 = queue[queueIndex++];
        pending.delete(effect2);
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
  }
  function trigger(subscribers) {
    if (subscribers.size === 0) return;
    batchDepth++;
    try {
      subscribers.forEach((effect2) => {
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
  function signal(initialValue) {
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
    return sig;
  }
  function computed(fn) {
    const value = signal(void 0);
    const computation = new ReactiveEffect(() => value.set(fn()));
    computation.run();
    const computedSignal = () => value();
    computedSignal.peek = value.peek;
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
          job.run();
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
      const progress = Math.min((time - startTime) / duration, 1);
      value.set(progress < 1 ? interpolate(from, to, easing(progress)) : to);
      if (progress < 1) frameId = rafSchedule(tick);
      else stopAnimation();
    };
    const sig = () => value();
    sig.peek = value.peek;
    sig.isSignal = true;
    sig.target = target;
    sig.set = (newValue) => {
      if (interpolate === lerpNumber && (typeof newValue !== "number" || !isFinite(newValue))) {
        reportError(new Error(`tweened() interpolates numbers; got ${JSON.stringify(newValue)}`));
        return;
      }
      if (newValue === to) return;
      stopAnimation();
      from = value.peek();
      to = newValue;
      target.set(newValue);
      if (duration === 0) value.set(to);
      else frameId = rafSchedule(tick);
    };
    sig.update = (updater) => sig.set(updater(value.peek()));
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
  return __toCommonJS(reactive_exports);
})();
