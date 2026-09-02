import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useTheme } from "../../src/client/hooks/useTheme";

type MediaListener = (event: { matches: boolean }) => void;

let listeners: MediaListener[] = [];
let systemPrefersDark = false;

function installMatchMedia() {
  listeners = [];
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      get matches() {
        return query.includes("dark") && systemPrefersDark;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: MediaListener) => listeners.push(listener),
      removeEventListener: (_type: string, listener: MediaListener) => {
        listeners = listeners.filter((item) => item !== listener);
      },
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

function ThemeHarness() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <p data-testid="current">{theme}</p>
      {(["system", "light", "dark"] as const).map((option) => (
        <button key={option} type="button" onClick={() => setTheme(option)}>
          {option}
        </button>
      ))}
    </div>
  );
}

describe("theme preference", () => {
  beforeEach(() => {
    systemPrefersDark = false;
    installMatchMedia();
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to the system preference", () => {
    render(<ThemeHarness />);
    expect(screen.getByTestId("current")).toHaveTextContent("system");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("follows the system preference when it is dark", () => {
    systemPrefersDark = true;
    render(<ThemeHarness />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("applies an explicit choice and stores only the preference", async () => {
    const user = userEvent.setup();
    render(<ThemeHarness />);

    await user.click(screen.getByRole("button", { name: "dark" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(window.localStorage.getItem("cognaxis_theme_preference")).toBe("dark");

    await user.click(screen.getByRole("button", { name: "light" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(window.localStorage.getItem("cognaxis_theme_preference")).toBe("light");

    expect(Object.keys({ ...window.localStorage })).toEqual(["cognaxis_theme_preference"]);
  });

  it("restores a stored preference on the next visit", () => {
    window.localStorage.setItem("cognaxis_theme_preference", "dark");
    render(<ThemeHarness />);

    expect(screen.getByTestId("current")).toHaveTextContent("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("reacts to a system theme change only while following the system", async () => {
    const user = userEvent.setup();
    render(<ThemeHarness />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    systemPrefersDark = true;
    act(() => {
      for (const listener of listeners) listener({ matches: true });
    });
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    await user.click(screen.getByRole("button", { name: "light" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    // An explicit choice must not be overridden by a later system change.
    act(() => {
      for (const listener of listeners) listener({ matches: true });
    });
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("ignores an unrecognised stored value", () => {
    window.localStorage.setItem("cognaxis_theme_preference", "neon");
    render(<ThemeHarness />);

    expect(screen.getByTestId("current")).toHaveTextContent("system");
  });

  it("keeps working when storage is unavailable", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    render(<ThemeHarness />);
    await user.click(screen.getByRole("button", { name: "dark" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
