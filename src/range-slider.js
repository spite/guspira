// <range-slider> — a single- or dual-handle slider. Add the `dual` attribute for a range;
// `value` is then a [min, max] pair and the element reports "min,max" as its form value.
// Colours come from the host page's --gui-* custom properties, which cross the shadow
// boundary like any other inherited property, with dark-theme fallbacks baked in.

import { snap } from "./format.js";
import { normalizeCurve, curveFitsRange, curveToValue, valueToCurve } from "./curve.js";

class RangeSlider extends HTMLElement {
  static formAssociated = true;

  constructor() {
    super();
    this.internals_ = this.attachInternals();
    this.attachShadow({ mode: "open" });

    this.isDragging = false;
    this.currentHandle = "max";

    this._min = 0;
    this._max = 100;
    this._step = 1;
    this._curve = 1;
    this._valMin = 0;
    this._valMax = 50;
    this._syncingAttribute = false;
    this._listening = false;
    this._dragRect = null;
    this._valueSet = false;
    this._wasDual = false;
    this._pointerId = null;
    this._curveChecked = true;

    this._onPointerMove = (e) => this.handleDragMove(e);
    this._onPointerUp = (e) => this.handleDragEnd(e);
  }

  static get observedAttributes() {
    return ["min", "max", "step", "value", "dual", "disabled", "curve"];
  }

  get template() {
    return `
      <style>
        :host {
          display: inline-block;
          width: 100%;
          height: var(--gui-row-height, 24px);
          user-select: none;
          touch-action: none;
          vertical-align: middle;
          --track-height: var(--gui-track-height, 4px);
          --track-color: var(--gui-track, #333);
          --fill-color: var(--gui-fill, #e0e0e0);
          --thumb-size: 8px;
          --thumb-color: var(--gui-thumb, #fff);
          --thumb-border: 2px solid var(--gui-track, #333);
          --thumb-hover: var(--gui-thumb-hover, #f0f0f0);
          cursor: pointer;
          border-radius: var(--gui-radius, 4px);
        }

        :host([disabled]) {
          opacity: 0.5;
          pointer-events: none;
        }

        :host(:focus-visible) {
          outline: 2px solid var(--gui-focus, #888);
          outline-offset: 2px;
        }

        .container:hover {
          --thumb-size: 16px;
        }

        .container {
          position: relative;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
        }

        .track {
          position: absolute;
          width: 100%;
          height: var(--track-height);
          background-color: var(--track-color);
          border-radius: 4px;
        }

        /* Dragging must not lag behind the pointer, so the eased transitions that make
           programmatic changes look smooth are switched off for the duration. */
        .container.immediate .thumb,
        .container.immediate .fill {
          transition: none;
        }

        .fill {
          position: absolute;
          height: var(--track-height);
          background-color: var(--fill-color);
          border-radius: 4px;
          pointer-events: none;
          transition: width .1s ease-in, left .1s ease-in;
        }

        .thumb {
          position: absolute;
          width: var(--thumb-size);
          height: var(--thumb-size);
          background-color: var(--thumb-color);
          border: var(--thumb-border);
          border-radius: 50%;
          transform: translateX(-50%);
          box-shadow: 0 0.5px 1.5px rgba(0, 0, 0, 0.2);
          transition: left .1s ease-in, transform .1s ease-in, width .1s ease-in, height .1s ease-in;
          z-index: 2;
          box-sizing: border-box;
        }

        .thumb:hover {
          background-color: var(--thumb-hover);
          transform: translateX(-50%) scale(1.1);
        }

        .thumb:active {
          transform: translateX(-50%) scale(0.95);
        }

        :host(:not([dual])) .thumb-min {
          display: none;
        }

        @media (prefers-reduced-motion: reduce) {
          .thumb, .fill { transition: none; }
        }
      </style>

      <div class="container" id="container">
        <div class="track"></div>
        <div class="fill" id="fill"></div>
        <div class="thumb thumb-min" id="thumbMin"></div>
        <div class="thumb thumb-max" id="thumbMax"></div>
      </div>
    `;
  }

  connectedCallback() {
    if (!this.elements) {
      this.shadowRoot.innerHTML = this.template;
      this.elements = {
        container: this.shadowRoot.getElementById("container"),
        fill: this.shadowRoot.getElementById("fill"),
        thumbMin: this.shadowRoot.getElementById("thumbMin"),
        thumbMax: this.shadowRoot.getElementById("thumbMax"),
      };
    }

    if (!this.hasAttribute("tabindex")) this.setAttribute("tabindex", "0");
    if (!this.hasAttribute("role")) this.setAttribute("role", "slider");

    this._checkCurveSoon();
    this.updateUI();
    this.addEventListeners();
  }

  // A drag cannot outlive the element: its pointerup would never be heard.
  disconnectedCallback() {
    this._stopTracking();
    this.isDragging = false;
    this._dragRect = null;
    if (this.elements) this.elements.container.classList.remove("immediate");
  }

  // Drag tracking is on window, for the length of a drag and the pointer that started it.
  _stopTracking() {
    window.removeEventListener("pointermove", this._onPointerMove);
    window.removeEventListener("pointerup", this._onPointerUp);
    window.removeEventListener("pointercancel", this._onPointerUp);
    this._pointerId = null;
  }

  // The track in use: a log track over a range it cannot cover falls back to linear.
  _track() {
    return curveFitsRange(this._curve, this._min, this._max) ? this._curve : 1;
  }

  // Said once the assignments have settled, not part-way through them.
  _checkCurveSoon() {
    if (!this._curveChecked) return;
    this._curveChecked = false;
    queueMicrotask(() => {
      this._curveChecked = true;
      if (this.isConnected && !curveFitsRange(this._curve, this._min, this._max)) {
        console.warn(
          `[guspira] range-slider: curve "log" needs min and max to be non-zero and the same ` +
            `sign (given ${this._min} to ${this._max}) — using a linear track instead`
        );
      }
    });
  }

  // An unusable step is ignored rather than turned into NaN values.
  _setStep(value) {
    const step = parseFloat(value);
    if (Number.isFinite(step) && step > 0) this._step = step;
  }

  // Until given a value the thumb sits mid-range, and a dual slider spans the range.
  _defaultValue() {
    if (this._valueSet) return;
    if (this.hasAttribute("dual")) {
      this._valMin = this._min;
      this._valMax = this._max;
    } else {
      this._valMax = snap((this._min + this._max) / 2, this._step, this._min, this._max);
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || this._syncingAttribute) return;

    switch (name) {
      case "min":
        this._min = parseFloat(newValue);
        this._checkCurveSoon();
        break;
      case "max":
        this._max = parseFloat(newValue);
        this._checkCurveSoon();
        break;
      case "step":
        this._setStep(newValue);
        break;
      case "curve":
        this._curve = normalizeCurve(newValue);
        this._checkCurveSoon();
        break;
      case "value":
        if (newValue === null) break;
        this._valueSet = true;
        if (newValue.includes(",")) {
          const parts = newValue.split(",");
          this._valMin = parseFloat(parts[0]);
          this._valMax = parseFloat(parts[1]);
        } else {
          this._valMax = parseFloat(newValue);
          if (!this.hasAttribute("dual")) this._valMin = this._min;
        }
        break;
    }
    this.updateUI();
  }

  addEventListeners() {
    // The element's own handlers are attached once — connectedCallback runs again whenever
    // the slider is moved in the DOM, and a second copy would fire every event twice.
    if (!this._listening) {
      this._listening = true;
      this.elements.container.addEventListener("pointerdown", (e) => this.handleDragStart(e));
      this.addEventListener("keydown", (e) => this.handleKeyDown(e));
    }
  }

  handleDragStart(e) {
    if (this.hasAttribute("disabled") || e.button !== 0) return;

    this.elements.container.classList.add("immediate");
    this.isDragging = true;
    this._pointerId = e.pointerId;
    window.addEventListener("pointermove", this._onPointerMove);
    window.addEventListener("pointerup", this._onPointerUp);
    window.addEventListener("pointercancel", this._onPointerUp);
    this.focus({ preventScroll: true });

    // Measured once here and reused for the whole drag. Reading it per pointermove forces a
    // layout, and the thumb positions written on the previous move guarantee it is dirty —
    // which is layout thrashing, once per move event.
    this._dragRect = this.getBoundingClientRect();

    this.elements.thumbMin.style.zIndex = 2;
    this.elements.thumbMax.style.zIndex = 2;

    const rect = this._dragRect;
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const value = this.percentageToValue(percentage);

    if (this.hasAttribute("dual")) {
      // Grab the nearer handle — except when both sit on the same value, where "nearer"
      // is meaningless and the only sensible handle is the one that can still move.
      const distMin = Math.abs(value - this._valMin);
      const distMax = Math.abs(value - this._valMax);

      if (this._valMin === this._valMax) {
        if (this._valMin === this._max) this.currentHandle = "min";
        else if (this._valMin === this._min) this.currentHandle = "max";
        else this.currentHandle = value < this._valMin ? "min" : "max";
      } else {
        this.currentHandle = distMin < distMax ? "min" : "max";
      }

      const active = this.currentHandle === "min" ? this.elements.thumbMin : this.elements.thumbMax;
      active.style.zIndex = 3;
    } else {
      this.currentHandle = "max";
    }

    this.updateValueFromPointer(e);
  }

  handleDragMove(e) {
    if (!this.isDragging || e.pointerId !== this._pointerId) return;
    this.updateValueFromPointer(e);
  }

  handleDragEnd(e) {
    if (!this.isDragging || (e && e.pointerId !== this._pointerId)) return;
    this._stopTracking();
    this.isDragging = false;
    this._dragRect = null;
    this.dispatchEvent(new Event("change", { bubbles: true }));
    this.updateFormValue();
    this.elements.container.classList.remove("immediate");
  }

  // Arrows nudge by one step, Page keys by ten, Home/End jump to the ends. In dual mode
  // Shift moves the lower handle, so both are reachable without a pointer.
  handleKeyDown(e) {
    if (this.hasAttribute("disabled")) return;

    const dual = this.hasAttribute("dual");
    const big = this._step * 10;
    let delta = 0;
    let absolute = null;

    switch (e.key) {
      case "ArrowRight": case "ArrowUp": delta = this._step; break;
      case "ArrowLeft": case "ArrowDown": delta = -this._step; break;
      case "PageUp": delta = big; break;
      case "PageDown": delta = -big; break;
      case "Home": absolute = this._min; break;
      case "End": absolute = this._max; break;
      default: return;
    }
    e.preventDefault();

    const handle = dual && e.shiftKey ? "min" : "max";
    const current = handle === "min" ? this._valMin : this._valMax;
    this.currentHandle = handle;
    this.applyValue(absolute !== null ? absolute : current + delta);

    this.dispatchEvent(new Event("input", { bubbles: true }));
    this.dispatchEvent(new Event("change", { bubbles: true }));
  }

  updateValueFromPointer(e) {
    const rect = this._dragRect || this.getBoundingClientRect();
    const percentage = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    this.applyValue(this.percentageToValue(percentage));
    this.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // Snaps to the step grid and clamps to the range (shared with the panel, so the value
  // shown and the value stored can't disagree), then keeps the handles from crossing.
  applyValue(rawValue) {
    this._valueSet = true;
    let value = snap(rawValue, this._step, this._min, this._max);

    if (this.currentHandle === "min") {
      if (value > this._valMax) value = this._valMax;
      this._valMin = value;
    } else {
      if (this.hasAttribute("dual") && value < this._valMin) value = this._valMin;
      this._valMax = value;
    }

    this.updateUI();
  }

  percentageToValue(percentage) {
    return curveToValue(percentage, this._min, this._max, this._track());
  }

  // Returns 0..100: it feeds CSS `left`, which is where it has always gone.
  valueToPercentage(value) {
    return valueToCurve(value, this._min, this._max, this._track()) * 100;
  }

  updateUI() {
    this._defaultValue();
    if (!this.elements) return;

    const dual = this.hasAttribute("dual");
    const clamp = (p) => Math.max(0, Math.min(100, p));
    const pMin = clamp(this.valueToPercentage(dual ? this._valMin : this._min));
    const pMax = clamp(this.valueToPercentage(this._valMax));

    // The lower thumb is display:none unless dual, so positioning it is a style write with
    // nothing to show for it.
    if (dual) this.elements.thumbMin.style.left = `${pMin}%`;
    this.elements.thumbMax.style.left = `${pMax}%`;

    this.elements.fill.style.left = `${pMin}%`;
    this.elements.fill.style.width = `${pMax - pMin}%`;

    // The bounds only change when min/max are assigned, which is not the drag path.
    if (this._ariaBounds !== `${this._min}/${this._max}`) {
      this._ariaBounds = `${this._min}/${this._max}`;
      this.setAttribute("aria-valuemin", this._min);
      this.setAttribute("aria-valuemax", this._max);
    }
    // One number, as the role requires; a dual slider reads out both ends as text.
    this.setAttribute("aria-valuenow", this._valMax);
    if (dual) this.setAttribute("aria-valuetext", `${this._valMin} to ${this._valMax}`);
    else if (this._wasDual) this.removeAttribute("aria-valuetext");
    this._wasDual = dual;

    this.updateFormValue();
  }

  updateFormValue() {
    const value = this.hasAttribute("dual") ? `${this._valMin},${this._valMax}` : `${this._valMax}`;
    this.internals_.setFormValue(value);
    // Reflecting `value` back to the attribute would re-enter attributeChangedCallback and
    // redo the work that just ran; the flag makes the write one-way.
    this._syncingAttribute = true;
    this.setAttribute("value", value);
    this._syncingAttribute = false;
  }

  get value() {
    if (this.hasAttribute("dual")) return [this._valMin, this._valMax];
    return this._valMax;
  }

  // Dragging goes element -> input event -> signal -> effect -> back here with the value the
  // element already has. Without this guard every pointer move repaints the thumbs, rewrites
  // three aria attributes and re-reports the form value a second time, for nothing.
  set value(val) {
    const given = this._valueSet;
    this._valueSet = true;
    if (Array.isArray(val)) {
      if (given && val[0] === this._valMin && val[1] === this._valMax) return;
      this._valMin = val[0];
      this._valMax = val[1];
    } else {
      if (given && val === this._valMax) return;
      this._valMax = val;
    }
    this.updateUI();
  }

  get min() {
    return this._min;
  }

  set min(value) {
    this._min = parseFloat(value);
    this._checkCurveSoon();
    this.updateUI();
  }

  get max() {
    return this._max;
  }

  set max(value) {
    this._max = parseFloat(value);
    this._checkCurveSoon();
    this.updateUI();
  }

  get step() {
    return this._step;
  }

  set step(value) {
    this._setStep(value);
    this.updateUI();
  }

  get curve() {
    return this._curve;
  }

  set curve(value) {
    this._curve = normalizeCurve(value);
    this._checkCurveSoon();
    this.updateUI();
  }
}

if (!customElements.get("range-slider")) customElements.define("range-slider", RangeSlider);

export default RangeSlider;
