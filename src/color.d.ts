export function isHexColor(value: unknown): value is string;

/** "#rrggbb" to [r, g, b] in 0..1. */
export function hexToRgb(hex: string): [number, number, number];

/** [r, g, b] in 0..1 to "#rrggbb". */
export function rgbToHex(rgb: readonly number[]): string;

/** Mixes two [r, g, b] colours in 0..1 through OKLab. */
export function mixRgb(from: number[], to: number[], t: number): number[];

/** Mixes two hex colours through OKLab. */
export function mixColors(from: string, to: string, t: number): string;

/** How a colour control converts the value a signal holds to and from the swatch's hex. */
export interface ColorCodec<T> {
  toHex(value: T): string;
  /** Handed the value being replaced, for what hex cannot carry. */
  fromHex(hex: string, previous: T): T;
}

export type ColorFormat<T> = "hex" | "rgb" | "rgb255" | ColorCodec<T>;

export function colorCodec<T = unknown>(format?: ColorFormat<T> | null): ColorCodec<T>;
