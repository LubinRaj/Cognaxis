import type { NextFunction, Response } from "express";
import { forbidden } from "../errors.js";
import type { AuthenticatedRequest } from "../types.js";

// Requires the active platform user to be a super admin.
// Must be used after requireActivePlatformUser.
export function requireSuperAdmin(
  request: AuthenticatedRequest,
  _response: Response,
  next: NextFunction,
): void {
  if (!request.platformUser || request.platformUser.platformRole !== "super_admin") {
    next(forbidden());
    return;
  }
  
  request.platformAdminScope = { type: "platform_admin", uid: request.principal.uid, role: "super_admin" };
  next();
}
