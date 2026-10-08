import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";

import { useTheme } from "../lib/theme";

/** Light or dark. Both icons stay in place; the html data-theme attribute (set before paint) picks which shows. */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const label = `Switch to ${isDark ? "light" : "dark"} mode`;
  return (
    <button className="icon-btn theme-toggle" onClick={toggleTheme} title={label} aria-label={label}>
      <SunIcon className="icon-sun" aria-hidden="true" />
      <MoonIcon className="icon-moon" aria-hidden="true" />
    </button>
  );
}
