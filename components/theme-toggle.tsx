"use client";

import { useEffect, useState } from "react";

import { applyTheme, currentTheme, type Theme } from "@/lib/theme";

/**
 * The light/dark switch used on every page: a round button showing a sun in
 * dark mode (tap for light) and a moon in light mode (tap for dark).
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    // The pre-paint script in the layout may have picked the saved theme.
    const syncTimer = setTimeout(() => setTheme(currentTheme()), 0);
    return () => clearTimeout(syncTimer);
  }, []);

  const next = theme === "dark" ? "light" : "dark";
  const label = `Switch to ${next} theme`;
  return (
    <button
      className={`round-button theme-toggle ${className}`.trim()}
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2" />
        <path d="M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
      </g>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M20.3 14.6A8.6 8.6 0 0 1 9.4 3.7a.6.6 0 0 0-.8-.7A9.4 9.4 0 1 0 21 15.4a.6.6 0 0 0-.7-.8Z"
      />
    </svg>
  );
}
