import { useState, useEffect } from "react";

export type ThemeOption = "system" | "light" | "dark";

function getInitialTheme(): ThemeOption {
  try {
    const saved = localStorage.getItem("cognaxis_theme_preference");
    if (saved === "light" || saved === "dark" || saved === "system") {
      return saved;
    }
  } catch {
    // Ignored
  }
  return "system";
}

function applyTheme(activeTheme: ThemeOption) {
  const isDark = activeTheme === "dark" || (activeTheme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeOption>(getInitialTheme);

  const setTheme = (newTheme: ThemeOption) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem("cognaxis_theme_preference", newTheme);
    } catch {
      // Ignored
    }
    applyTheme(newTheme);
  };

  useEffect(() => {
    applyTheme(theme);
    
    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => applyTheme("system");
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    }
  }, [theme]);

  return { theme, setTheme };
}
