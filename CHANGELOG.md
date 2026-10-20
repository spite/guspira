# Changelog

## 0.2.0

### Added

- TypeScript declarations for every module, with `Signal<T>`, `ReadonlySignal<T>`,
  `Tweened<T>`, `Params<T>` and `PresetStore<T>`. A control checks the signal it is handed
  against what it writes.
- `guspira/stats`, `guspira/stats-graph` and `guspira/curve` as entry points of their own.
- `store.load(name)` loads a saved preset by name, whatever it is called.
- `controller.randomize` can be assigned on any row to make it randomizable, or set to `null`
  to take it out.
- `addText` and `addSeparator` take options, like every other row.
- Sliders work without a `step`, taking a hundredth of their range.
- `bindKey(code, fn, { repeat: true })` keeps firing while the key is held.
- A colour demo.

### Changed

- A `computed` is recomputed for whoever reads it first after its source changes, so an
  effect reading a signal and anything derived from it, however deep, runs once per write
  and never sees a half-updated value.
- A slider's step grid is counted from `min`, as `<input type="range">` does, instead of
  from zero.
- A `step` that is not a positive number throws, naming the problem, instead of producing NaN.
- Saved params keep only the values that differ from the defaults, so a changed default
  reaches controls nobody touched. Older saves still load.
- Stored and applied values must match the shape of their default, element by element, and
  numbers must be finite.
- Keyboard shortcuts leave a key to the focused control when it answers it itself: Space and
  Enter on a button, the arrows on a slider. A held key fires once unless the binding asks
  for `repeat`.
- Disabled rows and sections are announced to screen readers as unavailable, and their
  controls are out of the keyboard's reach. Folded panels and sections leave the tab order.
- `<range-slider>` warns and falls back to a linear track for a log curve over a range it
  cannot cover, instead of throwing.
- The presets panel's Load button loads saved presets, and Export downloads the current values.
- A graph bound to a tweened signal plots the value in flight.
- A tweened signal's `update()` counts from its destination, so two in a row add up.
- Randomizing the whole panel is a single update.

### Fixed

- A `<range-slider>` listens on `window` only during a drag, and only to the pointer that
  started it.
- An effect that stops itself while running disposes what it set up after the stop.
- Typed numbers are held to the field's range and step.
- Removing a tab ahead of the active one keeps the same tab active.
- Alt+R randomizes on a Mac keyboard, where Option+R types "®".
- A preset may be called anything, `constructor` included.
