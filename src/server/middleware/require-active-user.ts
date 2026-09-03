import type { NextFunction, Response } from "express";
import { forbidden } from "../errors.js";
import type { PlatformUserService } from "../services/platform-user-service.js";
import type { AuthenticatedRequest } from "../types.js";

export function requireActiveUser(service: PlatformUserService) {
  return async (request: AuthenticatedRequest, _response: Response, next: NextFunction) => {
    if (!request.principal) {
      next(forbidden());
      return;
    }

    try {
      const platformUser = await service.resolveActiveUser(request.principal);
      request.platformUser = platformUser;
      request.personalScope = { type: "personal", uid: platformUser.uid };
      next();
    } catch (error) {
      next(error);
    }
  };
}
