import { Router, type NextFunction, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  documentIdSchema,
  updateOrganizationStatusSchema,
  updatePlatformRoleSchema,
  updatePlatformStatusSchema,
} from "../../shared/schemas.js";
import type { AppConfig } from "../config/env.js";
import { AppError } from "../errors.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRecentAuthentication } from "../middleware/recent-auth.js";
import { requireFeature } from "../middleware/require-feature.js";
import { requireSuperAdmin } from "../middleware/require-super-admin.js";
import { requireVerifiedEmail } from "../middleware/require-verified-email.js";
import { validateBody } from "../middleware/validate.js";
import type { PlatformAdminService } from "../services/platform-admin-service.js";
import type { AuthenticatedRequest, TokenVerifier } from "../types.js";

const cursorSchema = z.string().regex(/^[A-Za-z0-9_-]{1,512}$/).optional();

const usersQuerySchema = z
  .object({
    query: z.string().trim().min(1).max(256).optional(),
    role: z.enum(["user", "super_admin"]).optional(),
    status: z.enum(["active", "suspended"]).optional(),
    cursor: cursorSchema,
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();

const organizationsQuerySchema = z
  .object({
    status: z.enum(["active", "suspended"]).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(50),
  })
  .strict();

const auditQuerySchema = z
  .object({
    cursor: cursorSchema,
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();

const uidParamSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

function route(handler: (request: AuthenticatedRequest, response: Response) => Promise<void>) {
  return (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

// Platform administration is operational metadata only. There is deliberately no route here for
// personal sessions, messages, memories, signals, insights, locations, exports, or search — do
// not add one for convenience.
export function createAdminRouter(
  config: AppConfig,
  service: PlatformAdminService,
  verifier: TokenVerifier,
): Router {
  const router = Router();
  router.use(requireFeature(config, "FEATURE_ADMIN"));
  router.use(requireSuperAdmin);
  router.use(
    rateLimit({
      windowMs: 60 * 1_000,
      limit: 30,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      keyGenerator: (request) => request.principal.uid,
      message: { error: { code: "RATE_LIMITED", message: "Please slow down and try again." } },
    }),
  );

  // Mutations get a tighter budget than admin reads. This counter is held in this instance's
  // memory, so the platform-wide ceiling scales with instance count; the transactional actor
  // recheck in the data layer does not depend on it.
  const mutationLimiter = rateLimit({
    windowMs: 15 * 60 * 1_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (request) => request.principal.uid,
    message: {
      error: { code: "RATE_LIMITED", message: "Please wait before more administrative changes." },
    },
  });

  const sensitive = [
    mutationLimiter,
    authenticate(verifier, true),
    requireVerifiedEmail,
    requireRecentAuthentication,
    requireSuperAdmin,
  ];

  router.get(
    "/admin/overview",
    route(async (_request, response) => {
      response.json({ overview: await service.overview() });
    }),
  );

  router.get(
    "/admin/users",
    route(async (request, response) => {
      const parsed = usersQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError(400, "INVALID_REQUEST", "The request is invalid.");
      }
      response.json(
        await service.listUsers({
          query: parsed.data.query,
          role: parsed.data.role,
          status: parsed.data.status,
          cursor: parsed.data.cursor ?? null,
          limit: parsed.data.limit,
        }),
      );
    }),
  );

  router.patch(
    "/admin/users/:targetUid/role",
    ...sensitive,
    validateBody(updatePlatformRoleSchema),
    route(async (request, response) => {
      const parsedUid = uidParamSchema.safeParse(request.params.targetUid);
      if (!parsedUid.success) {
        throw new AppError(400, "INVALID_RESOURCE_ID", "The resource identifier is invalid.");
      }
      const targetUid = parsedUid.data;
      const user = await service.setUserRole(
        request.principal.uid,
        targetUid,
        updatePlatformRoleSchema.parse(request.body),
        request.requestId,
      );
      response.json({ user });
    }),
  );

  router.patch(
    "/admin/users/:targetUid/status",
    ...sensitive,
    validateBody(updatePlatformStatusSchema),
    route(async (request, response) => {
      const parsedUid = uidParamSchema.safeParse(request.params.targetUid);
      if (!parsedUid.success) {
        throw new AppError(400, "INVALID_RESOURCE_ID", "The resource identifier is invalid.");
      }
      const targetUid = parsedUid.data;
      const user = await service.setUserStatus(
        request.principal.uid,
        targetUid,
        updatePlatformStatusSchema.parse(request.body),
        request.requestId,
      );
      response.json({ user });
    }),
  );

  router.get(
    "/admin/organizations",
    route(async (request, response) => {
      const parsed = organizationsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError(400, "INVALID_REQUEST", "The request is invalid.");
      }
      response.json({
        organizations: await service.listOrganizations(parsed.data.status, parsed.data.limit),
      });
    }),
  );

  router.patch(
    "/admin/organizations/:orgId/status",
    ...sensitive,
    validateBody(updateOrganizationStatusSchema),
    route(async (request, response) => {
      const parsedOrgId = documentIdSchema.safeParse(request.params.orgId);
      if (!parsedOrgId.success) {
        throw new AppError(400, "INVALID_RESOURCE_ID", "The resource identifier is invalid.");
      }
      const organization = await service.setOrganizationStatus(
        request.principal.uid,
        parsedOrgId.data,
        updateOrganizationStatusSchema.parse(request.body),
        request.requestId,
      );
      response.json({ organization });
    }),
  );

  router.get(
    "/admin/audit",
    route(async (request, response) => {
      const parsed = auditQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError(400, "INVALID_REQUEST", "The request is invalid.");
      }
      response.json(await service.listAudit(parsed.data.cursor ?? null, parsed.data.limit));
    }),
  );

  return router;
}
