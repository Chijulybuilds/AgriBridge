import { Head, Html, Main, NextScript } from "next/document";

/**
 * Applies the saved theme (or the system's) before the first paint, so people
 * who use dark mode never see the page flash light. lib/theme.tsx takes over
 * once the app has loaded.
 */
const THEME_SCRIPT = `(function () {
  try {
    var theme = localStorage.getItem("agribridge_theme");
    if (theme !== "light" && theme !== "dark") {
      theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
})();`;

export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
