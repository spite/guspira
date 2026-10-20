// Keyboard shortcuts, with the guards these always end up needing: a shortcut must not
// fire while the user is typing in a field, a key the focused control answers itself must
// not also run a binding (Space on a button, an arrow on a slider), and a bare letter must
// not steal Ctrl/Cmd combos (the "C to record" binding vs Ctrl+C to copy).

const TYPING_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA"]);

// The keys that press a button, and the ones that move within a slider, a pad or a group.
const PRESSES = new Set(["Space", "Enter", "NumpadEnter"]);
const MOVES = new Set([
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown",
]);
const PRESSABLE = "button, summary, a[href], [role=button], [role=tab], [role=radio]";
const MOVABLE = "range-slider, [role=slider], [role=application], [role=radiogroup], [role=tablist]";

// True when the element the key was pressed on will act on it.
function claims(target, code) {
  if (!target || typeof target.closest !== "function") return false;
  if (TYPING_TAGS.has(target.tagName) || target.isContentEditable === true) return true;
  if (PRESSES.has(code)) return target.closest(PRESSABLE) !== null;
  if (MOVES.has(code)) return target.closest(MOVABLE) !== null;
  return false;
}

// `code` is a KeyboardEvent.code ("KeyR", "Space", "ArrowUp"). Returns an unbind function.
// A held key fires once unless `repeat` is set.
export function bindKey(code, fn, opts = {}) {
  const {
    ctrl = false,
    shift = false,
    alt = false,
    meta = false,
    allowWhileTyping = false,
    repeat = false,
    target = window,
    preventDefault = false,
  } = opts;

  const handler = (e) => {
    if (e.code !== code) return;
    if (e.ctrlKey !== ctrl || e.shiftKey !== shift || e.altKey !== alt) return;
    if (e.metaKey !== meta) return;
    if (e.repeat && !repeat) return;
    if (!allowWhileTyping && claims(e.target, code)) return;
    if (preventDefault) e.preventDefault();
    fn(e);
  };

  target.addEventListener("keydown", handler);
  return () => target.removeEventListener("keydown", handler);
}
