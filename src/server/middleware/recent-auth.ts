import type { NextFunction, Response } from "express";
import { AppError } from "../errors.js";
import type { AuthenticatedRequest } from "../types.js";

const MAX_AUTH_AGE_SECONDS = 10 * 60;

export function requireRecentAuthentication(
  request: AuthenticatedRequest,
  _response: Response,
  next: NextFunction,
) {
  const age = Math.floor(Date.now() / 1_000) - request.principal.authTime;
  if (age > MAX_AUTH_AGE_SECONDS) {
    next(new AppError(401, "RECENT_AUTH_REQUIRED", "Please sign in again to continue."));
    return;
  }
  next();
}
