// Keyboard shortcuts, with the guards these always end up needing: a shortcut must not
// fire while the user is typing in a field, and a bare letter must not steal Ctrl/Cmd
// combos (the "C to record" binding vs Ctrl+C to copy).

const TYPING_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA"]);

function isTyping(target) {
  if (!target) return false;
  if (TYPING_TAGS.has(target.tagName)) return true;
  return target.isContentEditable === true;
}

// `code` is a KeyboardEvent.code ("KeyR", "Space", "ArrowUp"). Returns an unbind function.
export function bindKey(code, fn, opts = {}) {
  const {
    ctrl = false,
    shift = false,
    alt = false,
    meta = false,
    allowWhileTyping = false,
    target = window,
    preventDefault = false,
  } = opts;

  const handler = (e) => {
    if (e.code !== code) return;
    if (e.ctrlKey !== ctrl || e.shiftKey !== shift || e.altKey !== alt) return;
    if (e.metaKey !== meta) return;
    if (!allowWhileTyping && isTyping(e.target)) return;
    if (preventDefault) e.preventDefault();
    fn(e);
  };

  target.addEventListener("keydown", handler);
  return () => target.removeEventListener("keydown", handler);
}
