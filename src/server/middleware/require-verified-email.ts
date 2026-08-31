import type { NextFunction, Response } from "express";
import { AppError } from "../errors.js";
import type { AuthenticatedPrincipal, AuthenticatedRequest } from "../types.js";

export const emailVerificationRequired = () =>
  new AppError(
    403,
    "EMAIL_VERIFICATION_REQUIRED",
    "Verify your email address before using your private journal.",
  );

// The browser's user.emailVerified value is a convenience for the interface only. Authorization
// uses the email_verified claim of the token that the Admin SDK has already verified.
export function isVerifiedPrincipal(principal: AuthenticatedPrincipal | undefined): boolean {
  return principal?.emailVerified === true;
}

export function requireVerifiedEmail(
  request: AuthenticatedRequest,
  _response: Response,
  next: NextFunction,
) {
  if (!isVerifiedPrincipal(request.principal)) {
    next(emailVerificationRequired());
    return;
  }
  next();
}
