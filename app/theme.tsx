"use client";

import { useEffect, useState } from "react";

export type Theme = "dark" | "light";
export const THEME_KEY = "extravaganza-theme";

/**
 * Runs before first paint, so a light-mode reader never sees a dark flash. It is
 * injected as a raw <script> in the document head; keep it small and dependency
 * free, because it runs before any bundle has loaded.
 */
export const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(!t){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="dark";}})();`;

export function ThemeToggle() {
  // Starts null so the button renders nothing until we have read the DOM, which
  // keeps the server markup and the first client render identical.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as Theme) ?? "dark");
  }, []);

  const flip = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private browsing, or storage disabled. The toggle still works for this
      // page view; it just will not be remembered.
    }
    setTheme(next);
  };

  const label = theme === "light" ? "Switch to dark" : "Switch to light";
  return (
    <button type="button" className="theme-toggle" onClick={flip} aria-label={label} title={label}>
      <span aria-hidden>{theme === "light" ? "◐" : "◑"}</span>
      <span className="tt-text">{theme === "light" ? "DARK" : "LIGHT"}</span>
    </button>
  );
}
