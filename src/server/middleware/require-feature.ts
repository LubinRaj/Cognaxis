import type { NextFunction, Request, Response } from "express";
import type { AppConfig } from "../config/env.js";
import { notFound } from "../errors.js";

type FeatureFlagKey = "FEATURE_INSIGHTS" | "FEATURE_MAPS" | "FEATURE_ORGANIZATIONS" | "FEATURE_ADMIN";

// Disabled features answer with the same generic 404 as a route that does not exist, so a probe
// cannot distinguish "disabled" from "absent".
export function requireFeature(config: AppConfig, flag: FeatureFlagKey) {
  return (_request: Request, _response: Response, next: NextFunction) => {
    if (!config[flag]) {
      next(notFound());
      return;
    }
    next();
  };
}
