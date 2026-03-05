import { useEffect, useState } from "react";

function getInitialDark() {
  const stored = localStorage.getItem("ikhlas-dark");
  if (stored !== null) return stored === "true";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function DarkModeToggle() {
  const [dark, setDark] = useState(getInitialDark);

  useEffect(() => {
    document.documentElement.setAttribute("data-dark", dark ? "true" : "false");
    localStorage.setItem("ikhlas-dark", dark ? "true" : "false");
  }, [dark]);

  return (
    <button
      className="dark-toggle"
      onClick={() => setDark((d) => !d)}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
    >
      {dark ? "☀" : "🌙"}
    </button>
  );
}

export default DarkModeToggle;
