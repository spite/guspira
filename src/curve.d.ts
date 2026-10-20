/** How a slider's track maps to its value: an exponent on the position, or "log". */
export type Curve = number | "log";

export function normalizeCurve(value: number | string | null | undefined): Curve;

/** False for a log track over a range that touches or crosses zero. */
export function curveFitsRange(curve: Curve, min: number, max: number): boolean;

/** Throws where `curveFitsRange` is false. */
export function assertCurveRange(curve: Curve, min: number, max: number, where?: string): void;

/** Track position (0..1) to value. */
export function curveToValue(fraction: number, min: number, max: number, curve?: Curve): number;

/** Value to track position (0..1). */
export function valueToCurve(value: number, min: number, max: number, curve?: Curve): number;
