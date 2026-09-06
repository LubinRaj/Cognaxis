import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import axe from "axe-core";

vi.mock("../../src/client/lib/firebase", () => ({
  auth: null,
  firebaseApp: null,
  isFirebaseConfigured: false,
  missingFirebaseConfigKeys: ["VITE_FIREBASE_API_KEY", "VITE_FIREBASE_APP_ID"],
  createGoogleProvider: () => ({ providerId: "google.com" }),
}));

const { App } = await import("../../src/client/App");

describe("configuration-required screen", () => {
  it("fails closed instead of rendering any authentication or journal surface", async () => {
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Firebase configuration missing" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Welcome back" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Continue with Google/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start capturing" })).not.toBeInTheDocument();
  });

  it("names only the missing variables and never a value", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Firebase configuration missing" });

    expect(screen.getByText("VITE_FIREBASE_API_KEY")).toBeInTheDocument();
    expect(screen.getByText("VITE_FIREBASE_APP_ID")).toBeInTheDocument();

    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/AIza[0-9A-Za-z_-]{10,}/);
    expect(text).not.toMatch(/\d{10,}:web:[0-9a-f]+/);
    expect(text).not.toContain("firebaseapp.com");
    expect(text.toLowerCase()).not.toContain("project id");
  });

  it("offers no field that could receive a pasted secret", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Firebase configuration missing" });

    expect(document.querySelectorAll("input")).toHaveLength(0);
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
    expect(document.querySelectorAll("form")).toHaveLength(0);
  });

  it("reports no serious or critical accessibility violations", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Firebase configuration missing" });

    const results = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false }, "target-size": { enabled: false } },
      resultTypes: ["violations"],
    });
    const serious = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(serious.map((violation) => violation.id).join(", ")).toBe("");
  });
});
