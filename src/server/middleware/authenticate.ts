import type { NextFunction, Request, Response } from "express";
import { unauthorized } from "../errors.js";
import type { AuthenticatedRequest, TokenVerifier } from "../types.js";

const bearerPattern = /^Bearer ([A-Za-z0-9._~-]+)$/;

export function authenticate(verifier: TokenVerifier, checkRevoked = false) {
  return async (request: Request, _response: Response, next: NextFunction) => {
    const authorization = request.header("authorization");
    const match = authorization?.match(bearerPattern);

    if (!match) {
      next(unauthorized());
      return;
    }

    try {
      const principal = await verifier.verify(match[1], checkRevoked);
      (request as AuthenticatedRequest).principal = principal;
      next();
    } catch {
      next(unauthorized());
    }
  };
}
