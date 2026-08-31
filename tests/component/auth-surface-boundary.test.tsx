import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthSurfaceBoundary } from "../../src/client/components/auth/AuthSurfaceBoundary";

function Exploding(): never {
  throw new Error("chunk https://cdn.example.test/assets/AuthSurface-abc123.js failed to load");
}

describe("authentication surface error boundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders its children when the surface loads", () => {
    render(
      <AuthSurfaceBoundary>
        <p>Sign-in surface</p>
      </AuthSurfaceBoundary>,
    );

    expect(screen.getByText("Sign-in surface")).toBeInTheDocument();
  });

  it("offers a bounded recovery instead of a permanent loading screen", () => {
    render(
      <AuthSurfaceBoundary>
        <Exploding />
      </AuthSurfaceBoundary>,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "The sign-in screen could not be loaded. Check your connection and reload the page.",
    );
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  it("never renders the underlying asset path or error text", () => {
    render(
      <AuthSurfaceBoundary>
        <Exploding />
      </AuthSurfaceBoundary>,
    );

    const text = document.body.textContent ?? "";
    expect(text).not.toContain("AuthSurface-abc123.js");
    expect(text).not.toContain("cdn.example.test");
    expect(text).not.toContain("failed to load");
    expect(text).not.toContain("Error");
  });
});
