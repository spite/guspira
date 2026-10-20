import type { Easing, Signal } from "./reactive.js";

type Keys<T> = Extract<keyof T, string>;

export interface EaseOptions<T> {
  duration?: number;
  easing?: Easing;
  /** Only these keys travel. */
  only?: readonly Keys<T>[] | null;
  /** These keys jump. */
  skip?: readonly Keys<T>[];
  /** A path of its own for a key, such as `mixRgb` for a colour kept as an array. */
  interpolate?: { [K in keyof T]?: (from: T[K], to: T[K], t: number) => T[K] };
}

export interface ParamsOptions<T> {
  /** Persist to localStorage under this key. */
  storageKey?: string | null;
  /** Keys never persisted. */
  exclude?: readonly Keys<T>[];
  /** Read overrides from the query string: all keys, or a list. */
  url?: boolean | readonly Keys<T>[];
  /** Rewrites an older save before it is applied. */
  migrate?: ((stored: Record<string, any>) => Record<string, any> | void) | null;
  /** Debounce for writes, in milliseconds. */
  delay?: number;
  /** Make parameters travel: a duration in milliseconds, or the full options. */
  ease?: number | EaseOptions<T> | null;
}

export interface ParamHelpers<T> {
  readonly $defaults: T;
  readonly $keys: Keys<T>[];
  readonly $persisted: Keys<T>[];
  /** The current values, as targets. */
  $snapshot(subset?: readonly Keys<T>[]): Partial<T>;
  /** Writes what fits the schema in one batch and returns the keys it took. */
  $apply(values: object | null | undefined): string[];
  $reset(subset?: readonly Keys<T>[]): void;
  /** Forces the storage write. */
  $flush(): void;
  /** Stops persisting. */
  $stop(): void;
  /** Retimes every parameter that travels. */
  $ease(ms: number): void;
  /** Removes the stored save and any write still waiting. */
  $clear(): void;
  /** A query string of everything that differs from the defaults. */
  $toQuery(): string;
}

/** One signal per key of the defaults, with the helpers under `$` names. */
export type Params<T> = { [K in keyof T]: Signal<T[K]> } & ParamHelpers<T>;

export function createParams<T extends Record<string, unknown>>(
  defaults: T,
  options?: ParamsOptions<T>
): Params<T>;

export function readStorage(key: string): Record<string, any>;
export function writeStorage(key: string, value: unknown): boolean;
