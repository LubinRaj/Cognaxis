import { describe, expect, it } from "vitest";
import {
  authStates,
  initialAuthState,
  isAuthScreen,
  reduceAuthState,
  type AuthEvent,
  type AuthState,
} from "../../src/client/auth/auth-state.js";

const everyState: AuthState[] = [...authStates];

const everyEvent: AuthEvent[] = [
  { type: "CONFIGURATION_MISSING" },
  { type: "NO_USER" },
  { type: "VERIFIED_USER" },
  { type: "UNVERIFIED_USER" },
  { type: "OPEN_SIGN_IN" },
  { type: "OPEN_SIGN_UP" },
  { type: "OPEN_FORGOT_PASSWORD" },
  { type: "RESET_EMAIL_SENT" },
  { type: "BACK_TO_SIGN_IN" },
  { type: "BACK_TO_LANDING" },
  { type: "SESSION_EXPIRED" },
  { type: "BOOTSTRAP_RETRY" },
];

describe("authentication state machine", () => {
  it("starts in the bootstrapping state", () => {
    expect(initialAuthState).toBe("BOOTSTRAPPING");
  });

  it("resolves bootstrap outcomes", () => {
    expect(reduceAuthState("BOOTSTRAPPING", { type: "CONFIGURATION_MISSING" })).toBe(
      "CONFIGURATION_MISSING",
    );
    expect(reduceAuthState("BOOTSTRAPPING", { type: "NO_USER" })).toBe("SIGNED_OUT_LANDING");
    expect(reduceAuthState("BOOTSTRAPPING", { type: "VERIFIED_USER" })).toBe("AUTHENTICATED");
    expect(reduceAuthState("BOOTSTRAPPING", { type: "UNVERIFIED_USER" })).toBe("AUTH_VERIFY_EMAIL");
  });

  it("sends a failed bootstrap to the recoverable session-expired screen", () => {
    expect(reduceAuthState("BOOTSTRAPPING", { type: "SESSION_EXPIRED" })).toBe(
      "AUTH_SESSION_EXPIRED",
    );
  });

  it("moves between the authentication screens", () => {
    expect(reduceAuthState("SIGNED_OUT_LANDING", { type: "OPEN_SIGN_IN" })).toBe("AUTH_SIGN_IN");
    expect(reduceAuthState("AUTH_SIGN_IN", { type: "OPEN_SIGN_UP" })).toBe("AUTH_SIGN_UP");
    expect(reduceAuthState("AUTH_SIGN_IN", { type: "OPEN_FORGOT_PASSWORD" })).toBe(
      "AUTH_FORGOT_PASSWORD",
    );
    expect(reduceAuthState("AUTH_SIGN_UP", { type: "BACK_TO_SIGN_IN" })).toBe("AUTH_SIGN_IN");
    expect(reduceAuthState("AUTH_FORGOT_PASSWORD", { type: "RESET_EMAIL_SENT" })).toBe(
      "AUTH_RESET_EMAIL_SENT",
    );
    expect(reduceAuthState("AUTH_RESET_EMAIL_SENT", { type: "BACK_TO_SIGN_IN" })).toBe(
      "AUTH_SIGN_IN",
    );
  });

  it("completes authentication from any authentication screen", () => {
    expect(reduceAuthState("AUTH_SIGN_IN", { type: "VERIFIED_USER" })).toBe("AUTHENTICATED");
    expect(reduceAuthState("AUTH_SIGN_UP", { type: "VERIFIED_USER" })).toBe("AUTHENTICATED");
    expect(reduceAuthState("AUTH_VERIFY_EMAIL", { type: "VERIFIED_USER" })).toBe("AUTHENTICATED");
    expect(reduceAuthState("AUTH_SESSION_EXPIRED", { type: "VERIFIED_USER" })).toBe("AUTHENTICATED");
  });

  it("routes a newly created unverified account to the verification screen", () => {
    expect(reduceAuthState("AUTH_SIGN_UP", { type: "UNVERIFIED_USER" })).toBe("AUTH_VERIFY_EMAIL");
    expect(reduceAuthState("AUTH_SIGN_IN", { type: "UNVERIFIED_USER" })).toBe("AUTH_VERIFY_EMAIL");
    expect(reduceAuthState("AUTHENTICATED", { type: "UNVERIFIED_USER" })).toBe("AUTH_VERIFY_EMAIL");
  });

  it("returns an authenticated user to the landing page after sign-out", () => {
    expect(reduceAuthState("AUTHENTICATED", { type: "NO_USER" })).toBe("SIGNED_OUT_LANDING");
  });

  it("returns an unverified user to the sign-in screen after sign-out", () => {
    expect(reduceAuthState("AUTH_VERIFY_EMAIL", { type: "NO_USER" })).toBe("AUTH_SIGN_IN");
  });

  it("keeps the user on the chosen authentication screen while signed out", () => {
    expect(reduceAuthState("AUTH_SIGN_IN", { type: "NO_USER" })).toBe("AUTH_SIGN_IN");
    expect(reduceAuthState("AUTH_SIGN_UP", { type: "NO_USER" })).toBe("AUTH_SIGN_UP");
    expect(reduceAuthState("AUTH_FORGOT_PASSWORD", { type: "NO_USER" })).toBe(
      "AUTH_FORGOT_PASSWORD",
    );
    expect(reduceAuthState("AUTH_RESET_EMAIL_SENT", { type: "NO_USER" })).toBe(
      "AUTH_RESET_EMAIL_SENT",
    );
    expect(reduceAuthState("SIGNED_OUT_LANDING", { type: "NO_USER" })).toBe("SIGNED_OUT_LANDING");
  });

  it("keeps the session-expired screen visible while the session is cleared", () => {
    expect(reduceAuthState("AUTHENTICATED", { type: "SESSION_EXPIRED" })).toBe(
      "AUTH_SESSION_EXPIRED",
    );
    expect(reduceAuthState("AUTH_SESSION_EXPIRED", { type: "NO_USER" })).toBe(
      "AUTH_SESSION_EXPIRED",
    );
    expect(reduceAuthState("AUTH_SESSION_EXPIRED", { type: "OPEN_SIGN_IN" })).toBe("AUTH_SIGN_IN");
    expect(reduceAuthState("AUTH_SESSION_EXPIRED", { type: "BACK_TO_LANDING" })).toBe(
      "SIGNED_OUT_LANDING",
    );
  });

  it("allows returning to the public landing page from every authentication screen", () => {
    for (const state of everyState) {
      const next = reduceAuthState(state, { type: "BACK_TO_LANDING" });
      if (isAuthScreen(state) || state === "SIGNED_OUT_LANDING") {
        expect(next).toBe("SIGNED_OUT_LANDING");
      } else {
        expect(next).toBe(state);
      }
    }
  });

  it("treats a missing configuration as terminal", () => {
    for (const event of everyEvent) {
      expect(reduceAuthState("CONFIGURATION_MISSING", event)).toBe("CONFIGURATION_MISSING");
    }
  });

  it("never leaves the authenticated workspace for a presentation-only event", () => {
    expect(reduceAuthState("AUTHENTICATED", { type: "OPEN_SIGN_IN" })).toBe("AUTHENTICATED");
    expect(reduceAuthState("AUTHENTICATED", { type: "OPEN_SIGN_UP" })).toBe("AUTHENTICATED");
    expect(reduceAuthState("AUTHENTICATED", { type: "OPEN_FORGOT_PASSWORD" })).toBe("AUTHENTICATED");
    expect(reduceAuthState("AUTHENTICATED", { type: "RESET_EMAIL_SENT" })).toBe("AUTHENTICATED");
    expect(reduceAuthState("AUTHENTICATED", { type: "BACK_TO_SIGN_IN" })).toBe("AUTHENTICATED");
    expect(reduceAuthState("AUTHENTICATED", { type: "BACK_TO_LANDING" })).toBe("AUTHENTICATED");
  });

  it("restarts a stalled bootstrap only from the bootstrapping state", () => {
    expect(reduceAuthState("BOOTSTRAPPING", { type: "BOOTSTRAP_RETRY" })).toBe("BOOTSTRAPPING");
    expect(reduceAuthState("AUTHENTICATED", { type: "BOOTSTRAP_RETRY" })).toBe("AUTHENTICATED");
    expect(reduceAuthState("AUTH_SIGN_IN", { type: "BOOTSTRAP_RETRY" })).toBe("AUTH_SIGN_IN");
  });

  it("rejects every undefined transition by keeping the current state", () => {
    for (const state of everyState) {
      for (const event of everyEvent) {
        const next = reduceAuthState(state, event);
        expect(everyState).toContain(next);
      }
    }

    expect(reduceAuthState("SIGNED_OUT_LANDING", { type: "OPEN_SIGN_UP" })).toBe(
      "SIGNED_OUT_LANDING",
    );
    expect(reduceAuthState("SIGNED_OUT_LANDING", { type: "RESET_EMAIL_SENT" })).toBe(
      "SIGNED_OUT_LANDING",
    );
    expect(reduceAuthState("AUTH_FORGOT_PASSWORD", { type: "OPEN_SIGN_UP" })).toBe(
      "AUTH_FORGOT_PASSWORD",
    );
    expect(reduceAuthState("BOOTSTRAPPING", { type: "OPEN_SIGN_IN" })).toBe("BOOTSTRAPPING");
  });

  it("identifies which states render the focused authentication surface", () => {
    expect(isAuthScreen("AUTH_SIGN_IN")).toBe(true);
    expect(isAuthScreen("AUTH_SIGN_UP")).toBe(true);
    expect(isAuthScreen("AUTH_FORGOT_PASSWORD")).toBe(true);
    expect(isAuthScreen("AUTH_RESET_EMAIL_SENT")).toBe(true);
    expect(isAuthScreen("AUTH_VERIFY_EMAIL")).toBe(true);
    expect(isAuthScreen("AUTH_SESSION_EXPIRED")).toBe(true);
    expect(isAuthScreen("SIGNED_OUT_LANDING")).toBe(false);
    expect(isAuthScreen("AUTHENTICATED")).toBe(false);
    expect(isAuthScreen("BOOTSTRAPPING")).toBe(false);
    expect(isAuthScreen("CONFIGURATION_MISSING")).toBe(false);
  });

  it("only reaches the authenticated workspace through a verified identity event", () => {
    for (const state of everyState) {
      for (const event of everyEvent) {
        if (reduceAuthState(state, event) === "AUTHENTICATED" && state !== "AUTHENTICATED") {
          expect(event.type).toBe("VERIFIED_USER");
        }
      }
    }
  });
});
