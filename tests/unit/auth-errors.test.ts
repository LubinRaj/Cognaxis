import { describe, expect, it } from "vitest";
import {
  authMessages,
  classifyAuthFailure,
  getFirebaseAuthErrorCode,
  getFirebaseAuthErrorMessage,
  isTerminalSessionFailure,
  maskEmail,
  shouldFallbackToRedirect,
} from "../../src/client/auth/auth-errors.js";

const enumerationSensitiveCodes = [
  "auth/user-not-found",
  "auth/wrong-password",
  "auth/invalid-credential",
  "auth/invalid-login-credentials",
  "auth/user-disabled",
];

describe("Firebase authentication error handling", () => {
  it("returns only the structured Firebase error code", () => {
    expect(getFirebaseAuthErrorCode({ code: "auth/network-request-failed", secret: "ignore" })).toBe(
      "auth/network-request-failed",
    );
    expect(getFirebaseAuthErrorCode(new Error("internal details"))).toBeNull();
    expect(getFirebaseAuthErrorCode(null)).toBeNull();
    expect(getFirebaseAuthErrorCode("auth/user-not-found")).toBeNull();
    expect(getFirebaseAuthErrorCode({ code: 42 })).toBeNull();
  });

  it("uses one identical message for every credential failure", () => {
    const messages = enumerationSensitiveCodes.map((code) =>
      getFirebaseAuthErrorMessage({ code }),
    );

    expect(new Set(messages).size).toBe(1);
    expect(messages[0]).toBe(authMessages.invalidCredentials);
    expect(messages[0]).toBe("Email or password is incorrect.");
  });

  it("never reveals whether an email address is registered", () => {
    const codes = [
      ...enumerationSensitiveCodes,
      "auth/email-already-in-use",
      "auth/account-exists-with-different-credential",
      "auth/credential-already-in-use",
    ];

    for (const code of codes) {
      const message = getFirebaseAuthErrorMessage({ code });
      expect(message.toLowerCase()).not.toContain("no account");
      expect(message.toLowerCase()).not.toContain("account already exists");
      expect(message.toLowerCase()).not.toContain("already registered");
      expect(message.toLowerCase()).not.toContain("incorrect password");
      expect(message.toLowerCase()).not.toContain("not found");
    }
  });

  it("maps the mandated conditions to their exact user-facing copy", () => {
    expect(getFirebaseAuthErrorMessage({ code: "auth/network-request-failed" })).toBe(
      "We couldn't reach the sign-in service. Check your connection and try again.",
    );
    expect(getFirebaseAuthErrorMessage({ code: "auth/too-many-requests" })).toBe(
      "Too many attempts. Wait a moment and try again.",
    );
    expect(getFirebaseAuthErrorMessage({ code: "auth/unauthorized-domain" })).toBe(
      "Sign-in is not configured for this web address.",
    );
    expect(getFirebaseAuthErrorMessage({ code: "auth/popup-closed-by-user" })).toBe(
      "Sign-in was cancelled before it completed.",
    );
    expect(getFirebaseAuthErrorMessage({ code: "auth/user-token-expired" })).toBe(
      "Your session could not be verified. Please sign in again.",
    );
    expect(authMessages.emailNotVerified).toBe(
      "Verify your email before opening your private journal.",
    );
    expect(authMessages.resetRequestAccepted).toBe(
      "If an account is available, reset instructions have been sent.",
    );
    expect(getFirebaseAuthErrorMessage({ code: "auth/unknown-code" })).toBe(
      "Sign-in could not be completed. Please try again.",
    );
  });

  it("does not leak provider payloads, project identifiers, or raw messages", () => {
    const message = getFirebaseAuthErrorMessage({
      code: "auth/internal-error",
      message: "Firebase: HTTP Cloud Function returned an error project cognaxis-prod token abc.def",
      customData: { email: "person@example.test" },
    });

    expect(message).toBe("Sign-in could not be completed. Please try again.");
    expect(message).not.toContain("cognaxis");
    expect(message).not.toContain("example.test");
    expect(message).not.toContain("abc.def");
  });

  it("keeps every user-facing message free of markup", () => {
    for (const message of Object.values(authMessages)) {
      expect(message).not.toMatch(/[<>]/);
      expect(message.length).toBeGreaterThan(0);
    }
  });

  it("uses redirect only when the popup runtime cannot complete safely", () => {
    expect(shouldFallbackToRedirect({ code: "auth/popup-blocked" })).toBe(true);
    expect(
      shouldFallbackToRedirect({ code: "auth/operation-not-supported-in-this-environment" }),
    ).toBe(true);
    expect(shouldFallbackToRedirect({ code: "auth/internal-error" })).toBe(true);
    expect(shouldFallbackToRedirect({ code: "auth/popup-closed-by-user" })).toBe(false);
    expect(shouldFallbackToRedirect({ code: "auth/unauthorized-domain" })).toBe(false);
    expect(shouldFallbackToRedirect(new Error("boom"))).toBe(false);
  });

  it("recognises terminal session failures that must force reauthentication", () => {
    expect(isTerminalSessionFailure({ code: "auth/user-token-expired" })).toBe(true);
    expect(isTerminalSessionFailure({ code: "auth/invalid-user-token" })).toBe(true);
    expect(isTerminalSessionFailure({ code: "auth/user-disabled" })).toBe(true);
    expect(isTerminalSessionFailure({ code: "auth/user-signed-out" })).toBe(true);
    expect(isTerminalSessionFailure({ code: "auth/network-request-failed" })).toBe(false);
    expect(isTerminalSessionFailure({ code: "auth/too-many-requests" })).toBe(false);
  });

  it("classifies failures for telemetry without carrying personal data", () => {
    expect(classifyAuthFailure({ code: "auth/invalid-credential" })).toBe("invalid_credentials");
    expect(classifyAuthFailure({ code: "auth/user-not-found" })).toBe("invalid_credentials");
    expect(classifyAuthFailure({ code: "auth/network-request-failed" })).toBe("network");
    expect(classifyAuthFailure({ code: "auth/too-many-requests" })).toBe("rate_limited");
    expect(classifyAuthFailure({ code: "auth/unauthorized-domain" })).toBe("configuration");
    expect(classifyAuthFailure({ code: "auth/popup-closed-by-user" })).toBe("cancelled");
    expect(classifyAuthFailure({ code: "auth/user-token-expired" })).toBe("session");
    expect(classifyAuthFailure(new Error("x"))).toBe("unknown");

    const category: string = classifyAuthFailure({
      code: "auth/invalid-credential",
      customData: { email: "person@example.test" },
    });
    expect(category).not.toContain("@");
  });

  it("masks an email address before it is ever displayed", () => {
    expect(maskEmail("lubin@example.test")).toBe("lu•••@example.test");
    expect(maskEmail("ab@example.test")).toBe("a•••@example.test");
    expect(maskEmail("a@example.test")).toBe("•••@example.test");
    expect(maskEmail("")).toBe("your email address");
    expect(maskEmail(undefined)).toBe("your email address");
    expect(maskEmail(null)).toBe("your email address");
    expect(maskEmail("not-an-email")).toBe("your email address");
  });

  it("never reproduces the full local part of an email address", () => {
    const masked = maskEmail("confidential.person@example.test");
    expect(masked).not.toContain("confidential.person");
    expect(masked).toBe("co•••@example.test");
  });
});
