import type { Request } from "express";
import type {
  PlatformUser,
  PersonalScope,
  OrganizationScope,
  PlatformAdminScope,
} from "../shared/schemas.js";

export type AuthenticatedPrincipal = {
  uid: string;
  email?: string;
  emailVerified: boolean;
  signInProvider?: string;
  issuedAt: number;
  authTime: number;
};

declare global {
  namespace Express {
    interface Request {
      principal: AuthenticatedPrincipal;
      requestId: string;
      platformUser?: PlatformUser;
      personalScope?: PersonalScope;
      organizationScope?: OrganizationScope;
      platformAdminScope?: PlatformAdminScope;
    }
  }
}

export type AuthenticatedRequest = Request;

export type TokenVerifier = {
  verify(token: string, checkRevoked?: boolean): Promise<AuthenticatedPrincipal>;
};
