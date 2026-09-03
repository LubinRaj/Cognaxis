import { Router, type NextFunction, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  acceptInviteSchema,
  createInviteSchema,
  createMessageSchema,
  createOrganizationSchema,
  createSessionSchema,
  documentIdSchema,
  updateMemberSchema,
  updateOrganizationSchema,
} from "../../shared/schemas.js";
import type { AppConfig } from "../config/env.js";
import { AppError } from "../errors.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRecentAuthentication } from "../middleware/recent-auth.js";
import { requireFeature } from "../middleware/require-feature.js";
import { requireVerifiedEmail } from "../middleware/require-verified-email.js";
import { validateBody } from "../middleware/validate.js";
import type { OrganizationService } from "../services/organization-service.js";
import type { AuthenticatedRequest, TokenVerifier } from "../types.js";

const uidParamSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

function identifier(request: AuthenticatedRequest, name: string): string {
  const schema = name === "targetUid" ? uidParamSchema : documentIdSchema;
  const parsed = schema.safeParse(request.params[name]);
  if (!parsed.success) {
    throw new AppError(400, "INVALID_RESOURCE_ID", "The resource identifier is invalid.");
  }
  return parsed.data;
}

function route(handler: (request: AuthenticatedRequest, response: Response) => Promise<void>) {
  return (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

// Authentication, per-user rate limiting, verified email, and active platform status are enforced
// by the shared private pipeline in app.ts. Organization membership and role are resolved inside
// the service before any Firestore or model access, and sensitive mutations additionally demand a
// recently authenticated, revocation-checked token.
export function createOrganizationRouter(
  config: AppConfig,
  service: OrganizationService,
  verifier: TokenVerifier,
): Router {
  const router = Router();
  router.use(requireFeature(config, "FEATURE_ORGANIZATIONS"));

  const sensitive = [authenticate(verifier, true), requireVerifiedEmail, requireRecentAuthentication];

  // Per-operation budgets on top of the shared private-pipeline limit. These counters live in
  // this instance's memory, so the platform-wide ceiling scales with instance count; invitation
  // consumption and message idempotency stay transactional in the data layer regardless.
  const modelLimiter = rateLimit({
    windowMs: 60 * 1_000,
    limit: 12,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (request) => request.principal.uid,
    message: {
      error: { code: "RATE_LIMITED", message: "Please wait before sending more messages." },
    },
  });
  const inviteLimiter = rateLimit({
    windowMs: 15 * 60 * 1_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (request) => request.principal.uid,
    message: {
      error: { code: "RATE_LIMITED", message: "Please wait before more invitation activity." },
    },
  });

  router.get(
    "/organizations",
    route(async (request, response) => {
      response.json({ organizations: await service.listMine(request.principal.uid) });
    }),
  );

  router.post(
    "/organizations",
    validateBody(createOrganizationSchema),
    route(async (request, response) => {
      const detail = await service.create(
        request.principal.uid,
        createOrganizationSchema.parse(request.body),
        request.requestId,
      );
      response.status(201).json(detail);
    }),
  );

  router.get(
    "/organizations/:orgId",
    route(async (request, response) => {
      response.json(await service.get(request.principal.uid, identifier(request, "orgId")));
    }),
  );

  router.patch(
    "/organizations/:orgId",
    ...sensitive,
    validateBody(updateOrganizationSchema),
    route(async (request, response) => {
      const organization = await service.updateSettings(
        request.principal.uid,
        identifier(request, "orgId"),
        updateOrganizationSchema.parse(request.body),
        request.requestId,
      );
      response.json({ organization });
    }),
  );

  router.get(
    "/organizations/:orgId/members",
    route(async (request, response) => {
      response.json({
        members: await service.listMembers(request.principal.uid, identifier(request, "orgId")),
      });
    }),
  );

  router.patch(
    "/organizations/:orgId/members/:targetUid",
    ...sensitive,
    validateBody(updateMemberSchema),
    route(async (request, response) => {
      const member = await service.updateMember(
        request.principal.uid,
        identifier(request, "orgId"),
        identifier(request, "targetUid"),
        updateMemberSchema.parse(request.body),
        request.requestId,
      );
      response.json({ member });
    }),
  );

  router.delete(
    "/organizations/:orgId/members/:targetUid",
    ...sensitive,
    route(async (request, response) => {
      await service.removeMember(
        request.principal.uid,
        identifier(request, "orgId"),
        identifier(request, "targetUid"),
        request.requestId,
      );
      response.status(204).end();
    }),
  );

  router.get(
    "/organizations/:orgId/invites",
    route(async (request, response) => {
      response.json({
        invites: await service.listInvites(request.principal.uid, identifier(request, "orgId")),
      });
    }),
  );

  router.post(
    "/organizations/:orgId/invites",
    inviteLimiter,
    ...sensitive,
    validateBody(createInviteSchema),
    route(async (request, response) => {
      const invite = await service.createInvite(
        request.principal.uid,
        identifier(request, "orgId"),
        createInviteSchema.parse(request.body).role,
        request.requestId,
      );
      response.status(201).json({ invite });
    }),
  );

  router.delete(
    "/organizations/:orgId/invites/:inviteId",
    ...sensitive,
    route(async (request, response) => {
      await service.revokeInvite(
        request.principal.uid,
        identifier(request, "orgId"),
        identifier(request, "inviteId"),
        request.requestId,
      );
      response.status(204).end();
    }),
  );

  router.post(
    "/organizations/:orgId/invites/:inviteId/preview",
    inviteLimiter,
    validateBody(acceptInviteSchema),
    route(async (request, response) => {
      const preview = await service.previewInvite(
        identifier(request, "orgId"),
        identifier(request, "inviteId"),
        acceptInviteSchema.parse(request.body).secret,
      );
      response.json({ invite: preview });
    }),
  );

  router.post(
    "/organizations/:orgId/invites/:inviteId/accept",
    inviteLimiter,
    validateBody(acceptInviteSchema),
    route(async (request, response) => {
      const membership = await service.acceptInvite(
        request.principal.uid,
        identifier(request, "orgId"),
        identifier(request, "inviteId"),
        acceptInviteSchema.parse(request.body).secret,
        request.requestId,
      );
      response.json({ membership });
    }),
  );

  router.get(
    "/organizations/:orgId/audit-events",
    route(async (request, response) => {
      response.json({
        events: await service.listAudit(request.principal.uid, identifier(request, "orgId")),
      });
    }),
  );

  router.get(
    "/organizations/:orgId/sessions",
    route(async (request, response) => {
      response.json({
        sessions: await service.listSessions(request.principal.uid, identifier(request, "orgId")),
      });
    }),
  );

  router.post(
    "/organizations/:orgId/sessions",
    validateBody(createSessionSchema),
    route(async (request, response) => {
      const session = await service.createSession(
        request.principal.uid,
        identifier(request, "orgId"),
        createSessionSchema.parse(request.body).title,
      );
      response.status(201).json({ session });
    }),
  );

  router.get(
    "/organizations/:orgId/sessions/:sessionId",
    route(async (request, response) => {
      response.json({
        session: await service.getSession(
          request.principal.uid,
          identifier(request, "orgId"),
          identifier(request, "sessionId"),
        ),
      });
    }),
  );

  router.post(
    "/organizations/:orgId/sessions/:sessionId/messages",
    modelLimiter,
    validateBody(createMessageSchema),
    route(async (request, response) => {
      const body = createMessageSchema.parse(request.body);
      const exchange = await service.addMessage(
        request.principal.uid,
        identifier(request, "orgId"),
        identifier(request, "sessionId"),
        body.requestId,
        body.content,
      );
      response.status(201).json(exchange);
    }),
  );

  router.post(
    "/organizations/:orgId/sessions/:sessionId/summarize",
    modelLimiter,
    route(async (request, response) => {
      const summary = await service.summarize(
        request.principal.uid,
        identifier(request, "orgId"),
        identifier(request, "sessionId"),
      );
      response.json({ summary });
    }),
  );

  router.delete(
    "/organizations/:orgId/sessions/:sessionId",
    ...sensitive,
    route(async (request, response) => {
      await service.deleteSession(
        request.principal.uid,
        identifier(request, "orgId"),
        identifier(request, "sessionId"),
      );
      response.status(204).end();
    }),
  );

  return router;
}
