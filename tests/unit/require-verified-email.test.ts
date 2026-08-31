import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../src/server/errors.js";
import {
  isVerifiedPrincipal,
  requireVerifiedEmail,
} from "../../src/server/middleware/require-verified-email.js";
import type { AuthenticatedPrincipal, AuthenticatedRequest } from "../../src/server/types.js";

const base: AuthenticatedPrincipal = {
  uid: "user_alpha",
  email: "user_alpha@example.test",
  emailVerified: true,
  signInProvider: "password",
  issuedAt: 1_700_000_000,
  authTime: 1_700_000_000,
};

function run(principal: unknown) {
  const next = vi.fn();
  const request = { principal } as AuthenticatedRequest;
  requireVerifiedEmail(request, {} as never, next);
  return next;
}

describe("requireVerifiedEmail", () => {
  it("accepts only a principal whose verified token claim is true", () => {
    expect(isVerifiedPrincipal(base)).toBe(true);
    expect(isVerifiedPrincipal({ ...base, emailVerified: false })).toBe(false);
    expect(isVerifiedPrincipal(undefined)).toBe(false);
  });

  it("passes a verified principal through untouched", () => {
    const next = run(base);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it("denies an unverified principal with a generic 403", () => {
    const next = run({ ...base, emailVerified: false });
    expect(next).toHaveBeenCalledTimes(1);

    const error: unknown = next.mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(AppError);
    const appError = error as AppError;
    expect(appError.status).toBe(403);
    expect(appError.code).toBe("EMAIL_VERIFICATION_REQUIRED");
    expect(appError.publicMessage).not.toContain("@");
    expect(appError.publicMessage).not.toContain("user_alpha");
  });

  it("denies when the principal is missing entirely", () => {
    const error: unknown = run(undefined).mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).status).toBe(403);
  });

  it("never trusts a truthy non-boolean verification value", () => {
    for (const value of ["true", 1, {}, [], "yes"]) {
      const error: unknown = run({ ...base, emailVerified: value }).mock.calls[0]?.[0];
      expect(error).toBeInstanceOf(AppError);
    }
  });
});
