export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "menoka-theme";

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** Switches every colour token at once and remembers the choice. */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode or blocked storage: the theme still applies this visit.
  }
}
