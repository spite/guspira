/** Points every reroll at another source of numbers in 0..1, such as a seeded generator. */
export function setRandomSource(fn: () => number): void;

export function random(): number;
export function randomInRange(min: number, max: number): number;
export function randomElement<T>(array: readonly T[]): T;
export function randomBool(chance?: number): boolean;
export function randomHexColor(): string;
