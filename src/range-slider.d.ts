import type { Curve } from "./curve.js";

/** `<range-slider>`: a single- or dual-handle slider, form-associated. */
export default class RangeSlider extends HTMLElement {
  static formAssociated: boolean;
  isDragging: boolean;

  /** A number, or `[min, max]` with the `dual` attribute. */
  get value(): number | [number, number];
  set value(value: number | readonly number[]);

  get min(): number;
  set min(value: number | string);

  get max(): number;
  set max(value: number | string);

  get step(): number;
  set step(value: number | string);

  get curve(): Curve;
  set curve(value: number | string | null | undefined);

  /** Track position (0..1) to value. */
  percentageToValue(percentage: number): number;
  /** Value to track position, as 0..100. */
  valueToPercentage(value: number): number;
}

declare global {
  interface HTMLElementTagNameMap {
    "range-slider": RangeSlider;
  }
}
