import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";

import { useTheme } from "../lib/theme";

/** Light or dark. */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const label = `Switch to ${isDark ? "light" : "dark"} mode`;
  return (
    <button className="icon-btn" onClick={toggleTheme} title={label} aria-label={label}>
      {isDark ? <SunIcon style={{ width: 17, height: 17 }} /> : <MoonIcon style={{ width: 17, height: 17 }} />}
    </button>
  );
}
