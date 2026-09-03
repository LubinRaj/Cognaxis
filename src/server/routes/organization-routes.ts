import { Router, type Response } from "express";
import crypto from "node:crypto";
import { authenticate } from "../middleware/authenticate.js";
import { requireVerifiedEmail } from "../middleware/require-verified-email.js";
import { requireActivePlatformUser } from "../middleware/require-platform-user.js";
import { requireOrganizationRole } from "../middleware/require-org-role.js";
import { validateBody } from "../middleware/validate.js";
import type { AuthenticatedRequest, TokenVerifier } from "../types.js";
import { getFirestore, FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  createOrganizationSchema,
  createInviteSchema,
  acceptInviteSchema,
  type CreateOrganizationInput,
} from "../../shared/schemas.js";
import { AppError } from "../errors.js";

function paramId(val: unknown): string {
  if (typeof val === "string" && val.length > 0) return val;
  if (Array.isArray(val) && typeof val[0] === "string") return val[0];
  throw new AppError(400, "INVALID_RESOURCE_ID", "The resource identifier is invalid.");
}

function timestampToIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

interface StoredOrgDoc {
  id?: string;
  name?: string;
  description?: string | null;
  status?: string;
  ownerUid?: string;
  memberCount?: number;
  createdBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  schemaVersion?: number;
}

interface StoredMemberDoc {
  uid?: string;
  orgId?: string;
  organizationName?: string;
  role?: "owner" | "admin" | "member" | "viewer";
  status?: "active" | "suspended";
  invitedBy?: string | null;
  joinedAt?: unknown;
  updatedAt?: unknown;
  schemaVersion?: number;
}

interface StoredInviteDoc {
  id?: string;
  orgId?: string;
  tokenHash?: string;
  role?: "admin" | "member" | "viewer";
  status?: "pending" | "accepted" | "revoked";
  expiresAt?: string;
  createdBy?: string;
  acceptedBy?: string | null;
  createdAt?: unknown;
  acceptedAt?: unknown;
  updatedAt?: unknown;
  schemaVersion?: number;
}

interface StoredAuditEventDoc {
  id?: string;
  eventType?: string;
  actorUid?: string;
  targetType?: "user" | "organization" | "membership" | "invite";
  targetId?: string;
  organizationId?: string;
  changes?: Array<{ field: string; from: string | null; to: string | null }>;
  reason?: string | null;
  requestId?: string;
  createdAt?: unknown;
  schemaVersion?: number;
}

async function recordAuditEvent(
  db: Firestore,
  params: {
    orgId: string;
    actorUid: string;
    eventType: string;
    targetType: "user" | "organization" | "membership" | "invite";
    targetId: string;
    changes: Array<{ field: string; from: string | null; to: string | null }>;
    reason: string | null;
    requestId: string;
  },
): Promise<void> {
  const ref = db.collection("organizations").doc(params.orgId).collection("auditEvents").doc();
  await ref.set({
    id: ref.id,
    eventType: params.eventType,
    actorUid: params.actorUid,
    targetType: params.targetType,
    targetId: params.targetId,
    organizationId: params.orgId,
    changes: params.changes,
    reason: params.reason,
    requestId: params.requestId,
    createdAt: FieldValue.serverTimestamp(),
    schemaVersion: 1,
  });
}

export function createOrganizationRoutes(verifier: TokenVerifier): Router {
  const router = Router();
  router.use(authenticate(verifier));
  router.use(requireVerifiedEmail);
  router.use(requireActivePlatformUser);

  // --- List Organizations for Current User ---
  router.get("/organizations", async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const db = getFirestore();
      const memSnap = await db
        .collectionGroup("members")
        .where("uid", "==", req.principal.uid)
        .where("status", "==", "active")
        .get();

      const edges = memSnap.docs.map((doc) => {
        const mem = (doc.data() ?? {}) as StoredMemberDoc;
        const joinedAt = timestampToIso(mem.joinedAt);
        const updatedAt = timestampToIso(mem.updatedAt);
        return {
          orgId: mem.orgId ?? "",
          organizationName: mem.organizationName ?? "Unknown Organization",
          role: mem.role ?? "member",
          status: mem.status ?? "active",
          joinedAt,
          updatedAt,
        };
      });

      res.json({ organizations: edges });
    } catch (error) {
      next(error);
    }
  });

  // --- Create Organization ---
  router.post("/organizations", validateBody(createOrganizationSchema), async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const body = req.body as CreateOrganizationInput;
      const db = getFirestore();
      const orgRef = db.collection("organizations").doc();
      const now = FieldValue.serverTimestamp();

      const orgData = {
        id: orgRef.id,
        name: body.name,
        description: body.description ?? null,
        status: "active",
        ownerUid: req.principal.uid,
        memberCount: 1,
        createdBy: req.principal.uid,
        createdAt: now,
        updatedAt: now,
        schemaVersion: 1,
      };

      const memData = {
        uid: req.principal.uid,
        orgId: orgRef.id,
        organizationName: body.name,
        role: "owner" as const,
        status: "active" as const,
        invitedBy: null,
        joinedAt: now,
        updatedAt: now,
        schemaVersion: 1,
      };

      await db.runTransaction((t) => {
        t.set(orgRef, orgData);
        t.set(orgRef.collection("members").doc(req.principal.uid), memData);
        return Promise.resolve();
      });

      await recordAuditEvent(db, {
        orgId: orgRef.id,
        actorUid: req.principal.uid,
        eventType: "organization.created",
        targetType: "organization",
        targetId: orgRef.id,
        changes: [{ field: "name", from: null, to: body.name }],
        reason: "New organization created",
        requestId: req.requestId || `req-${Date.now()}`,
      });

      const snapshot = await orgRef.get();
      const snapData = (snapshot.data() ?? {}) as StoredOrgDoc;
      const createdAt = timestampToIso(snapData.createdAt);
      const updatedAt = timestampToIso(snapData.updatedAt);

      res.status(201).json({
        ...snapData,
        createdAt,
        updatedAt,
      });
    } catch (error) {
      next(error);
    }
  });

  // --- Accept Invite Token (Global) ---
  router.post("/organizations/invites/accept", validateBody(acceptInviteSchema), async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const { secret } = req.body as { secret: string };
      const tokenHash = crypto.createHash("sha256").update(secret).digest("hex");
      const db = getFirestore();

      const invitesSnap = await db
        .collectionGroup("invites")
        .where("tokenHash", "==", tokenHash)
        .limit(1)
        .get();

      if (invitesSnap.empty) {
        throw new AppError(404, "INVITE_NOT_FOUND", "The invitation token is invalid or does not exist.");
      }

      const inviteDoc = invitesSnap.docs[0];
      const inviteData = (inviteDoc.data() ?? {}) as StoredInviteDoc;
      const orgId = inviteData.orgId ?? "";

      if (inviteData.status !== "pending") {
        throw new AppError(400, "INVITE_ALREADY_USED", `This invitation has already been ${String(inviteData.status)}.`);
      }

      const expiresAt = new Date(inviteData.expiresAt ?? 0);
      if (expiresAt < new Date()) {
        throw new AppError(400, "INVITE_EXPIRED", "This invitation has expired.");
      }

      const orgRef = db.collection("organizations").doc(orgId);
      const orgDoc = await orgRef.get();
      if (!orgDoc.exists) {
        throw new AppError(404, "ORG_NOT_FOUND", "The inviting organization no longer exists.");
      }
      const orgData = (orgDoc.data() ?? {}) as StoredOrgDoc;
      const orgName = orgData.name ?? "Organization";

      const memberRef = orgRef.collection("members").doc(req.principal.uid);
      const now = FieldValue.serverTimestamp();
      const inviteRole = inviteData.role ?? "member";

      await db.runTransaction(async (t) => {
        const memCheck = await t.get(memberRef);
        if (!memCheck.exists) {
          t.set(memberRef, {
            uid: req.principal.uid,
            orgId,
            organizationName: orgName,
            role: inviteRole,
            status: "active",
            invitedBy: inviteData.createdBy ?? null,
            joinedAt: now,
            updatedAt: now,
            schemaVersion: 1,
          });
          t.update(orgRef, {
            memberCount: FieldValue.increment(1),
            updatedAt: now,
          });
        }
        t.update(inviteDoc.ref, {
          status: "accepted",
          acceptedBy: req.principal.uid,
          acceptedAt: now,
        });
      });

      await recordAuditEvent(db, {
        orgId,
        actorUid: req.principal.uid,
        eventType: "invite.accepted",
        targetType: "membership",
        targetId: req.principal.uid,
        changes: [{ field: "role", from: null, to: inviteRole }],
        reason: "User accepted organization invite",
        requestId: req.requestId || `req-${Date.now()}`,
      });

      res.json({
        success: true,
        orgId,
        organizationName: orgName,
        role: inviteRole,
      });
    } catch (error) {
      next(error);
    }
  });

  // --- Get Organization Details ---
  router.get(
    "/organizations/:orgId",
    requireOrganizationRole(["owner", "admin", "member", "viewer"]),
    async (req: AuthenticatedRequest, res: Response, next) => {
      try {
        const orgId = paramId(req.params.orgId);
        const db = getFirestore();
        const doc = await db.collection("organizations").doc(orgId).get();
        if (!doc.exists) {
          res.status(404).json({ error: { code: "NOT_FOUND", message: "Organization not found" } });
          return;
        }
        const data = (doc.data() ?? {}) as StoredOrgDoc;
        const createdAt = timestampToIso(data.createdAt);
        const updatedAt = timestampToIso(data.updatedAt);

        res.json({
          ...data,
          createdAt,
          updatedAt,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  // --- List Members ---
  router.get(
    "/organizations/:orgId/members",
    requireOrganizationRole(["owner", "admin", "member", "viewer"]),
    async (req: AuthenticatedRequest, res: Response, next) => {
      try {
        const orgId = paramId(req.params.orgId);
        const db = getFirestore();
        const membersSnap = await db
          .collection("organizations")
          .doc(orgId)
          .collection("members")
          .where("status", "==", "active")
          .get();

        const members = membersSnap.docs.map((doc) => {
          const d = (doc.data() ?? {}) as StoredMemberDoc;
          const joinedAt = timestampToIso(d.joinedAt);
          const updatedAt = timestampToIso(d.updatedAt);
          return {
            uid: d.uid ?? "",
            orgId: d.orgId ?? "",
            role: d.role ?? "member",
            status: d.status ?? "active",
            invitedBy: d.invitedBy ?? null,
            joinedAt,
            updatedAt,
          };
        });

        res.json({ members });
      } catch (error) {
        next(error);
      }
    },
  );

  // --- Remove Member ---
  router.delete(
    "/organizations/:orgId/members/:memberUid",
    requireOrganizationRole(["owner", "admin"]),
    async (req: AuthenticatedRequest, res: Response, next) => {
      try {
        const orgId = paramId(req.params.orgId);
        const memberUid = paramId(req.params.memberUid);
        const db = getFirestore();
        const memberRef = db.collection("organizations").doc(orgId).collection("members").doc(memberUid);
        const memDoc = await memberRef.get();

        if (!memDoc.exists) {
          throw new AppError(404, "MEMBER_NOT_FOUND", "Member not found in organization.");
        }

        const memData = (memDoc.data() ?? {}) as StoredMemberDoc;
        if (memData.role === "owner") {
          throw new AppError(400, "CANNOT_REMOVE_OWNER", "Organization owners cannot be removed.");
        }

        await db.runTransaction((t) => {
          t.delete(memberRef);
          t.update(db.collection("organizations").doc(orgId), {
            memberCount: FieldValue.increment(-1),
            updatedAt: FieldValue.serverTimestamp(),
          });
          return Promise.resolve();
        });

        await recordAuditEvent(db, {
          orgId,
          actorUid: req.principal.uid,
          eventType: "member.removed",
          targetType: "membership",
          targetId: memberUid,
          changes: [{ field: "status", from: "active", to: "deleted" }],
          reason: "Member removed by admin/owner",
          requestId: req.requestId || `req-${Date.now()}`,
        });

        res.status(204).end();
      } catch (error) {
        next(error);
      }
    },
  );

  // --- List Invites ---
  router.get(
    "/organizations/:orgId/invites",
    requireOrganizationRole(["owner", "admin"]),
    async (req: AuthenticatedRequest, res: Response, next) => {
      try {
        const orgId = paramId(req.params.orgId);
        const db = getFirestore();
        const snap = await db
          .collection("organizations")
          .doc(orgId)
          .collection("invites")
          .orderBy("createdAt", "desc")
          .limit(30)
          .get();

        const invites = snap.docs.map((doc) => {
          const d = (doc.data() ?? {}) as StoredInviteDoc;
          const createdAt = timestampToIso(d.createdAt);
          const acceptedAt = d.acceptedAt ? timestampToIso(d.acceptedAt) : null;
          return {
            id: d.id ?? "",
            role: d.role ?? "member",
            status: d.status ?? "pending",
            expiresAt: d.expiresAt ?? "",
            createdBy: d.createdBy ?? "",
            acceptedBy: d.acceptedBy ?? null,
            createdAt,
            acceptedAt,
          };
        });

        res.json({ invites });
      } catch (error) {
        next(error);
      }
    },
  );

  // --- Create Invite Token ---
  router.post(
    "/organizations/:orgId/invites",
    requireOrganizationRole(["owner", "admin"]),
    validateBody(createInviteSchema),
    async (req: AuthenticatedRequest, res: Response, next) => {
      try {
        const orgId = paramId(req.params.orgId);
        const { role } = req.body as { role: "admin" | "member" | "viewer" };
        const db = getFirestore();

        const orgDoc = await db.collection("organizations").doc(orgId).get();
        if (!orgDoc.exists) {
          throw new AppError(404, "ORG_NOT_FOUND", "Organization not found.");
        }

        // Generate 32-byte cryptographically secure random token secret
        const secret = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(secret).digest("hex");
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        const inviteRef = db.collection("organizations").doc(orgId).collection("invites").doc();
        const now = FieldValue.serverTimestamp();

        await inviteRef.set({
          id: inviteRef.id,
          orgId,
          tokenHash,
          role,
          status: "pending",
          expiresAt,
          createdBy: req.principal.uid,
          acceptedBy: null,
          createdAt: now,
          acceptedAt: null,
          schemaVersion: 1,
        });

        await recordAuditEvent(db, {
          orgId,
          actorUid: req.principal.uid,
          eventType: "invite.created",
          targetType: "invite",
          targetId: inviteRef.id,
          changes: [{ field: "role", from: null, to: role }],
          reason: `Generated single-use invite link for role ${role}`,
          requestId: req.requestId || `req-${Date.now()}`,
        });

        res.status(201).json({
          inviteId: inviteRef.id,
          token: secret,
          role,
          expiresAt,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  // --- Revoke Invite ---
  router.delete(
    "/organizations/:orgId/invites/:inviteId",
    requireOrganizationRole(["owner", "admin"]),
    async (req: AuthenticatedRequest, res: Response, next) => {
      try {
        const orgId = paramId(req.params.orgId);
        const inviteId = paramId(req.params.inviteId);
        const db = getFirestore();
        const inviteRef = db.collection("organizations").doc(orgId).collection("invites").doc(inviteId);
        const doc = await inviteRef.get();

        if (!doc.exists) {
          throw new AppError(404, "INVITE_NOT_FOUND", "Invite not found.");
        }

        await inviteRef.update({
          status: "revoked",
          updatedAt: FieldValue.serverTimestamp(),
        });

        await recordAuditEvent(db, {
          orgId,
          actorUid: req.principal.uid,
          eventType: "invite.revoked",
          targetType: "invite",
          targetId: inviteId,
          changes: [{ field: "status", from: "pending", to: "revoked" }],
          reason: "Invite revoked by admin/owner",
          requestId: req.requestId || `req-${Date.now()}`,
        });

        res.status(204).end();
      } catch (error) {
        next(error);
      }
    },
  );

  // --- Get Organization Audit Events ---
  router.get(
    "/organizations/:orgId/audit-events",
    requireOrganizationRole(["owner", "admin"]),
    async (req: AuthenticatedRequest, res: Response, next) => {
      try {
        const orgId = paramId(req.params.orgId);
        const db = getFirestore();
        const snap = await db
          .collection("organizations")
          .doc(orgId)
          .collection("auditEvents")
          .orderBy("createdAt", "desc")
          .limit(50)
          .get();

        const auditEvents = snap.docs.map((doc) => {
          const d = (doc.data() ?? {}) as StoredAuditEventDoc;
          const createdAt = timestampToIso(d.createdAt);
          return {
            id: d.id ?? "",
            eventType: d.eventType ?? "",
            actorUid: d.actorUid ?? "",
            targetType: d.targetType ?? "organization",
            targetId: d.targetId ?? "",
            organizationId: d.organizationId ?? "",
            changes: d.changes ?? [],
            reason: d.reason ?? null,
            requestId: d.requestId ?? "",
            createdAt,
          };
        });

        res.json({ auditEvents });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
