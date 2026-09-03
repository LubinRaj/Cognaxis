import type { NextFunction, Response } from "express";
import { forbidden } from "../errors.js";
import type { AuthenticatedRequest } from "../types.js";

// Runs after requireActiveUser, so request.platformUser reflects the live Firestore record for
// this request rather than any cached claim.
export function requireSuperAdmin(
  request: AuthenticatedRequest,
  _response: Response,
  next: NextFunction,
): void {
  const user = request.platformUser;
  if (!user || user.platformRole !== "super_admin" || user.status !== "active") {
    next(forbidden());
    return;
  }
  request.platformAdminScope = { type: "platform_admin", uid: user.uid, role: "super_admin" };
  next();
}
