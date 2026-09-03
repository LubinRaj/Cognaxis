import type { NextFunction, Response } from "express";
import { forbidden, notFound } from "../errors.js";
import type { AuthenticatedRequest } from "../types.js";
import { getFirestore } from "firebase-admin/firestore";
import type { OrganizationRole } from "../../shared/schemas.js";

interface MemberRecord {
  status?: string;
  role?: OrganizationRole;
}

export function requireOrganizationRole(allowedRoles: OrganizationRole[]) {
  return async (
    request: AuthenticatedRequest,
    _response: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!request.principal) {
      next(forbidden());
      return;
    }

    const orgId = typeof request.params.orgId === "string" ? request.params.orgId : "";
    if (!orgId) {
      next(notFound());
      return;
    }

    const db = getFirestore();
    const membershipRef = db.collection("organizations").doc(orgId).collection("members").doc(request.principal.uid);

    try {
      const doc = await membershipRef.get();
      if (!doc.exists) {
        next(notFound()); // Avoid organization enumeration by returning 404
        return;
      }

      const membership = (doc.data() ?? {}) as MemberRecord;
      if (!membership.role || membership.status !== "active") {
        next(forbidden());
        return;
      }

      if (!allowedRoles.includes(membership.role)) {
        next(forbidden());
        return;
      }

      request.organizationScope = {
        type: "organization",
        uid: request.principal.uid,
        orgId,
        role: membership.role,
        membershipId: request.principal.uid,
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}
