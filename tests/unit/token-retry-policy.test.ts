import { describe, expect, it } from "vitest";
import {
  MAX_TOKEN_REFRESH_ATTEMPTS,
  isSessionTerminatingResponse,
  shouldForceTokenRefresh,
} from "../../src/client/auth/token-retry-policy.js";

const methods = ["GET", "POST", "DELETE"];

describe("bearer token refresh and retry policy", () => {
  it("allows exactly one forced refresh", () => {
    expect(MAX_TOKEN_REFRESH_ATTEMPTS).toBe(1);
  });

  it("forces a single refresh when authentication was rejected before the request ran", () => {
    for (const method of methods) {
      expect(
        shouldForceTokenRefresh({
          status: 401,
          errorCode: "UNAUTHENTICATED",
          completedRefreshes: 0,
          method,
        }),
      ).toBe(true);
    }
  });

  it("never retries more than once, so no refresh loop can form", () => {
    for (let completedRefreshes = 1; completedRefreshes < 6; completedRefreshes += 1) {
      expect(
        shouldForceTokenRefresh({
          status: 401,
          errorCode: "UNAUTHENTICATED",
          completedRefreshes,
          method: "GET",
        }),
      ).toBe(false);
    }
  });

  it("retries once when the verification claim may have just changed server-side", () => {
    // The verified-email middleware also rejects before any handler runs, and the claim really
    // does flip the moment the user follows the mail link, so one refreshed replay is safe and
    // avoids bouncing a freshly verified user back to the verify screen.
    for (const method of methods) {
      expect(
        shouldForceTokenRefresh({
          status: 403,
          errorCode: "EMAIL_VERIFICATION_REQUIRED",
          completedRefreshes: 0,
          method,
        }),
      ).toBe(true);
    }
    expect(
      shouldForceTokenRefresh({
        status: 403,
        errorCode: "EMAIL_VERIFICATION_REQUIRED",
        completedRefreshes: 1,
        method: "GET",
      }),
    ).toBe(false);
  });

  it("does not retry authorization or policy failures", () => {
    const nonRetryable = [
      { status: 401, errorCode: "RECENT_AUTH_REQUIRED" },
      { status: 403, errorCode: "FORBIDDEN" },
      { status: 403, errorCode: "ORIGIN_DENIED" },
      { status: 429, errorCode: "RATE_LIMITED" },
      { status: 400, errorCode: "INVALID_REQUEST" },
      { status: 400, errorCode: "INVALID_RESOURCE_ID" },
      { status: 404, errorCode: "NOT_FOUND" },
      { status: 500, errorCode: "INTERNAL_ERROR" },
      { status: 503, errorCode: "INTERNAL_ERROR" },
      { status: 200, errorCode: null },
    ];

    for (const failure of nonRetryable) {
      for (const method of methods) {
        expect(
          shouldForceTokenRefresh({ ...failure, completedRefreshes: 0, method }),
        ).toBe(false);
      }
    }
  });

  it("does not retry a 401 that carries an unrecognised or missing code", () => {
    expect(
      shouldForceTokenRefresh({
        status: 401,
        errorCode: null,
        completedRefreshes: 0,
        method: "GET",
      }),
    ).toBe(false);
    expect(
      shouldForceTokenRefresh({
        status: 401,
        errorCode: "SOMETHING_ELSE",
        completedRefreshes: 0,
        method: "POST",
      }),
    ).toBe(false);
  });

  it("ends the session only after the single refresh has already been spent", () => {
    expect(
      isSessionTerminatingResponse({
        status: 401,
        errorCode: "UNAUTHENTICATED",
        completedRefreshes: 0,
      }),
    ).toBe(false);
    expect(
      isSessionTerminatingResponse({
        status: 401,
        errorCode: "UNAUTHENTICATED",
        completedRefreshes: 1,
      }),
    ).toBe(true);
  });

  it("does not end the session for recoverable or unrelated failures", () => {
    expect(
      isSessionTerminatingResponse({
        status: 403,
        errorCode: "EMAIL_VERIFICATION_REQUIRED",
        completedRefreshes: 1,
      }),
    ).toBe(false);
    expect(
      isSessionTerminatingResponse({
        status: 429,
        errorCode: "RATE_LIMITED",
        completedRefreshes: 1,
      }),
    ).toBe(false);
    expect(
      isSessionTerminatingResponse({
        status: 500,
        errorCode: "INTERNAL_ERROR",
        completedRefreshes: 1,
      }),
    ).toBe(false);
  });

  it("treats a rejected recent-authentication check as terminal without a retry", () => {
    expect(
      isSessionTerminatingResponse({
        status: 401,
        errorCode: "RECENT_AUTH_REQUIRED",
        completedRefreshes: 0,
      }),
    ).toBe(true);
    expect(
      shouldForceTokenRefresh({
        status: 401,
        errorCode: "RECENT_AUTH_REQUIRED",
        completedRefreshes: 0,
        method: "DELETE",
      }),
    ).toBe(false);
  });
});
