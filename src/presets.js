// Presets: named snapshots of a parameter store. Built-in presets are partial — a preset
// says only what it changes, and everything it doesn't mention stays put. User presets are
// full snapshots kept in localStorage, and the same shape goes in and out of a JSON file.

import { signal } from "./reactive.js";
import { readStorage, writeStorage } from "./params.js";

const CUSTOM = "custom";

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// `params` is a store from createParams. Options:
//   builtin     { name: partialParams } — curated looks, applied over the current state
//   storageKey  where user presets live (defaults to the params' key + "-presets")
//   exclude     keys left out of snapshots
//   customName  the name shown once values drift from any named preset
export function createPresetStore(params, options = {}) {
  const {
    builtin = {},
    storageKey = null,
    exclude = [],
    customName = CUSTOM,
    onApply = null,
  } = options;

  const subset = params.$persisted.filter((k) => !exclude.includes(k));
  let user = storageKey ? readStorage(storageKey) : {};

  // The name of the preset in effect. Every applied preset sets it; any other edit is the
  // app's business, but calling markCustom() from a change handler keeps it honest.
  const current = signal(customName);

  const store = {
    current,

    builtinNames: () => [customName, ...Object.keys(builtin)],
    userNames: () => Object.keys(user),

    snapshot: () => params.$snapshot(subset),

    // Takes a preset name (built-in or saved) or a plain object of values.
    apply(nameOrValues) {
      if (nameOrValues === customName) return [];
      const values =
        typeof nameOrValues === "string"
          ? builtin[nameOrValues] || user[nameOrValues]
          : nameOrValues;
      if (!values) return [];
      const applied = params.$apply(values);
      if (typeof nameOrValues === "string") current.set(nameOrValues);
      else current.set(customName);
      if (onApply) onApply(nameOrValues, applied);
      return applied;
    },

    markCustom() {
      current.set(customName);
    },

    save(name) {
      user[name] = store.snapshot();
      if (storageKey) writeStorage(storageKey, user);
      current.set(name);
      return user[name];
    },

    remove(name) {
      delete user[name];
      if (storageKey) writeStorage(storageKey, user);
    },

    exportFile(name = "preset") {
      const values = user[name] || store.snapshot();
      download(`${name}.json`, JSON.stringify(values, null, 2));
    },

    // Accepts both a bare snapshot and a wrapper like { name, params }, since that's what
    // hand-written preset files tend to look like.
    importFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => {
          try {
            const parsed = JSON.parse(reader.result);
            const values = parsed && parsed.params ? parsed.params : parsed;
            const applied = store.apply(values);
            if (parsed && parsed.name) {
              user[parsed.name] = values;
              if (storageKey) writeStorage(storageKey, user);
              current.set(parsed.name);
            }
            resolve(applied);
          } catch (e) {
            reject(e);
          }
        };
        reader.readAsText(file);
      });
    },

    // The full state as JSON — paste into a bug report, or back in through import.
    toJSON: () => JSON.stringify(store.snapshot(), null, 2),
  };

  return store;
}

// Clipboard write with a fallback for pages that aren't in a secure context, where the
// async Clipboard API simply isn't there.
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {}
    ta.remove();
    return ok;
  }
}
