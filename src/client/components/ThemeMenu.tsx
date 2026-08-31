import { useEffect, useRef, useState } from "react";
import { useTheme, type ThemeOption } from "../hooks/useTheme";
import { MaterialIcon, type MaterialIconName } from "./MaterialIcon";

const themeOptions: { value: ThemeOption; label: string; icon: MaterialIconName }[] = [
  { value: "system", label: "System", icon: "desktop_windows" },
  { value: "light", label: "Light", icon: "light_mode" },
  { value: "dark", label: "Dark", icon: "dark_mode" },
];

export function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const current = themeOptions.find((option) => option.value === theme) ?? themeOptions[0];

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="text-on-surface-variant hover:bg-surface-container-high focus-visible:outline-primary flex h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 sm:px-4"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Theme: ${current.label}. Change theme`}
      >
        <MaterialIcon name={current.icon} size={20} />
        <span className="hidden text-sm font-medium sm:inline-block">{current.label}</span>
        <span className="hidden sm:inline-block" aria-hidden="true">
          <MaterialIcon name="arrow_drop_down" size={18} />
        </span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Theme"
          className="border-outline-variant bg-surface-container absolute right-0 z-50 mt-2 w-48 origin-top-right rounded-2xl border p-2 shadow-lg"
        >
          {themeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={theme === option.value}
              onClick={() => {
                setTheme(option.value);
                setOpen(false);
                triggerRef.current?.focus();
              }}
              className={`focus-visible:outline-primary flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 ${
                theme === option.value
                  ? "bg-secondary-container text-on-secondary-container"
                  : "text-on-surface hover:bg-surface-container-high"
              }`}
            >
              <MaterialIcon name={option.icon} size={20} />
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
