import type { Signal } from "./reactive.js";
import type { Params } from "./params.js";

export interface PresetStoreOptions<T> {
  /** Named looks, each saying only what it changes. */
  builtin?: Record<string, Partial<T>>;
  /** Where saved presets live. Without one they last as long as the page. */
  storageKey?: string | null;
  /** Keys left out of snapshots. */
  exclude?: readonly Extract<keyof T, string>[];
  /** The name shown once values drift from any named preset. */
  customName?: string;
  /** Called with the preset's name, or the values object that was applied. */
  onApply?: ((applied: string | object, keys: string[]) => void) | null;
}

export interface PresetStore<T> {
  /** The name of the preset in effect. */
  readonly current: Signal<string>;
  builtinNames(): string[];
  userNames(): string[];
  snapshot(): Partial<T>;
  /** A built-in or saved preset by name, or an object of values. Returns the keys applied. */
  apply(nameOrValues: string | object | null | undefined): string[];
  /** A saved preset by name, whatever it is called. */
  load(name: string): string[];
  markCustom(): void;
  save(name: string): Partial<T>;
  remove(name: string): void;
  /** Downloads `values`, or the saved preset of that name, or the current state. */
  exportFile(name?: string, values?: unknown): void;
  importFile(file: Blob): Promise<string[]>;
  toJSON(): string;
}

export function createPresetStore<T>(
  params: Params<T>,
  options?: PresetStoreOptions<T>
): PresetStore<T>;

/** Writes to the clipboard, with a fallback where the async API is missing. */
export function copyText(text: string): Promise<boolean>;
