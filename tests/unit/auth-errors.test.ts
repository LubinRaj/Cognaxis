import { describe, expect, it } from "vitest";
import {
  getFirebaseAuthErrorCode,
  getFirebaseAuthErrorMessage,
  shouldFallbackToRedirect,
} from "../../src/client/lib/auth-errors.js";

describe("Firebase authentication error handling", () => {
  it("returns only the structured Firebase error code", () => {
    expect(getFirebaseAuthErrorCode({ code: "auth/network-request-failed", secret: "ignore" })).toBe(
      "auth/network-request-failed",
    );
    expect(getFirebaseAuthErrorCode(new Error("internal details"))).toBeNull();
  });

  it("maps known failures to safe user-facing messages", () => {
    expect(getFirebaseAuthErrorMessage({ code: "auth/popup-closed-by-user" })).toBe(
      "Sign-in was cancelled before it completed.",
    );
    expect(getFirebaseAuthErrorMessage({ code: "auth/unauthorized-domain" })).not.toContain(
      "project",
    );
  });

  it("does not expose unknown error details", () => {
    const message = getFirebaseAuthErrorMessage({ code: "auth/unknown", message: "private detail" });
    expect(message).toBe("Google sign-in could not be completed. Please try again.");
    expect(message).not.toContain("private detail");
  });

  it("uses redirect when the popup runtime cannot complete safely", () => {
    expect(shouldFallbackToRedirect({ code: "auth/popup-blocked" })).toBe(true);
    expect(
      shouldFallbackToRedirect({ code: "auth/operation-not-supported-in-this-environment" }),
    ).toBe(true);
    expect(shouldFallbackToRedirect({ code: "auth/internal-error" })).toBe(true);
    expect(shouldFallbackToRedirect({ code: "auth/popup-closed-by-user" })).toBe(false);
    expect(shouldFallbackToRedirect({ code: "auth/unauthorized-domain" })).toBe(false);
  });
});
