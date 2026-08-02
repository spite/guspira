// The light/dark switch every page carries. Without a stored choice the pages follow the
// system, which css/site.css already handles on its own — this only exists to let a reader
// override it, and to remember that they did.

const KEY = "guspira-theme";

const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

const systemPrefersLight = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches;

const current = () =>
  document.documentElement.dataset.theme || (systemPrefersLight() ? "light" : "dark");

// Only an explicit choice is written to the root; leaving it off is what lets the media query
// in the stylesheet decide.
function apply(theme) {
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  // Anything that paints its own pixels — a canvas diagram — cannot pick this up from CSS.
  dispatchEvent(new CustomEvent("guspira:theme", { detail: current() }));
}

const SUN = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>`;
const MOON = `<svg viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>`;

function mount() {
  const button = document.createElement("button");
  button.className = "theme-toggle";
  button.type = "button";

  const label = () => {
    const next = current() === "dark" ? "light" : "dark";
    button.innerHTML = current() === "dark" ? SUN : MOON;
    button.title = `Switch to ${next} mode`;
    button.setAttribute("aria-label", button.title);
  };

  button.addEventListener("click", () => {
    const next = current() === "dark" ? "light" : "dark";
    apply(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {}
    label();
  });

  label();
  document.body.append(button);

  // Follow the system while no choice has been made.
  if (typeof matchMedia === "function") {
    matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => {
      if (!read()) label();
    });
  }
}

apply(read());

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
else mount();
