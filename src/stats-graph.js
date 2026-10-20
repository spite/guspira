// <stats-graph> — a value plotted over time, after rStats' graphs.
//
// Standalone, like <range-slider>: no panel and no signals needed. Give it a `source` and it
// samples on its own clock; or call `push()` yourself. `stacked` turns it into a breakdown —
// several series drawn on top of each other, so a frame's total and where the time went are
// the same picture.
//
//   <stats-graph min="0" max="33" over="16"></stats-graph>
//   graph.source = () => performance.now() - lastFrame;
//
// Two things a monitor has to get right, both of which are here rather than in whatever draws
// it: it samples on a clock rather than on a change, because a value that holds still for a
// second is a second of information and not an absence of it; and it does nothing at all while
// it is off screen, folded away or in a collapsed panel, because the one job of a performance
// monitor is to not be what is slowing things down.

const PALETTE = [
  "--gui-series-1, #4c7c0c",
  "--gui-series-2, #fcb300",
  "--gui-series-3, #c74900",
  "--gui-series-4, #850700",
  "--gui-series-5, #284280",
];

// Past the named colours the hue walks by the golden angle, which spreads any number of extra
// series without two of them landing on the same colour. Wrapping the palette instead would
// hand two bands one swatch, and a legend would then be actively wrong rather than merely
// hard to read.
const GENERATED_HUE_STEP = 137.5;

class StatsGraph extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this._min = 0;
    this._max = undefined; // undefined = scale to whatever has been seen
    this._over = undefined;
    this._below = undefined;
    this._samples = 96;
    this._history = [];
    this._source = null;
    this._series = null;
    this._legendAt = 0;
    this._formatValue = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1));
    this._visible = true;
    this._dirty = false;
    this._frame = null;
    this._observers = [];
  }

  static get observedAttributes() {
    return ["min", "max", "over", "below", "samples", "stacked"];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === "samples") this._samples = Math.max(2, parseInt(newValue, 10) || 96);
    else if (name !== "stacked") this[`_${name}`] = newValue === null ? undefined : parseFloat(newValue);
    this.draw();
  }

  connectedCallback() {
    if (!this.canvas) {
      this.shadowRoot.innerHTML = `
        <style>
          :host { display: block; width: 100%; }
          .plot {
            height: var(--gui-graph-height, 38px);
            background: var(--gui-field-bg, #3e3e3e);
            border: 1px solid var(--gui-border, #555);
            border-radius: var(--gui-radius, 4px);
            overflow: hidden;
          }
          canvas { display: block; width: 100%; height: 100%; }
          /* Wraps, because a panel row is narrow and four series will not sit on one line. */
          .legend {
            display: flex;
            flex-wrap: wrap;
            gap: 1px 9px;
            margin-top: 3px;
            font-size: calc(var(--gui-font-size, 13px) - 3px);
            line-height: 1.5;
            color: var(--gui-muted, #888);
          }
          .legend:empty { display: none; }
          .legend span { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
          .legend i {
            width: 7px;
            height: 7px;
            border-radius: 2px;
            flex: 0 0 auto;
          }
          .legend b {
            font-weight: 600;
            color: var(--gui-fg, #e0e0e0);
            font-variant-numeric: tabular-nums;
          }
        </style>
        <div class="plot"><canvas></canvas></div>
        <div class="legend"></div>`;
      this.canvas = this.shadowRoot.querySelector("canvas");
      this.legendEl = this.shadowRoot.querySelector(".legend");
      this.ctx = this.canvas.getContext("2d");
      this._buildLegend();
    }

    // Off screen, folded, or in a collapsed panel: all of them come out as "not intersecting",
    // which is exactly when there is no reason to spend anything.
    if (typeof IntersectionObserver === "function") {
      const io = new IntersectionObserver(([entry]) => {
        // Back in view: whatever was pushed while it was away has yet to be drawn.
        if (entry.isIntersecting && !this._visible) this._dirty = true;
        this._visible = entry.isIntersecting;
      });
      io.observe(this);
      this._observers.push(io);
    }
    if (typeof ResizeObserver === "function") {
      // Marks itself for redraw rather than drawing here: draw() resizes the canvas, which the
      // observer sees as another resize, and the browser reports the feedback as
      // "ResizeObserver loop completed with undelivered notifications". The frame loop below
      // picks the flag up on the next tick instead.
      const ro = new ResizeObserver(() => {
        this._dirty = true;
      });
      ro.observe(this);
      this._observers.push(ro);
    }

    this._loop();
  }

  // Everything started above is stopped here — a graph left running after its row was removed
  // is a frame loop drawing into a canvas nobody can see.
  disconnectedCallback() {
    if (this._frame !== null) cancelAnimationFrame(this._frame);
    this._frame = null;
    this._observers.forEach((observer) => observer.disconnect());
    this._observers.length = 0;
  }

  _loop() {
    const tick = () => {
      if (this._visible) {
        // A source that returns undefined is declining to sample this frame — the pull-side
        // equivalent of simply not calling push(). It is what freezing a graph is made of:
        // the history holds instead of scrolling a held value across and losing it.
        const sample = this._source ? this._source() : undefined;
        if (sample !== undefined) this.push(sample);
        // A source samples every frame, which redraws anyway. Without a sample the only
        // reason to redraw is a resize.
        else if (this._dirty) this.draw();
        this._dirty = false;
      }
      this._frame = requestAnimationFrame(tick);
    };
    this._frame = requestAnimationFrame(tick);
  }

  // Names for the bands. Without them there is no legend at all, so a single-series graph keeps
  // exactly the height it had before this existed.
  set series(names) {
    this._series = Array.isArray(names) && names.length ? names.slice() : null;
    this._buildLegend();
  }
  get series() {
    return this._series ? this._series.slice() : null;
  }

  // How the figures in the legend are written. The panel hands its own formatter down, so the
  // legend and the reading beside the graph agree on units.
  set formatValue(fn) {
    if (typeof fn === "function") this._formatValue = fn;
  }
  get formatValue() {
    return this._formatValue;
  }

  _buildLegend() {
    if (!this.legendEl) return;
    this.legendEl.textContent = "";
    this._legendValues = null;
    if (!this._series) return;
    this._legendValues = this._series.map((name, index) => {
      const item = document.createElement("span");
      const swatch = document.createElement("i");
      swatch.style.background = this._swatch(index);
      const value = document.createElement("b");
      item.append(swatch, document.createTextNode(name), value);
      this.legendEl.append(item);
      return value;
    });
    this._legendAt = 0;
  }

  // The numbers are the point — "where did the frame go" is answered by 4.2 against 8.2, not by
  // knowing which band is which. Throttled, because draw() runs every frame and rewriting text
  // nodes sixty times a second to show a figure nobody can read that fast is pure waste.
  _updateLegend(now) {
    if (!this._legendValues || now - this._legendAt < 100) return;
    this._legendAt = now;
    const last = this._history[this._history.length - 1];
    const parts = Array.isArray(last) ? last : [last];
    this._legendValues.forEach((node, index) => {
      const value = parts[index];
      node.textContent = value === undefined ? "" : ` ${this._formatValue(value)}`;
    });
  }

  // One sample: a number, or an array of them when stacked.
  push(value) {
    this._history.push(value);
    while (this._history.length > this._samples) this._history.shift();
    if (this._visible) this.draw();
    return this;
  }

  clear() {
    this._history.length = 0;
    this.draw();
    return this;
  }

  get history() {
    return this._history.slice();
  }

  // The number a readout would show: the most recent sample, summed if stacked.
  get current() {
    const last = this._history[this._history.length - 1];
    if (last === undefined) return 0;
    return Array.isArray(last) ? last.reduce((sum, v) => sum + v, 0) : last;
  }

  _colour(index, style = getComputedStyle(this)) {
    if (index >= PALETTE.length) {
      return `hsl(${((index - PALETTE.length + 1) * GENERATED_HUE_STEP) % 360} 62% 52%)`;
    }
    const [name, fallback] = PALETTE[index].split(", ");
    return style.getPropertyValue(name).trim() || fallback;
  }

  // The same colour as CSS rather than as a resolved value, so a swatch follows its variable.
  _swatch(index) {
    return index < PALETTE.length ? `var(${PALETTE[index]})` : this._colour(index);
  }

  draw() {
    if (!this.ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height) return;
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }

    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!this._history.length) return;

    const total = (sample) => (Array.isArray(sample) ? sample.reduce((sum, v) => sum + v, 0) : sample);
    const min = this._min ?? 0;
    // Without a stated ceiling the graph finds its own, so a counter whose range you do not
    // know still tells you its shape.
    const max =
      this._max ?? Math.max(...this._history.map(total), this._over ?? 0, min + 1);
    const span = max - min || 1;
    // Clamped to the box. A sample above the ceiling used to plot at a negative y, and since
    // the line graph closes its path along the bottom edge, one such sample filled the whole
    // plot with the fill colour — a solid block that looks like a broken graph rather than
    // like a reading off the top of the scale.
    const y = (value) => height - Math.max(0, Math.min(1, (value - min) / span)) * height;
    const columnWidth = width / this._samples;
    const stacked = this.hasAttribute("stacked");

    const style = getComputedStyle(this);
    const warn = style.getPropertyValue("--gui-warn").trim() || "#c74900";
    this._updateLegend(performance.now());

    if (stacked) {
      const colours = [];
      this._history.forEach((sample, index) => {
        const parts = Array.isArray(sample) ? sample : [sample];
        let base = min;
        parts.forEach((part, series) => {
          ctx.fillStyle = colours[series] ??= this._colour(series, style);
          const top = y(base + part);
          ctx.fillRect(index * columnWidth, top, Math.max(1, columnWidth - 0.5), y(base) - top);
          base += part;
        });
      });
    } else {
      // Area first, then the line over it: the fill carries the shape at a glance and the line
      // keeps single-frame spikes visible, which an area alone loses.
      const fill = style.getPropertyValue("--gui-fill").trim() || "#e0e0e0";
      ctx.beginPath();
      ctx.moveTo(0, height);
      this._history.forEach((sample, index) => ctx.lineTo(index * columnWidth, y(total(sample))));
      ctx.lineTo((this._history.length - 1) * columnWidth, height);
      ctx.closePath();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = fill;
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.beginPath();
      this._history.forEach((sample, index) => {
        const point = [index * columnWidth, y(total(sample))];
        index ? ctx.lineTo(...point) : ctx.moveTo(...point);
      });
      ctx.strokeStyle = this._breached(total(this._history[this._history.length - 1])) ? warn : fill;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // The threshold, drawn where it falls, so "is this over budget" is a glance and not a sum.
    for (const limit of [this._over, this._below]) {
      if (limit === undefined || limit === null || Number.isNaN(limit)) continue;
      ctx.strokeStyle = warn;
      ctx.globalAlpha = 0.6;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, y(limit));
      ctx.lineTo(width, y(limit));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }

  // True when the latest sample is outside the budget set for it.
  _breached(value) {
    if (this._over !== undefined && !Number.isNaN(this._over) && value > this._over) return true;
    if (this._below !== undefined && !Number.isNaN(this._below) && value < this._below) return true;
    return false;
  }

  get breached() {
    return this._breached(this.current);
  }

  set source(fn) {
    this._source = typeof fn === "function" ? fn : null;
  }
  get source() {
    return this._source;
  }

  set samples(count) {
    this._samples = Math.max(2, count | 0);
  }
  get samples() {
    return this._samples;
  }

  set min(value) {
    this._min = value === undefined || value === null ? undefined : parseFloat(value);
    this.draw();
  }
  get min() {
    return this._min;
  }

  set max(value) {
    this._max = value === undefined || value === null ? undefined : parseFloat(value);
    this.draw();
  }
  get max() {
    return this._max;
  }

  set over(value) {
    this._over = value === undefined || value === null ? undefined : parseFloat(value);
    this.draw();
  }
  get over() {
    return this._over;
  }

  set below(value) {
    this._below = value === undefined || value === null ? undefined : parseFloat(value);
    this.draw();
  }
  get below() {
    return this._below;
  }
}

if (!customElements.get("stats-graph")) customElements.define("stats-graph", StatsGraph);

export default StatsGraph;
