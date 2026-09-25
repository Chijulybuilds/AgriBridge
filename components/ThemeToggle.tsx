"use client";

import { useTheme } from "../lib/theme";

const sun = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0 }}
  >
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const moon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0 }}
  >
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export function ThemeToggle({
  variant = "default",
}: {
  variant?: "default" | "minimal";
}) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  if (variant === "minimal") {
    return (
      <button
        onClick={toggleTheme}
        title={`Switch to ${isDark ? "light" : "dark"} mode`}
        aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          borderRadius: 8,
          border: "1px solid var(--border-light)",
          background: "var(--bg-secondary)",
          color: "var(--text-secondary)",
          cursor: "pointer",
          transition: "all 0.25s ease",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--bg-card-hover)";
          e.currentTarget.style.color = "var(--accent-green)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--bg-secondary)";
          e.currentTarget.style.color = "var(--text-secondary)";
        }}
      >
        {isDark ? sun : moon}
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px 6px 10px",
        borderRadius: 20,
        border: "1px solid var(--border-light)",
        background: "var(--bg-secondary)",
        cursor: "pointer",
        transition: "all 0.3s ease",
        position: "relative",
        overflow: "hidden",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--accent-green)";
        e.currentTarget.style.background = "var(--bg-card-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border-light)";
        e.currentTarget.style.background = "var(--bg-secondary)";
      }}
    >
      {/* Animated track */}
      <span
        style={{
          position: "relative",
          width: 36,
          height: 20,
          borderRadius: 12,
          background: isDark
            ? "linear-gradient(135deg, #1e3a5f, #2d5a8e)"
            : "linear-gradient(135deg, #f5d76e, #f9e9a0)",
          transition: "background 0.4s ease",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          padding: "0 2px",
        }}
      >
        {/* Sliding knob */}
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: isDark ? "#f0f4f8" : "#fff",
            boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
            transform: isDark ? "translateX(16px)" : "translateX(0)",
            transition: "transform 0.35s cubic-bezier(0.68, -0.55, 0.27, 1.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 10,
              lineHeight: 1,
              color: isDark ? "#1e3a5f" : "#f5a623",
              transition: "color 0.3s ease",
            }}
          >
            {isDark ? "🌙" : "☀️"}
          </span>
        </span>
      </span>

      {/* Label */}
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "var(--text-secondary)",
          transition: "color 0.3s ease",
        }}
      >
        {isDark ? "Dark" : "Light"}
      </span>
    </button>
  );
}