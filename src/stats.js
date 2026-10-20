// Performance counters, after rStats — the same ideas, wired to signals.
//
// A counter is a signal. `stats.timer("render")` hands back something you read like any other
// signal and pass to any control, with the measuring methods hanging off it the way `tweened`
// carries its `.target`. Nothing here touches the DOM: the panel renders these, but a sketch
// with no panel can still measure itself, and a test can check the arithmetic in node.
//
//   const stats = createStats();
//   const frame  = stats.timer("frame");
//   const render = stats.timer("render");
//   const fps    = stats.fps();
//
//   function loop() {
//     frame.start();
//     render.start();
//     draw();
//     render.end();
//     frame.end();
//     fps.tick();
//     stats.flush();          // one batched write per frame
//     requestAnimationFrame(loop);
//   }

import { signal, batch } from "./reactive.js";

const defaultClock =
  typeof performance !== "undefined" && performance.now
    ? () => performance.now()
    : () => Date.now();

// Averaging is a window, not a flag: `average: 500` reports the mean of the last half second.
// A raw per-frame number is the right thing for a graph, where the spikes are the information,
// and the wrong thing for a text readout, where it is unreadable. So it is per counter.
function createAverager(window, clock) {
  let sum = 0;
  let count = 0;
  let since = clock();
  let published = 0;

  return {
    push(value) {
      sum += value;
      count += 1;
    },
    // Holds the last published figure until the window is up, so a readout is legible instead
    // of flickering through every frame's value.
    read(latest) {
      if (!window) return latest;
      if (clock() - since >= window) {
        published = count ? sum / count : latest;
        sum = 0;
        count = 0;
        since = clock();
      }
      return published;
    },
  };
}

export function createStats({ clock = defaultClock } = {}) {
  const counters = [];

  // Every counter shares the same shape: a signal, a pending value collected during the frame,
  // and an optional averaging window applied when it is published.
  function make(name, initial, { average = 0 } = {}) {
    const sig = signal(initial);
    const averager = createAverager(average, clock);
    const counter = {
      name,
      signal: sig,
      averager,
      // Left for flush() to write, so a frame's worth of measuring costs one signal write and
      // one pass of effects rather than one per counter per call.
      pending: initial,
      // Set while a total is being built up with add(), for flush() to average once.
      accumulating: false,
    };
    counters.push(counter);
    return counter;
  }

  // Attaches the measuring methods to the signal itself, so the thing you pass to a control and
  // the thing you measure with are the same object — the way a tweened signal carries its
  // `.target`.
  //
  // None of these names may collide with the signal's own API (set, update, peek, target). A
  // counter that called its "record a measurement" method `set` would overwrite the signal's
  // write method, and flush() would then quietly measure instead of publishing — which is
  // exactly what happened the first time this was written. Hence `sample`.
  const RESERVED = ["set", "update", "peek", "target", "isSignal"];

  function expose(sig, counter, methods) {
    for (const name of Object.keys(methods)) {
      if (RESERVED.includes(name)) {
        throw new Error(`[guspira] a counter method may not be called "${name}" — it would shadow the signal's own`);
      }
    }
    Object.assign(sig, methods, { counterName: counter.name, isCounter: true });
    return sig;
  }

  return {
    // Milliseconds between start() and end(). tick() is end-then-start, for measuring the gap
    // between successive calls — a whole frame, say, without bracketing the entire loop.
    timer(name, options) {
      const counter = make(name, 0, options);
      let startedAt = null;

      return expose(counter.signal, counter, {
        start() {
          startedAt = clock();
          return this;
        },
        end() {
          if (startedAt !== null) {
            counter.pending = clock() - startedAt;
            counter.averager.push(counter.pending);
            startedAt = null;
          }
          return this;
        },
        tick() {
          this.end();
          return this.start();
        },
      });
    },

    // Frames per second over a rolling window. Counting inside a window rather than inverting
    // one frame's duration, because a single long frame should dent the figure, not replace it.
    fps({ window = 1000, ...options } = {}) {
      const counter = make("fps", 0, options);
      let frames = 0;
      let since = clock();

      return expose(counter.signal, counter, {
        tick() {
          frames += 1;
          const elapsed = clock() - since;
          if (elapsed >= window) {
            counter.pending = (frames * 1000) / elapsed;
            counter.averager.push(counter.pending);
            frames = 0;
            since = clock();
          }
          return this;
        },
      });
    },

    // Anything you count rather than time: draw calls, particles, triangles. This is also the
    // seam for numbers pulled off something else — a WebGL query, a renderer's own info object.
    counter(name, options) {
      const counter = make(name, 0, options);

      return expose(counter.signal, counter, {
        // `sample`, not `set`: see RESERVED above.
        sample(value) {
          counter.pending = value;
          counter.accumulating = false;
          counter.averager.push(value);
          return this;
        },
        add(amount = 1) {
          counter.pending += amount;
          counter.accumulating = true;
          return this;
        },
        // Counters that accumulate within a frame have to be cleared at the top of the next.
        clear() {
          counter.pending = 0;
          counter.accumulating = true;
          return this;
        },
      });
    },

    // Publishes every counter at once. One batch means one pass of effects per frame however
    // many counters there are, which matters for the thing whose job is to stay cheap.
    flush() {
      batch(() => {
        for (const counter of counters) {
          if (counter.accumulating) {
            counter.averager.push(counter.pending);
            counter.accumulating = false;
          }
          counter.signal.set(counter.averager.read(counter.pending));
        }
      });
    },

    // Every counter made here, for a panel that wants to list them without being told twice.
    counters() {
      return counters.map((counter) => counter.signal);
    },
  };
}
