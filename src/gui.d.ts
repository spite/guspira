import type { ReadonlySignal, Signal, WritableSignal } from "./reactive.js";
import type { Curve } from "./curve.js";
import type { ColorFormat } from "./color.js";
import type { PresetStore } from "./presets.js";
import type RangeSlider from "./range-slider.js";
import type StatsGraph from "./stats-graph.js";

/** What a control binds to: a signal, or a plain value it wraps in one. */
export type Bound<T> = WritableSignal<T> | T;

/** What a readout binds to: any signal, or a plain value. */
export type Watched<T> = ReadonlySignal<T> | T;

/** A fixed state, or a rule re-evaluated whenever what it reads changes. */
export type Condition = boolean | (() => unknown);

/** A choice: its value, or `[value, label]` when the two differ. */
export type Choice<T> = T | readonly [T, string];

/** One number for every axis, or one per axis. */
export type PerAxis = number | readonly number[];

export interface GUIOptions {
  /** `false` builds the panel hidden. */
  visible?: boolean;
  /** Start unfolded or folded. Left out, a narrow window starts folded. */
  expanded?: boolean;
  /** Remember the open tab, folded sections and whether the panel is collapsed. */
  storageKey?: string;
  /** An extra class on the container. */
  className?: string;
  /** Called before any reroll. */
  onBeforeRandomize?: (() => void) | null;
}

export interface RowOptions {
  /** Tooltip on the label. */
  title?: string;
  disabled?: Condition;
  disabledWhen?: Condition;
  visible?: Condition;
  visibleWhen?: Condition;
}

export interface ControlOptions<T> extends RowOptions {
  /** Called on user input, after the signal is set. */
  onChange?: (value: T) => void;
  /** `false` keeps the control out of rerolls. */
  randomizable?: boolean;
}

export interface SectionOptions {
  /** `false` makes it a plain heading. */
  collapsible?: boolean;
  /** Whether it starts unfolded. */
  open?: boolean;
  disabled?: Condition;
  disabledWhen?: Condition;
  visible?: Condition;
  visibleWhen?: Condition;
}

export interface SliderOptions<T> extends ControlOptions<T> {
  curve?: Curve;
}

export interface NumberOptions extends ControlOptions<number> {
  min?: number;
  max?: number;
  step?: number;
  /** `false` turns off drag-to-change. */
  scrub?: boolean;
}

export interface VectorOptions extends ControlOptions<number[]> {
  min?: PerAxis;
  max?: PerAxis;
  step?: PerAxis;
  /** Names for the axes. Defaults to x, y, z, w. */
  axes?: readonly string[];
  scrub?: boolean;
}

export interface PadOptions extends ControlOptions<number[]> {
  min?: PerAxis;
  max?: PerAxis;
  step?: PerAxis;
  /** Up is larger. */
  invertY?: boolean;
  /** Pixels, or any CSS length. */
  height?: number | string;
}

export interface ColorOptions<T> extends ControlOptions<T> {
  format?: ColorFormat<T>;
}

export interface TextOptions extends ControlOptions<string> {
  placeholder?: string;
}

export interface TextAreaOptions extends TextOptions {
  rows?: number;
  spellcheck?: boolean;
}

export interface GraphOptions extends RowOptions {
  /** Columns instead of a line. Several signals are always stacked. */
  stacked?: boolean;
  min?: number;
  max?: number;
  /** A budget line, and the reading turns warm past it. */
  over?: number;
  below?: number;
  /** How many samples of history are kept. */
  samples?: number;
  paused?: Condition;
  pausedWhen?: Condition;
  /** Names for the bands of a stacked graph. */
  series?: readonly string[];
  format?: (value: number) => string;
  /** Milliseconds between updates of the reading beside the graph. */
  interval?: number;
}

export interface MonitorOptions<T> extends RowOptions {
  format?: (value: T) => string;
  over?: number;
  below?: number;
}

export interface RandomizeButtonOptions extends RowOptions {
  /** "following" rerolls only the controls added after the button. */
  scope?: "following";
  /** A KeyboardEvent.code. Defaults to "KeyR"; `null` binds no key. */
  key?: string | null;
}

export interface ButtonSpec {
  label: string;
  onClick: (this: HTMLButtonElement, event: MouseEvent) => void;
  title?: string;
}

export interface PresetsOptions {
  /** `false` leaves out the picker of built-in presets. */
  builtin?: boolean;
  /** The picker's label. Defaults to "Preset". */
  label?: string;
  saveLabel?: string;
  onImportError?: (error: unknown) => void;
}

/** A handle on one row of the panel. */
export class Controller {
  constructor(gui: GUI, row: HTMLElement);
  gui: GUI;
  row: HTMLElement;
  /** The widget, once a control has put one in the row. */
  el: Element | null;
  labelEl: HTMLSpanElement | null;
  /** The row's reroll: assign one to make the control randomizable, null to take it out. */
  get randomize(): (() => void) | null;
  set randomize(fn: (() => void) | null | undefined);
  /** Registers an effect the row owns. */
  bind(fn: () => unknown): this;
  /** Registers something to undo when the row is destroyed. */
  onDestroy(fn: () => void): this;
  /** Names a widget after the row's label, and returns it. */
  labelled<E extends Element>(el: E): E;
  setVisible(visible: boolean): this;
  setDisabled(disabled: boolean): this;
  /** Removes the row and stops its effects. */
  destroy(): void;
}

export class Section extends Controller {
  constructor(gui: GUI, row: HTMLElement, body: HTMLElement, open: Signal<boolean>);
  body: HTMLElement;
  open: Signal<boolean>;
  setOpen(open: boolean): this;
  toggle(): this;
}

export class Tab extends Controller {
  constructor(gui: GUI, row: HTMLElement, panel: HTMLElement, button: HTMLButtonElement, index: number);
  panel: HTMLElement;
  button: HTMLButtonElement;
  index: number;
  select(): this;
}

/** A row whose widget is of a known kind. */
export interface Row<E extends Element> extends Controller {
  el: E;
}

/** A row bound to a signal. */
export interface Control<T, E extends Element> extends Row<E> {
  signal: WritableSignal<T>;
}

export interface ButtonRow extends Row<HTMLButtonElement> {
  setLabel(text: string): this;
}

export interface ButtonsRow extends Row<HTMLDivElement> {
  buttons: HTMLButtonElement[];
}

export interface FileButtonRow extends ButtonRow {
  fileInput: HTMLInputElement;
}

export interface SelectControl<T> extends Control<T, HTMLSelectElement> {
  options: readonly Choice<T>[];
  /** Replaces the list of choices. */
  setOptions(list: readonly Choice<T>[]): this;
}

export interface SegmentedControl<T> extends Control<T, HTMLDivElement> {
  options: readonly Choice<T>[];
}

export interface VectorControl extends Control<number[], HTMLDivElement> {
  /** One input per axis. */
  inputs: HTMLInputElement[];
}

export interface GraphRow extends Row<StatsGraph> {
  signal: ReadonlySignal<number>;
  signals: ReadonlySignal<number>[];
}

export interface MonitorRow<T> extends Row<HTMLSpanElement> {
  signal: ReadonlySignal<T>;
}

/** The rows `addPresets` builds. */
export interface PresetRows {
  /** Present when the store has built-in presets. */
  builtin?: SelectControl<string>;
  saved: SelectControl<string>;
  load: HTMLButtonElement;
  remove: HTMLButtonElement;
  name: Control<string, HTMLInputElement>;
  save: HTMLButtonElement;
  files: ButtonsRow;
  /** Rebuilds the saved list, selecting `name` when it is there. */
  refresh(name?: string): void;
}

export class GUI {
  constructor(title?: string, el?: Element, options?: GUIOptions);

  options: GUIOptions;
  container: HTMLDivElement;
  titleEl: HTMLButtonElement;
  scroller: HTMLDivElement;
  rows: HTMLDivElement;
  /** Whether the panel is unfolded. */
  rowsExpanded: Signal<boolean>;

  show(): this;
  hide(): this;
  /** Tears the whole panel down: every row's effects, every key binding, the DOM. */
  destroy(): void;

  /** A top-level tab. Controls added after it go inside, until the next one. */
  addTab(name: string): Tab;
  selectTab(index: number): this;
  /** A titled group inside the current tab. */
  addSection(name: string, options?: SectionOptions): Section;
  /** Sends following controls back to the tab rather than the section opened last. */
  endSection(): this;
  /** Adds into a specific tab or section. With a callback the target applies only inside it. */
  into(target: Section | Tab | Element): this;
  into<R>(target: Section | Tab | Element, fn: () => R): R;

  /** A bare row, for a control the toolkit does not ship. */
  createRow(label?: string | null, options?: RowOptions): Controller;
  /** Rerolls every randomizable control, or only those added after `from`. */
  randomizeAll(from?: number | Controller): this;

  addButton(
    label: string,
    onClick: (this: HTMLButtonElement, event: MouseEvent) => void,
    options?: RowOptions
  ): ButtonRow;
  addRandomizeButton(label?: string, onDone?: () => void, options?: RandomizeButtonOptions): ButtonRow;
  addButtons(label: string | null, buttons: readonly ButtonSpec[], options?: RowOptions): ButtonsRow;
  addFileButton(
    label: string,
    onFile: (file: File) => void,
    options?: RowOptions & { accept?: string }
  ): FileButtonRow;

  addCheckbox(label: string, value: Bound<boolean>, options?: ControlOptions<boolean>): Control<boolean, HTMLInputElement>;
  addSelect<T>(
    label: string,
    value: Bound<T>,
    choices: readonly Choice<T>[],
    options?: ControlOptions<T>
  ): SelectControl<T>;
  addSegmented<T>(
    label: string,
    value: Bound<T>,
    choices: readonly Choice<T>[],
    options?: ControlOptions<T>
  ): SegmentedControl<T>;
  /** `step` may be left out, for a hundredth of the range. */
  addSlider(
    label: string,
    value: Bound<number>,
    min: number,
    max: number,
    step?: number,
    options?: SliderOptions<number>
  ): Control<number, RangeSlider>;
  /** Two handles over one range; the signal holds `[min, max]`. */
  addRangeSlider(
    label: string,
    value: Bound<number[]>,
    min: number,
    max: number,
    step?: number,
    options?: SliderOptions<number[]>
  ): Control<number[], RangeSlider>;
  /** The signal holds a hex string, or whatever `format` says. */
  addColor(label: string, value: Bound<string>, options?: ColorOptions<string>): Control<string, HTMLInputElement>;
  addColor<T>(
    label: string,
    value: Bound<T>,
    options: ColorOptions<T> & { format: ColorFormat<T> }
  ): Control<T, HTMLInputElement>;
  addTextInput(label: string, value: Bound<string>, options?: TextOptions): Control<string, HTMLInputElement>;
  addTextArea(label: string, value: Bound<string>, options?: TextAreaOptions): Control<string, HTMLTextAreaElement>;
  addNumber(label: string, value: Bound<number>, options?: NumberOptions): Control<number, HTMLInputElement>;
  /** A row of number inputs over one array signal. */
  addVector(label: string, value: Bound<number[]>, options?: VectorOptions): VectorControl;
  /** A draggable `[x, y]`. */
  addPad(label: string, value: Bound<number[]>, options?: PadOptions): Control<number[], HTMLDivElement>;

  /** One signal for a line, several for a stacked breakdown. */
  addGraph(
    label: string,
    value: Watched<number> | readonly Watched<number>[],
    options?: GraphOptions
  ): GraphRow;
  /** A read-only display of a signal. */
  addMonitor<T>(label: string, value: Watched<T>, options?: MonitorOptions<T>): MonitorRow<T>;

  addLabel(text: string, options?: RowOptions): Controller;
  /** Free-form HTML inside a row. */
  addText(html: string, options?: RowOptions): Row<HTMLDivElement>;
  addSeparator(options?: RowOptions): Row<HTMLDivElement>;
  /** Any element, wrapped in a row. */
  addElement<E extends Element>(el: E, options?: RowOptions & { label?: string }): Row<E>;

  /** The rows for a preset store: picker, saved list, save, load, delete, export, import. */
  addPresets(store: PresetStore<any>, options?: PresetsOptions): PresetRows;
}

export default GUI;
