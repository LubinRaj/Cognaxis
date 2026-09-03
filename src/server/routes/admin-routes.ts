import { Router, type Response } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { requireVerifiedEmail } from "../middleware/require-verified-email.js";
import { requireActivePlatformUser } from "../middleware/require-platform-user.js";
import { requireSuperAdmin } from "../middleware/require-super-admin.js";
import type { AuthenticatedRequest, TokenVerifier } from "../types.js";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { validateBody } from "../middleware/validate.js";
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

interface PlatformUserDoc {
  uid?: string;
  email?: string;
  platformRole?: "user" | "super_admin";
  status?: "active" | "suspended";
  firstSeenAt?: unknown;
  lastLoginAt?: unknown;
  updatedAt?: unknown;
}

const updateRoleSchema = z.object({
  role: z.enum(["user", "super_admin"]),
}).strict();

const updateStatusSchema = z.object({
  status: z.enum(["active", "suspended"]),
}).strict();

export function createPlatformAdminRoutes(verifier: TokenVerifier): Router {
  const router = Router();
  router.use(authenticate(verifier));
  router.use(requireVerifiedEmail);
  router.use(requireActivePlatformUser);
  router.use(requireSuperAdmin);

  router.get("/admin/metrics", async (_req: AuthenticatedRequest, res: Response, next) => {
    try {
      const db = getFirestore();
      let totalUsers = 0;
      let totalOrganizations = 0;

      try {
        const usersSnap = await db.collection("platformUsers").count().get();
        totalUsers = usersSnap.data().count;

        const orgsSnap = await db.collection("organizations").count().get();
        totalOrganizations = orgsSnap.data().count;
      } catch {
        // Aggregation fallback
      }

      res.json({
        totalUsers,
        totalOrganizations,
        totalSessions: 0,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/admin/users", async (_req: AuthenticatedRequest, res: Response, next) => {
    try {
      const db = getFirestore();
      const usersSnap = await db.collection("platformUsers").orderBy("firstSeenAt", "desc").limit(50).get();
      const users = usersSnap.docs.map((doc) => {
        const d = (doc.data() ?? {}) as PlatformUserDoc;
        return {
          uid: d.uid ?? doc.id,
          email: d.email ?? "",
          platformRole: d.platformRole ?? "user",
          status: d.status ?? "active",
          firstSeenAt: timestampToIso(d.firstSeenAt),
          lastLoginAt: timestampToIso(d.lastLoginAt),
          updatedAt: timestampToIso(d.updatedAt),
        };
      });
      res.json({ users });
    } catch (error) {
      next(error);
    }
  });

  router.patch(
    "/admin/users/:targetUid/role",
    validateBody(updateRoleSchema),
    async (req: AuthenticatedRequest, res: Response, next) => {
      try {
        const targetUid = paramId(req.params.targetUid);
        const { role } = req.body as { role: "user" | "super_admin" };

        if (targetUid === req.principal.uid) {
          throw new AppError(400, "CANNOT_DEMOTE_SELF", "Super administrators cannot alter their own platform role.");
        }

        const db = getFirestore();
        const userRef = db.collection("platformUsers").doc(targetUid);
        const doc = await userRef.get();
        if (!doc.exists) {
          throw new AppError(404, "USER_NOT_FOUND", "Platform user not found.");
        }

        await userRef.update({
          platformRole: role,
          updatedAt: FieldValue.serverTimestamp(),
        });

        res.json({ success: true, targetUid, platformRole: role });
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/admin/users/:targetUid/status",
    validateBody(updateStatusSchema),
    async (req: AuthenticatedRequest, res: Response, next) => {
      try {
        const targetUid = paramId(req.params.targetUid);
        const { status } = req.body as { status: "active" | "suspended" };

        if (targetUid === req.principal.uid) {
          throw new AppError(400, "CANNOT_SUSPEND_SELF", "Super administrators cannot suspend their own account.");
        }

        const db = getFirestore();
        const userRef = db.collection("platformUsers").doc(targetUid);
        const doc = await userRef.get();
        if (!doc.exists) {
          throw new AppError(404, "USER_NOT_FOUND", "Platform user not found.");
        }

        await userRef.update({
          status,
          updatedAt: FieldValue.serverTimestamp(),
        });

        res.json({ success: true, targetUid, status });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
