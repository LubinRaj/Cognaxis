import type { Request } from "express";

export type AuthenticatedPrincipal = {
  uid: string;
  email?: string;
  issuedAt: number;
  authTime: number;
};

declare global {
  namespace Express {
    interface Request {
      principal: AuthenticatedPrincipal;
      requestId: string;
    }
  }
}

export type AuthenticatedRequest = Request;

export type TokenVerifier = {
  verify(token: string, checkRevoked?: boolean): Promise<AuthenticatedPrincipal>;
};
