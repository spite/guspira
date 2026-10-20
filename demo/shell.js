// Shared bits of page furniture for the demos — a scrolling log and a JSON readout.
// Deliberately tiny: the demos should read as toolkit usage, not as a framework of their own.

export function logger(selector, limit = 60) {
  const el = document.querySelector(selector);
  const lines = [];
  return (message) => {
    lines.unshift(message);
    if (lines.length > limit) lines.length = limit;
    // As text: a line may carry a file name or a preset name somebody else chose.
    el.replaceChildren(
      ...lines.map((line, i) => {
        const row = document.createElement("div");
        if (i === 0) row.className = "new";
        row.textContent = line;
        return row;
      })
    );
  };
}

export function readout(selector) {
  const el = document.querySelector(selector);
  return (value) => {
    el.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  };
}

export const stamp = () => new Date().toLocaleTimeString([], { hour12: false });

// --- code highlighting -------------------------------------------------------------------
// A deliberately small JS tokenizer for the snippets on these pages. One pass, one regex:
// matching everything at once means a later rule can never fire inside an earlier rule's
// output, which a multi-pass replace with placeholders gets wrong the moment a placeholder
// contains a digit.
const TOKEN = new RegExp(
  [
    /(?<c>\/\/[^\n]*)/, // line comment
    /(?<s>"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)/, // string
    /(?<k>\b(?:const|let|var|function|return|import|export|from|new|class|if|else|for|of|in|await|async)\b)/,
    /(?<fn>\b[A-Za-z_$][\w$]*(?=\())/, // identifier being called
    /(?<n>\b\d+(?:\.\d+)?\b)/, // number
  ]
    .map((r) => r.source)
    .join("|"),
  "g"
);

const escapeHTML = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function highlight(el) {
  if (!el) return;
  const text = el.textContent;
  let out = "";
  let last = 0;

  for (const match of text.matchAll(TOKEN)) {
    const [cls, body] = Object.entries(match.groups).find(([, v]) => v !== undefined);
    out += escapeHTML(text.slice(last, match.index));
    out += `<span class="${cls}">${escapeHTML(body)}</span>`;
    last = match.index + match[0].length;
  }

  el.innerHTML = out + escapeHTML(text.slice(last));
}

export function highlightAll(root = document) {
  root.querySelectorAll("pre.code").forEach(highlight);
}

// Pages with static snippets get them highlighted without asking; pages that write a snippet
// at runtime call highlight() again afterwards.
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => highlightAll());
  } else {
    highlightAll();
  }
}
