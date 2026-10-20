// A parameter store: one signal per key, seeded from defaults, then from localStorage,
// then from the URL. The defaults object doubles as the schema — it fixes the key set and
// the type of each value, so a stale save or a hand-edited link can't put a string where a
// number belongs and send NaN into a shader.

import { signal, tweened, effect, batch, untrack } from "./reactive.js";
import { isHexColor, mixColors } from "./color.js";

// Whether a value fits the default: arrays element by element, finite numbers, hex for hex.
const fits = (value, fallback) => {
  if (Array.isArray(fallback)) {
    return (
      Array.isArray(value) &&
      value.length === fallback.length &&
      value.every((item, i) => fits(item, fallback[i]))
    );
  }
  if (Array.isArray(value)) return false;
  if (typeof fallback === "number") {
    return typeof value === "number" && (Number.isFinite(value) || !Number.isFinite(fallback));
  }
  if (isHexColor(fallback)) return isHexColor(value);
  return typeof value === typeof fallback;
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
    const value = JSON.parse(localStorage.getItem(key));
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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

  // What *can* travel is decided by the default — numbers ease, hex colours ease through OKLab,
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
    const kind = defaults[key];
    if (custom) return tweened(value, duration, curve, custom);
    if (typeof kind === "number") return tweened(value, duration, curve);
    if (isHexColor(kind)) return tweened(value, duration, curve, mixColors);
    if (numericArray(kind)) return tweened(value, duration, curve, lerpArray);
    return signal(value);
  };

  const params = {};
  for (const key of keys) {
    const value = key in stored && fits(stored[key], defaults[key]) ? stored[key] : defaults[key];
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
        if (!(key in params) || !fits(value, defaults[key])) continue;
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

  const atDefault = (key) => String(params[key].target()) === String(defaults[key]);

  let timer = null;
  let flush = () => {};
  let stop = () => {};

  if (storageKey) {
    // Only what differs from the defaults is kept, so a changed default reaches untouched controls.
    flush = () => {
      clearTimeout(timer);
      timer = null;
      writeStorage(storageKey, snapshot(persisted.filter((key) => !atDefault(key))));
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
    // Nothing is written until something changes. Untracked, so the store outlives an effect it was built in.
    let loaded = false;
    const stops = untrack(() =>
      persisted.map((key) =>
        effect(() => {
          params[key].target(); // the destination, so an animation does not re-trigger the write
          if (loaded) schedulePersist();
        })
      )
    );
    loaded = true;

    // A tab closing or being backgrounded on mobile may never get another frame, so a write
    // still waiting is forced out here rather than lost. Guarded so the module still works
    // where there is no window to listen on.
    const onHide = () => {
      if (timer !== null) flush();
    };
    const canListen = typeof addEventListener === "function";
    if (canListen) addEventListener("pagehide", onHide);

    stop = () => {
      clearTimeout(timer);
      timer = null;
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
    // Drops the save and any write still waiting, so a reload comes back to the defaults.
    $clear: () => {
      clearTimeout(timer);
      timer = null;
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
        if (atDefault(key)) continue;
        const value = params[key].target();
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
