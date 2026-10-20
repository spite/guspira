/** Decimals implied by a step: 0.05 gives 2, 1 gives 0. */
export function precision(step: number): number;

/** `base` is where the grid starts, when that has more decimals than the step. */
export function formatFloat(value: number | string, step: number, base?: number): string;

/** Snaps to a grid counted from `min` (from zero when it is not finite), then clamps to the range. */
export function snap(value: number, step: number, min: number, max: number): number;
