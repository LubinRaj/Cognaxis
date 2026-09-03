import { Router } from "express";
import type { AppConfig } from "../config/env.js";
import { forbidden } from "../errors.js";
import type { AuthenticatedRequest } from "../types.js";

export function createMeRouter(config: AppConfig): Router {
  const router = Router();

  router.get("/me/capabilities", (request: AuthenticatedRequest, response, next) => {
    const user = request.platformUser;
    if (!user) {
      next(forbidden());
      return;
    }

    response.json({
      capabilities: {
        platformRole: user.platformRole,
        status: user.status,
        features: {
          insights: config.FEATURE_INSIGHTS,
          maps: config.FEATURE_MAPS,
          organizations: config.FEATURE_ORGANIZATIONS,
          admin: config.FEATURE_ADMIN && user.platformRole === "super_admin",
        },
      },
    });
  });

  return router;
}
