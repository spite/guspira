// The control panel. Every control binds to a signal: the signal is the value, so there is
// no separate "controller value" to keep in sync — writing the signal updates the widget,
// and the widget writes the signal. Each add*() returns a Controller, a handle on the row
// it created (`.row`, `.el`, `.destroy()`), for the cases where a panel is built
// dynamically or needs a widget the toolkit doesn't ship.

import { signal, effect, toSignal } from "./reactive.js";
import { formatFloat, snap } from "./format.js";
import "./range-slider.js";
import { randomInRange, randomElement, randomHexColor, randomBool } from "./random.js";
import { bindKey } from "./keyboard.js";

const CHEVRON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;

function composeRangeValue(min, max, step) {
  return `${formatFloat(min, step)}–${formatFloat(max, step)}`;
}

// Accepts both the trailing-options form and the older positional one, so
// addSlider(..., onChange, disabled) and addSlider(..., { onChange, disabled }) both work.
function readOptions(a, b) {
  if (typeof a === "function") return { onChange: a, disabled: b };
  if (a && typeof a === "object") return a;
  return {};
}

// Buttons never had an onChange — their trailing positional argument was always `disabled`,
// so they need their own reading of it or an old call silently loses its disabled state.
function readButtonOptions(a) {
  if (typeof a === "function") return { disabled: a };
  if (a && typeof a === "object") return a;
  return {};
}

// The two state options come as a pair: `disabled` / `disabledWhen` and `visible` /
// `visibleWhen`. Either spelling is accepted and either kind of value — a boolean for a state
// that never changes, a predicate for one that does — so the difference between them is the
// only thing the name has to carry.
function condition(...candidates) {
  for (const value of candidates) {
    if (value === undefined || value === null) continue;
    return typeof value === "function" ? value : () => value;
  }
  return null;
}

// A control shows where the value was put, not where an animation currently is: reading the
// value would rewrite the widget on every frame and fight the hand that is dragging it. On a
// plain signal the target is the signal, so this is a no-op for everything that does not
// travel. Read-only monitors are the exception — they display whatever they are given.
const targetOf = (sig) => sig.target || sig;

const optionValue = (opt) => (Array.isArray(opt) ? opt[0] : opt);
const optionLabel = (opt) => (Array.isArray(opt) ? opt[1] : opt);

// A handle on one row of the panel. Controls hand these back so a panel can be taken apart
// again: destroy() stops the row's effects (otherwise a removed row stays subscribed to its
// signal forever) and unregisters it from the GUI.
class Controller {
  constructor(gui, row) {
    this.gui = gui;
    this.row = row;
    this.el = null;
    this.labelEl = null;
    this.randomize = null;
    this._stops = [];
    this._destroyed = false;
  }

  // Registers an effect owned by this row.
  bind(fn) {
    this._stops.push(effect(fn));
    return this;
  }

  onDestroy(fn) {
    this._stops.push(fn);
    return this;
  }

  setVisible(visible) {
    this.row.classList.toggle("gui-hidden", !visible);
    return this;
  }

  setDisabled(disabled) {
    this.row.classList.toggle("disabled", !!disabled);
    return this;
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._stops.forEach((stop) => stop());
    this._stops.length = 0;
    this.row.remove();
    this.gui._forget(this);
  }
}

// A group destroys what it contains: removing the element alone would leave its rows'
// effects running, still subscribed to signals, with the detached DOM kept alive by them.
function destroyChildren(controller, container) {
  [...controller.gui._controllers].forEach((c) => {
    if (c !== controller && container.contains(c.row)) c.destroy();
  });
}

class Section extends Controller {
  constructor(gui, row, body, open) {
    super(gui, row);
    this.body = body;
    this.open = open;
  }

  destroy() {
    if (this._destroyed) return;
    destroyChildren(this, this.body);
    super.destroy();
  }

  setOpen(v) {
    this.open.set(!!v);
    return this;
  }

  toggle() {
    return this.setOpen(!this.open());
  }
}

class Tab extends Controller {
  constructor(gui, row, panel, button, index) {
    super(gui, row);
    this.panel = panel;
    this.button = button;
    this.index = index;
  }

  select() {
    this.gui.selectTab(this.index);
    return this;
  }

  destroy() {
    if (this._destroyed) return;
    destroyChildren(this, this.panel);
    this.button.remove();
    super.destroy();
  }
}

class GUI {
  // `opts`: { visible, expanded, storageKey, onBeforeRandomize, className }.
  // `storageKey` makes the panel remember its own layout state — collapsed or expanded,
  // which tab was open, which sections were folded — separately from app parameters.
  constructor(title = "Settings", el = document.body, opts = {}) {
    this.options = opts;
    this._storageKey = opts.storageKey || null;
    this._controllers = [];
    this._unbinds = [];

    this.container = document.createElement("div");
    this.container.className = "gui";
    if (opts.className) this.container.classList.add(opts.className);

    const titleEl = document.createElement("div");
    titleEl.className = "gui-title";
    titleEl.textContent = title;
    this.titleEl = titleEl;

    const expandEl = document.createElement("span");
    expandEl.className = "gui-chevron";
    expandEl.innerHTML = CHEVRON;
    titleEl.append(expandEl);
    this.container.append(titleEl);

    this.scroller = document.createElement("div");
    this.scroller.className = "gui-scroller";
    this.container.append(this.scroller);

    this.rows = document.createElement("div");
    this.rows.className = "gui-rows";
    this.scroller.append(this.rows);

    // Where the next control lands. Tabs and sections retarget it; before any tab exists,
    // controls go straight into `rows` — that's how a persistent header (a Preset select,
    // say) ends up above the tab bar.
    this._current = this.rows;
    this._currentTab = this.rows;
    this._tabBar = null;
    this._tabs = [];
    this._activeTab = signal(0);

    const wide = window.innerWidth > 950;
    this.rowsExpanded = signal(this._readUIState("expanded", opts.expanded ?? wide));

    titleEl.addEventListener("click", () => {
      this.rowsExpanded.set(!this.rowsExpanded.peek());
      this._writeUIState("expanded", this.rowsExpanded.peek());
    });

    // Kept so destroy() can stop them — otherwise a torn-down panel stays subscribed to
    // its own signals and holds the whole detached DOM tree alive. Sketch galleries that
    // swap panels per sketch would accumulate one of these per switch.
    this._stops = [
      effect(() => {
        const expanded = this.rowsExpanded();
        this.rows.classList.toggle("visible", expanded);
        this.container.classList.toggle("collapsed", !expanded);
      }),
      effect(() => this._syncTabs(this._activeTab())),
    ];

    el.append(this.container);
    if (opts.visible !== false) this.show();
  }

  // --- panel-level -------------------------------------------------------------------

  show() {
    this.container.classList.add("visible");
    return this;
  }

  hide() {
    this.container.classList.remove("visible");
    return this;
  }

  // Tears the whole panel down: every row's effects, every key binding, the DOM.
  destroy() {
    [...this._controllers].forEach((c) => c.destroy());
    this._unbinds.forEach((u) => u());
    this._unbinds.length = 0;
    this._stops.forEach((stop) => stop());
    this._stops.length = 0;
    this.container.remove();
  }

  // Called both by the active-tab effect and by addTab — a newly added panel has to be
  // classed straight away, and adding a tab doesn't change which index is active.
  // Only reflects state — it must not write the remembered tab. A panel being rebuilt adds
  // its tabs one at a time, and each addTab would otherwise save the tab that happens to be
  // active mid-build, wiping the name it is about to restore.
  _syncTabs(active = this._activeTab.peek()) {
    this._tabs.forEach((tab, i) => {
      tab.panel.classList.toggle("active", i === active);
      tab.button.classList.toggle("active", i === active);
    });
  }

  _forget(controller) {
    const i = this._controllers.indexOf(controller);
    if (i !== -1) this._controllers.splice(i, 1);
    const t = this._tabs.indexOf(controller);
    if (t !== -1) {
      this._tabs.splice(t, 1);
      this._tabs.forEach((tab, i) => (tab.index = i));
      const active = Math.min(this._activeTab.peek(), this._tabs.length - 1);
      this._activeTab.set(Math.max(0, active));
      this._syncTabs();
    }
  }

  // Panel layout state (folded/expanded/active tab) — kept apart from app parameters, and
  // silently skipped when no storageKey was given or storage is unavailable.
  _readUIState(key, fallback) {
    if (!this._storageKey) return fallback;
    try {
      const raw = localStorage.getItem(`${this._storageKey}:ui:${key}`);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  _writeUIState(key, value) {
    if (!this._storageKey) return;
    try {
      localStorage.setItem(`${this._storageKey}:ui:${key}`, JSON.stringify(value));
    } catch {}
  }

  // --- structure ---------------------------------------------------------------------

  // A top-level tab. Subsequent add*() calls go into it until the next addTab(). The tab
  // bar appears on the first call; the first tab is active unless a remembered one wins.
  addTab(name) {
    if (!this._tabBar) {
      this._tabBar = document.createElement("div");
      this._tabBar.className = "gui-tabbar";
      this.rows.append(this._tabBar);
    }

    const index = this._tabs.length;
    const panel = document.createElement("div");
    panel.className = "gui-tab-panel";
    this.rows.append(panel);

    const button = document.createElement("button");
    button.className = "gui-tab-btn";
    button.type = "button";
    button.textContent = name;
    this._tabBar.append(button);

    const tab = new Tab(this, panel, panel, button, index);
    // Reads the tab's live index rather than the one it was built with, which shifts when
    // an earlier tab is destroyed.
    button.onclick = () => this.selectTab(tab.index);
    this._tabs.push(tab);
    this._controllers.push(tab);

    this._currentTab = panel;
    this._current = panel;

    if (this._readUIState("tab", null) === name) this._activeTab.set(index);
    else this._syncTabs();

    return tab;
  }

  // Choosing a tab is the only thing that records one, so the remembered tab is always a
  // deliberate choice rather than a side effect of building the panel.
  selectTab(index) {
    this._activeTab.set(index);
    const tab = this._tabs[index];
    if (tab) this._writeUIState("tab", tab.button.textContent);
    return this;
  }

  // A titled group inside the current tab. `visibleWhen` hides the whole group (an
  // attractor's settings while a different field is selected, say) and `disabledWhen` greys
  // it out; `open`/`collapsible` control folding, which is remembered per section when the
  // GUI has a storageKey.
  addSection(name, opts = {}) {
    const { collapsible = true } = opts;
    const visible = condition(opts.visibleWhen, opts.visible);
    const disabled = condition(opts.disabledWhen, opts.disabled);

    const section = document.createElement("div");
    section.className = "gui-section";

    const title = document.createElement("div");
    title.className = "gui-section-title";
    title.textContent = name;

    const body = document.createElement("div");
    body.className = "gui-section-body";

    section.append(title, body);
    this._currentTab.append(section);
    this._current = body;

    // Scoped by tab: two tabs are free to have a section of the same name, and without the
    // prefix they would share one fold state.
    const tabName = this._tabs.length ? this._tabs[this._tabs.length - 1].button.textContent : "";
    const stateKey = `section:${tabName}/${name}`;
    const open = signal(collapsible ? this._readUIState(stateKey, opts.open ?? true) : true);
    const controller = new Section(this, section, body, open);

    if (collapsible) {
      const chevron = document.createElement("span");
      chevron.className = "gui-chevron";
      chevron.innerHTML = CHEVRON;
      title.append(chevron);
      title.classList.add("gui-collapsible");
      // Only a click records the state. Writing it from the effect would save the code's
      // own default on first run, after which changing `open:` in the source would never
      // take effect again for anyone who had loaded the page once.
      title.addEventListener("click", () => {
        controller.toggle();
        this._writeUIState(stateKey, open.peek());
      });
      controller.bind(() => section.classList.toggle("open", open()));
    } else {
      section.classList.add("open");
    }

    // Sections take the same pair as rows, so a whole group can hide or grey out at once.
    if (visible) controller.bind(() => section.classList.toggle("gui-hidden", !visible()));
    if (disabled) controller.bind(() => section.classList.toggle("disabled", !!disabled()));

    this._controllers.push(controller);
    return controller;
  }

  // Sends following controls back to the tab (or the panel root) rather than the section
  // opened last.
  endSection() {
    this._current = this._currentTab;
    return this;
  }

  // Adds into a specific tab or section rather than wherever the last one left the cursor.
  // Building a panel is sequential, but adding a row later is not — a button that appends a
  // layer needs to say where the layer goes, long after that section stopped being current.
  // With a callback the target applies only inside it; without one it sticks.
  into(target, fn) {
    const container = target instanceof Section ? target.body : target instanceof Tab ? target.panel : target;
    const prevCurrent = this._current;
    const prevTab = this._currentTab;

    this._current = container;
    if (target instanceof Tab) this._currentTab = target.panel;

    if (!fn) return this;
    try {
      return fn();
    } finally {
      this._current = prevCurrent;
      this._currentTab = prevTab;
    }
  }

  // --- rows --------------------------------------------------------------------------

  createRow(label, opts = {}) {
    const row = document.createElement("div");
    row.className = "gui-row";

    const controller = new Controller(this, row);

    if (label) {
      const labelEl = document.createElement("span");
      labelEl.className = "gui-label";
      labelEl.textContent = label;
      if (opts.title) labelEl.title = opts.title;
      row.append(labelEl);
      controller.labelEl = labelEl;
    }

    const disabled = condition(opts.disabledWhen, opts.disabled);
    if (disabled) controller.bind(() => row.classList.toggle("disabled", !!disabled()));

    const visible = condition(opts.visibleWhen, opts.visible);
    if (visible) controller.bind(() => row.classList.toggle("gui-hidden", !visible()));

    this._current.append(row);
    this._controllers.push(controller);
    return controller;
  }

  // Clicking a control's label rolls a new value for it. `fn` does the rolling; wiring it
  // here also enrolls the control in panel-wide randomisation.
  _randomizable(controller, fn, opts) {
    if (opts.randomizable === false) return;
    controller.randomize = fn;
    if (!controller.labelEl) return;
    controller.labelEl.classList.add("gui-randomizable");
    controller.labelEl.title = opts.title || "Click to randomize";
    const handler = () => {
      if (controller.row.classList.contains("disabled")) return;
      this._beforeRandomize();
      fn();
    };
    controller.labelEl.addEventListener("click", handler);
    controller.onDestroy(() => controller.labelEl.removeEventListener("click", handler));
  }

  _beforeRandomize() {
    if (this.options.onBeforeRandomize) this.options.onBeforeRandomize();
  }

  // Rerolls every randomizable control, or only those added after `from` (a controller or
  // an index) — that's how a "Randomize" button randomizes what follows it and not itself.
  randomizeAll(from = 0) {
    let start = from;
    if (from instanceof Controller) {
      const at = this._controllers.indexOf(from);
      if (at === -1) return this; // already destroyed: rolling everything would be worse
      start = at + 1;
    }
    this._beforeRandomize();
    this._controllers.slice(Math.max(0, start)).forEach((c) => {
      // A disabled control is not the user's to change right now, which is the same reason
      // clicking its label does nothing.
      if (!c.randomize || c.row.classList.contains("disabled")) return;
      c.randomize();
    });
    return this;
  }

  // --- controls ----------------------------------------------------------------------

  addButton(label, onClick, a) {
    const opts = readButtonOptions(a);
    const controller = this.createRow(null, opts);
    const btn = document.createElement("button");
    btn.className = "gui-btn";
    btn.type = "button";
    btn.textContent = label;
    btn.onclick = onClick;
    controller.row.append(btn);
    controller.el = btn;
    controller.setLabel = (text) => {
      btn.textContent = text;
      return controller;
    };
    return controller;
  }

  // A button that rerolls the panel, then calls `onDone` (rebuild the scene, reseed,
  // whatever the new values need). Bound to a key as well — R by default.
  //
  // `scope: "following"` narrows it to the controls added after the button, which is useful
  // when a preset picker or an output setting sits above it. It is not the default: a button
  // added at the bottom of a panel would then reroll nothing at all, silently.
  addRandomizeButton(label = "Randomize", onDone = () => {}, a) {
    const opts = readButtonOptions(a);
    let controller = null;
    const run = () => {
      this.randomizeAll(opts.scope === "following" ? controller : 0);
      onDone();
    };
    controller = this.addButton(label, run, opts);
    if (opts.key !== null) {
      const unbind = bindKey(opts.key || "KeyR", run);
      this._unbinds.push(unbind);
      controller.onDestroy(unbind);
    }
    return controller;
  }

  // Several buttons sharing one row, so a pair like Export / Import costs one row instead
  // of two. `buttons` is a list of { label, onClick, title }.
  addButtons(label, buttons, a) {
    const opts = readButtonOptions(a);
    const controller = this.createRow(label, opts);

    const group = document.createElement("div");
    // With a label the group sits in the control column; without one it takes the full row,
    // the same way a lone button does.
    group.className = label ? "gui-control gui-btn-group" : "gui-btn-group";

    controller.buttons = buttons.map(({ label: text, onClick, title }) => {
      const btn = document.createElement("button");
      btn.className = "gui-btn";
      btn.type = "button";
      btn.textContent = text;
      if (title) btn.title = title;
      btn.onclick = onClick;
      group.append(btn);
      return btn;
    });

    controller.row.append(group);
    controller.el = group;
    return controller;
  }

  addCheckbox(label, value, a, b) {
    const opts = readOptions(a, b);
    const sig = toSignal(value);
    const controller = this.createRow(label, opts);

    this._randomizable(controller, () => {
      sig.set(randomBool());
      opts.onChange && opts.onChange(sig());
    }, opts);

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "gui-checkbox";
    input.onchange = () => {
      sig.set(input.checked);
      opts.onChange && opts.onChange(input.checked);
    };

    controller.bind(() => (input.checked = targetOf(sig)()));
    controller.row.append(input);
    controller.el = input;
    controller.signal = sig;
    return controller;
  }

  // `options` is a list of values, or of [value, label] pairs when the two differ.
  addSelect(label, value, options, a, b) {
    // The older projects called this as (label, options, signal); detected rather than
    // broken, since the two argument lists are unambiguous — an options list is never a
    // function and a signal always is.
    if (Array.isArray(value) && typeof options === "function") {
      const swap = value;
      value = options;
      options = swap;
    }

    const opts = readOptions(a, b);
    const sig = toSignal(value);
    const controller = this.createRow(label, opts);

    this._randomizable(controller, () => {
      sig.set(optionValue(randomElement(controller.options)));
      opts.onChange && opts.onChange(sig());
    }, opts);

    const select = document.createElement("select");
    select.className = "gui-select";
    // <select> values are strings. Looking the choice back up in the options list returns
    // the value as it was given, so a list of numbers stays numbers — otherwise the signal
    // would flip type on first use and a typed params store would reject it on reload.
    select.onchange = () => {
      const match = controller.options.find((o) => String(optionValue(o)) === select.value);
      const v = match === undefined ? select.value : optionValue(match);
      sig.set(v);
      opts.onChange && opts.onChange(v);
    };

    // Rebuilt wholesale rather than diffed — option lists here are short, and a preset
    // picker's list changes shape on every save or delete.
    let optionValues = new Set();
    controller.setOptions = (list) => {
      controller.options = list;
      optionValues = new Set(list.map((o) => String(optionValue(o))));
      select.innerHTML = "";
      list.forEach((opt) => {
        const el = document.createElement("option");
        el.value = optionValue(opt);
        el.textContent = optionLabel(opt);
        select.append(el);
      });
      select.value = String(sig.peek());
      return controller;
    };
    controller.setOptions(options);

    // Kept in an effect so external writes (a preset load) move the picker too. A value
    // that isn't in the list leaves the picker where it is rather than blanking it.
    controller.bind(() => {
      const v = String(targetOf(sig)());
      if (optionValues.has(v)) select.value = v;
    });

    controller.row.append(select);
    controller.el = select;
    controller.signal = sig;
    return controller;
  }

  addSlider(label, value, min, max, step, a, b) {
    const opts = readOptions(a, b);
    const sig = toSignal(value);
    const controller = this.createRow(label, opts);

    this._randomizable(controller, () => {
      sig.set(snap(randomInRange(min, max), step, min, max));
      opts.onChange && opts.onChange(sig());
    }, opts);

    const wrapper = document.createElement("div");
    wrapper.className = "gui-slider-container";

    const input = document.createElement("range-slider");
    input.className = "gui-slider";
    input.min = min;
    input.max = max;
    input.step = step;
    input.oninput = () => {
      const v = parseFloat(input.value);
      sig.set(v);
      opts.onChange && opts.onChange(v);
    };

    const valDisplay = document.createElement("span");
    valDisplay.className = "gui-slider-val";
    valDisplay.title = "Click to type a value";

    // Typing an exact value: dragging can't reach 0.37 reliably, and some parameters are
    // worth setting precisely. The span becomes an input on click and swaps back on commit.
    const startEditing = () => {
      if (controller.row.classList.contains("disabled")) return;
      if (valDisplay.dataset.editing) return;
      valDisplay.dataset.editing = "1";

      const editor = document.createElement("input");
      editor.type = "text";
      editor.className = "gui-slider-edit";
      editor.value = formatFloat(targetOf(sig).peek(), step);
      valDisplay.replaceWith(editor);
      editor.focus();
      editor.select();

      // Enter commits and puts the span back, which blurs the editor and would run this a
      // second time on a node that is no longer in the document.
      let committed = false;
      const commit = (accept) => {
        if (committed) return;
        committed = true;
        editor.onblur = null;
        if (accept) {
          const parsed = parseFloat(editor.value);
          if (isFinite(parsed)) {
            const v = snap(parsed, step, min, max);
            sig.set(v);
            opts.onChange && opts.onChange(v);
          }
        }
        editor.replaceWith(valDisplay);
        delete valDisplay.dataset.editing;
      };

      editor.onblur = () => commit(true);
      editor.onkeydown = (e) => {
        if (e.key === "Enter") commit(true);
        else if (e.key === "Escape") commit(false);
      };
    };
    valDisplay.addEventListener("click", startEditing);

    controller.bind(() => {
      const v = targetOf(sig)();
      input.value = v;
      valDisplay.textContent = formatFloat(v, step);
    });

    wrapper.append(input, valDisplay);
    controller.row.append(wrapper);
    controller.el = input;
    controller.signal = sig;
    return controller;
  }

  // Two handles over one range; the signal holds [min, max].
  addRangeSlider(label, value, min, max, step, a, b) {
    const opts = readOptions(a, b);
    const sig = toSignal(value);
    const controller = this.createRow(label, opts);

    this._randomizable(controller, () => {
      const lo = snap(randomInRange(min, max), step, min, max);
      const hi = snap(randomInRange(lo, max), step, min, max);
      sig.set([lo, hi]);
      opts.onChange && opts.onChange(sig());
    }, opts);

    const wrapper = document.createElement("div");
    wrapper.className = "gui-slider-container";

    const input = document.createElement("range-slider");
    input.setAttribute("dual", "");
    input.className = "gui-slider";
    input.min = min;
    input.max = max;
    input.step = step;
    input.oninput = () => {
      const [lo, hi] = input.value;
      sig.set([parseFloat(lo), parseFloat(hi)]);
      opts.onChange && opts.onChange(sig());
    };

    const valDisplay = document.createElement("span");
    valDisplay.className = "gui-slider-val gui-range-val";

    controller.bind(() => {
      const [lo, hi] = targetOf(sig)();
      input.value = [lo, hi];
      valDisplay.textContent = composeRangeValue(lo, hi, step);
    });

    wrapper.append(input, valDisplay);
    controller.row.append(wrapper);
    controller.el = input;
    controller.signal = sig;
    return controller;
  }

  addColor(label, value, a, b) {
    const opts = readOptions(a, b);
    const sig = toSignal(value);
    const controller = this.createRow(label, opts);

    this._randomizable(controller, () => {
      sig.set(randomHexColor());
      opts.onChange && opts.onChange(sig());
    }, opts);

    const input = document.createElement("input");
    input.type = "color";
    input.className = "gui-color";
    input.oninput = () => {
      sig.set(input.value);
      opts.onChange && opts.onChange(input.value);
    };

    controller.bind(() => (input.value = targetOf(sig)()));
    controller.row.append(input);
    controller.el = input;
    controller.signal = sig;
    return controller;
  }

  addTextInput(label, value, a, b) {
    const opts = readOptions(a, b);
    const sig = toSignal(value);
    const controller = this.createRow(label, opts);

    const input = document.createElement("input");
    input.type = "text";
    input.className = "gui-input-text";
    if (opts.placeholder) input.placeholder = opts.placeholder;
    input.oninput = () => {
      sig.set(input.value);
      opts.onChange && opts.onChange(input.value);
    };

    // Skipped while the field has focus, so a value arriving mid-typing can't move the
    // caret out from under the user.
    controller.bind(() => {
      const v = targetOf(sig)();
      if (document.activeElement !== input) input.value = v;
    });

    controller.row.append(input);
    controller.el = input;
    controller.signal = sig;
    return controller;
  }

  addNumber(label, value, a, b) {
    const opts = readOptions(a, b);
    const sig = toSignal(value);
    const controller = this.createRow(label, opts);

    const input = document.createElement("input");
    input.type = "number";
    input.className = "gui-input-number";
    if (opts.min !== undefined) input.min = opts.min;
    if (opts.max !== undefined) input.max = opts.max;
    if (opts.step !== undefined) input.step = opts.step;
    input.oninput = () => {
      const v = parseFloat(input.value);
      if (!isFinite(v)) return;
      sig.set(v);
      opts.onChange && opts.onChange(v);
    };

    controller.bind(() => {
      const v = targetOf(sig)();
      if (document.activeElement !== input) input.value = v;
    });

    controller.row.append(input);
    controller.el = input;
    controller.signal = sig;
    return controller;
  }

  // Read-only display of a signal (frame time, particle count, whatever the app computes).
  // Unlike the editable controls this reads the value rather than the target: a readout has
  // no hand to fight, and showing a value travelling is usually the reason for pointing one
  // at a tween.
  addMonitor(label, value, a, b) {
    const opts = readOptions(a, b);
    const sig = toSignal(value);
    const controller = this.createRow(label, opts);

    const out = document.createElement("span");
    out.className = "gui-monitor";
    const format = opts.format || ((v) => String(v));
    controller.bind(() => (out.textContent = format(sig())));

    controller.row.append(out);
    controller.el = out;
    controller.signal = sig;
    return controller;
  }

  // A file picker that hands the File to `onFile`. The input is reset after each pick so
  // choosing the same file twice still fires.
  addFileButton(label, onFile, a) {
    const opts = readButtonOptions(a);
    const controller = this.addButton(label, () => input.click(), opts);

    const input = document.createElement("input");
    input.type = "file";
    input.hidden = true;
    if (opts.accept) input.accept = opts.accept;
    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      if (file) onFile(file);
      input.value = "";
    });

    controller.row.append(input);
    controller.fileInput = input;
    return controller;
  }

  addLabel(text, opts = {}) {
    return this.createRow(text, opts);
  }

  // Free-form HTML inside a row — a description, a legend, a link.
  addText(html) {
    const controller = this.createRow();
    const content = document.createElement("div");
    content.className = "gui-text";
    content.innerHTML = html;
    controller.row.append(content);
    controller.el = content;
    return controller;
  }

  addSeparator() {
    const controller = this.createRow();
    const line = document.createElement("div");
    line.className = "gui-separator";
    controller.row.append(line);
    controller.el = line;
    return controller;
  }

  // Any element, wrapped in a row so it lines up with everything else.
  addElement(el, opts = {}) {
    const controller = this.createRow(opts.label, opts);
    controller.row.append(el);
    controller.el = el;
    return controller;
  }

  // --- presets -----------------------------------------------------------------------

  // Builds the UI for a preset store (see presets.js): a picker of built-ins, a picker of
  // saved ones, and save/load/delete/export/import. Returns the controllers it created.
  addPresets(store, opts = {}) {
    const created = {};

    if (opts.builtin !== false && store.builtinNames().length) {
      const names = store.builtinNames();
      // Mirrors store.current rather than binding to it directly: loading a *saved* preset
      // sets a name this picker has no option for, and the picker should fall back to the
      // custom entry instead of going blank.
      const pick = signal(names.includes(store.current.peek()) ? store.current.peek() : names[0]);
      created.builtin = this.addSelect(opts.label || "Preset", pick, names, {
        onChange: (name) => store.apply(name),
      });
      created.builtin.bind(() =>
        pick.set(names.includes(store.current()) ? store.current() : names[0])
      );
    }

    // A small button that sits beside a field rather than owning a row of its own.
    const attach = (controller, text, title, onClick) => {
      controller.row.classList.add("gui-compact");
      const btn = document.createElement("button");
      btn.className = "gui-btn gui-btn-mini";
      btn.type = "button";
      btn.textContent = text;
      btn.title = title;
      btn.onclick = onClick;
      controller.row.append(btn);
      return btn;
    };

    const selected = signal("");
    created.saved = this.addSelect("Saved", selected, [], { randomizable: false });

    // The saved list changes shape on every save and delete, so the picker is rebuilt and
    // the selection re-pinned through the signal (never by poking the <select> directly,
    // which the binding effect would undo on the next change).
    const refresh = (select) => {
      const names = store.userNames();
      created.saved.setOptions(names.length ? names : [["", "(none saved)"]]);
      const next = select && names.includes(select) ? select : names[0] || "";
      selected.set(next);
      created.saved.el.value = next;
    };
    refresh();

    created.load = attach(created.saved, "Load", "Load the selected preset", () => {
      if (selected()) store.apply(selected());
    });
    created.remove = attach(created.saved, "✕", "Delete the selected preset", () => {
      if (!selected()) return;
      store.remove(selected());
      refresh();
    });

    const name = signal("");
    created.name = this.addTextInput("Name", name, { placeholder: "name this look" });
    created.save = attach(created.name, opts.saveLabel || "Save", "Save the current values", () => {
      const key = name().trim();
      if (!key) return;
      store.save(key);
      refresh(key);
    });

    // A malformed file rejects; without the catch that surfaces as an unhandled rejection
    // and the user gets no sign that anything happened.
    const importFile = (file) =>
      store
        .importFile(file)
        .then(() => refresh())
        .catch((e) => {
          console.warn("[guspira] could not import preset:", e);
          if (opts.onImportError) opts.onImportError(e);
        });

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.hidden = true;
    fileInput.accept = "application/json,.json";
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      if (file) importFile(file);
      fileInput.value = "";
    });

    created.files = this.addButtons(null, [
      {
        label: "Export",
        title: "Download the current values as JSON",
        onClick: () => store.exportFile(name().trim() || selected() || "preset"),
      },
      { label: "Import", title: "Load values from a JSON file", onClick: () => fileInput.click() },
    ]);
    created.files.row.append(fileInput);

    created.refresh = refresh;
    return created;
  }
}

export { GUI, Controller, Section, Tab };
export default GUI;
