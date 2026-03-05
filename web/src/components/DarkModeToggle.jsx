import { useEffect } from "react";

function DarkModeToggle({ dark, onToggle }) {
  useEffect(() => {
    document.documentElement.setAttribute("data-dark", dark ? "true" : "false");
    localStorage.setItem("ikhlas-dark", dark ? "true" : "false");
  }, [dark]);

  return (
    <button
      className="dark-toggle"
      onClick={onToggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
    >
      {dark ? "☀" : "🌙"}
    </button>
  );
}

export default DarkModeToggle;
