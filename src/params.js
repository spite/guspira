// A parameter store: one signal per key, seeded from defaults, then from localStorage,
// then from the URL. The defaults object doubles as the schema — it fixes the key set and
// the type of each value, so a stale save or a hand-edited link can't put a string where a
// number belongs and send NaN into a shader.

import { signal, tweened, effect, batch } from "./reactive.js";
import { isHexColor, mixColors } from "./color.js";

// Same shape, not just the same typeof: a [min, max] pair must not be satisfied by a
// three-element array, which would reach a range slider as a value it cannot represent.
const sameType = (a, b) => {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length;
  }
  return typeof a === typeof b;
};

// Parses a URL value against the type of its default: "0.4" -> 0.4, "true" -> true,
// "0.2,0.9" -> [0.2, 0.9]. Returns undefined when it doesn't fit, and the default stands.
function coerce(raw, fallback) {
  if (typeof fallback === "number") {
    const v = parseFloat(raw);
    return isFinite(v) ? v : undefined;
  }
  if (typeof fallback === "boolean") {
    if (raw === "true" || raw === "1") return true;
    if (raw === "false" || raw === "0") return false;
    return undefined;
  }
  if (Array.isArray(fallback)) {
    const parts = raw.split(",").map((p) => parseFloat(p));
    if (parts.length !== fallback.length || parts.some((p) => !isFinite(p))) return undefined;
    return parts;
  }
  return raw;
}

export function readStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}

export function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// `defaults` is the schema. Options:
//   storageKey  persist to localStorage under this key (omit for no persistence)
//   exclude     keys never persisted (transient things like `paused`)
//   url         read overrides from the query string; true for all keys, or a list
//   migrate     (stored) => stored, a chance to rewrite an older save before it is applied
//   delay       debounce for writes, ms
//   ease        make parameters travel instead of jumping: reading one gives the value on its
//               way to where it was set, and `params.x.target()` gives the destination. A
//               number is a duration in ms; an object takes { duration, easing, only, skip }.
//
// Returns an object of signals — `params.count()` reads, `params.count.set(v)` writes —
// with helpers hidden behind $ names so Object.keys(params) stays exactly the parameters.
export function createParams(defaults, options = {}) {
  const {
    storageKey = null, exclude = [], url = false, migrate = null, delay = 250, ease = null,
  } = options;
  const easing = typeof ease === "number" ? { duration: ease } : ease;

  const keys = Object.keys(defaults);
  const persisted = keys.filter((k) => !exclude.includes(k));

  let stored = storageKey ? readStorage(storageKey) : {};
  if (migrate) stored = migrate(stored) || stored;

  if (url && typeof location !== "undefined") {
    const allowed = Array.isArray(url) ? url : keys;
    const query = new URLSearchParams(location.search);
    for (const key of allowed) {
      if (!query.has(key)) continue;
      const value = coerce(query.get(key), defaults[key]);
      if (value !== undefined) stored[key] = value;
    }
  }

  // What *can* travel is decided by the value — numbers ease, hex colours ease through OKLab,
  // arrays of numbers ease a component at a time, and anything else has no meaningful path
  // between two of them. What *should* is `only` and `skip`. A parameter that travels is a
  // tweened signal; everything else is a plain one, and both answer `.target()`, so nothing
  // downstream has to know which is which.
  //
  // A colour kept as [r, g, b] is indistinguishable from a position kept as [x, y, z] — same
  // shape, different meaning — so the componentwise path is the default and a perceptual one
  // is asked for by name through `interpolate`.
  const lerpArray = (from, to, t) => from.map((v, i) => v + (to[i] - v) * t);
  const numericArray = (v) => Array.isArray(v) && v.length > 0 && v.every((n) => typeof n === "number");

  const easedSignal = (key, value) => {
    if (!easing) return signal(value);
    const { duration = 400, easing: curve, only = null, skip = [], interpolate = {} } = easing;
    const wanted = (only ? only.includes(key) : true) && !skip.includes(key);
    if (!wanted) return signal(value);
    const custom = interpolate[key];
    if (custom) return tweened(value, duration, curve, custom);
    if (typeof value === "number") return tweened(value, duration, curve);
    if (isHexColor(value)) return tweened(value, duration, curve, mixColors);
    if (numericArray(value)) return tweened(value, duration, curve, lerpArray);
    return signal(value);
  };

  const params = {};
  for (const key of keys) {
    const value = key in stored && sameType(stored[key], defaults[key]) ? stored[key] : defaults[key];
    params[key] = easedSignal(key, value);
  }

  // Targets, not the values mid-flight: a save, a preset or a link records where things were
  // put, not where an animation happened to be when the button was pressed.
  const snapshot = (subset = persisted) => {
    const out = {};
    for (const key of subset) out[key] = params[key].target();
    return out;
  };

  // Only values that match the schema are taken, and all of them land in one batch so
  // downstream effects run once for the whole preset rather than once per key.
  const apply = (values) => {
    if (!values || typeof values !== "object") return [];
    const applied = [];
    batch(() => {
      for (const [key, value] of Object.entries(values)) {
        if (!(key in params) || !sameType(value, defaults[key])) continue;
        params[key].set(value);
        applied.push(key);
      }
    });
    return applied;
  };

  // Resets everything by default, transient keys included — "reset to defaults" that
  // leaves some values behind is the more surprising reading. Pass a subset to narrow it.
  const reset = (subset = keys) => {
    batch(() => subset.forEach((key) => params[key].set(defaults[key])));
  };

  let timer = null;
  let flush = () => {};
  let stop = () => {};

  if (storageKey) {
    flush = () => {
      clearTimeout(timer);
      writeStorage(storageKey, snapshot());
    };

    // One effect per key rather than a single effect reading all of them. An effect
    // re-tracks its whole dependency set on every run, so one effect over 250 parameters
    // pays 250 subscription updates for every slider step; one effect per key pays one.
    // (test/bench.mjs measures the difference — roughly 30x at that size.)
    //
    // The write itself is debounced on top of that: dragging a slider would otherwise hit
    // localStorage synchronously on every step, which is a visible hitch.
    const schedulePersist = () => {
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    };
    const stops = persisted.map((key) =>
      effect(() => {
        params[key].target(); // the destination, so an animation does not re-trigger the write
        schedulePersist();
      })
    );

    // A tab closing or being backgrounded on mobile may never get another frame, so the
    // pending write is forced out here rather than lost. Guarded so the module still works
    // where there is no window to listen on.
    const onHide = () => flush();
    const canListen = typeof addEventListener === "function";
    if (canListen) addEventListener("pagehide", onHide);

    stop = () => {
      clearTimeout(timer);
      stops.forEach((s) => s());
      if (canListen) removeEventListener("pagehide", onHide);
    };
  }

  const helpers = {
    $defaults: defaults,
    $keys: keys,
    $persisted: persisted,
    $snapshot: snapshot,
    $apply: apply,
    $reset: reset,
    $flush: flush,
    $stop: stop,
    // Retimes every parameter that travels; 0 makes them arrive at once.
    $ease: (ms) => {
      for (const key of keys) {
        if (params[key].target !== params[key]) params[key].duration = ms;
      }
    },
    $clear: () => {
      if (storageKey) {
        try {
          localStorage.removeItem(storageKey);
        } catch {}
      }
    },
    // A query string for the current state, skipping anything still at its default — for
    // "copy a link to this look".
    $toQuery: () => {
      const query = new URLSearchParams();
      for (const key of persisted) {
        const value = params[key].target();
        if (sameType(value, defaults[key]) && String(value) === String(defaults[key])) continue;
        query.set(key, Array.isArray(value) ? value.join(",") : String(value));
      }
      return query.toString();
    },
  };

  for (const [name, fn] of Object.entries(helpers)) {
    Object.defineProperty(params, name, { value: fn, enumerable: false });
  }

  return params;
}
