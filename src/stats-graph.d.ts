/** One sample: a number, or one number per band when stacked. */
export type GraphSample = number | readonly number[];

/** `<stats-graph>`: a value plotted over time. */
export default class StatsGraph extends HTMLElement {
  /** Names for the bands of a stacked graph. */
  get series(): string[] | null;
  set series(names: readonly string[] | null | undefined);

  /** How the figures in the legend are written. */
  get formatValue(): (value: number) => string;
  set formatValue(fn: (value: number) => string);

  /** Sampled every frame while visible. Returning undefined declines a sample. */
  get source(): (() => GraphSample | undefined) | null;
  set source(fn: (() => GraphSample | undefined) | null | undefined);

  get samples(): number;
  set samples(count: number);

  get min(): number | undefined;
  set min(value: number | string | null | undefined);

  get max(): number | undefined;
  set max(value: number | string | null | undefined);

  get over(): number | undefined;
  set over(value: number | string | null | undefined);

  get below(): number | undefined;
  set below(value: number | string | null | undefined);

  push(value: GraphSample): this;
  clear(): this;
  draw(): void;

  readonly history: GraphSample[];
  /** The most recent sample, summed if stacked. */
  readonly current: number;
  /** True when the latest sample is past `over` or under `below`. */
  readonly breached: boolean;
}

declare global {
  interface HTMLElementTagNameMap {
    "stats-graph": StatsGraph;
  }
}
