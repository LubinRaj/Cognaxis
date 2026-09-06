import express, { Router, type NextFunction, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  acceptInviteSchema,
  createInviteSchema,
  createMessageSchema,
  createOrganizationSchema,
  createSessionSchema,
  documentIdSchema,
  localDateSchema,
  listQuerySchema,
  organizationMemoryAskSchema,
  organizationEodSettingsSchema,
  buildMemoryIndexSchema,
  organizationEodStatusSchema,
  renameSessionSchema,
  tagListQuerySchema,
  updateMemberSchema,
  updateOrganizationSchema,
  updateSessionTagsSchema,
} from "../../shared/schemas.js";
import type { AppConfig } from "../config/env.js";
import { AppError } from "../errors.js";
import { assertAttachmentSize } from "../attachment-limits.js";
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

const supportedAttachmentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
]);
const attachmentUpload = express.raw({ type: [...supportedAttachmentTypes], limit: "15mb" });
const supportedVoiceTypes = new Set(["audio/webm", "audio/ogg", "audio/wav", "audio/mpeg"]);
const voiceUpload = express.raw({ type: [...supportedVoiceTypes], limit: "15mb" });

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

  router.get(
    "/organizations/:orgId/tags",
    route(async (request, response) => {
      const parsed = tagListQuerySchema.safeParse(request.query);
      if (!parsed.success) throw new AppError(400, "INVALID_REQUEST", "The request is invalid.");
      response.json({
        tags: await service.listTags(request.principal.uid, identifier(request, "orgId"), parsed.data.limit),
      });
    }),
  );

  const sensitive = [authenticate(verifier, true), requireVerifiedEmail, requireRecentAuthentication];
  const revocationChecked = [authenticate(verifier, true), requireVerifiedEmail];

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
  const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1_000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (request) => request.principal.uid,
    message: { error: { code: "RATE_LIMITED", message: "Please wait before uploading more media." } },
  });

  router.post(
    "/organizations/:orgId/sessions/:sessionId/voice/transcribe",
    modelLimiter,
    voiceUpload,
    route(async (request, response) => {
      const mimeType = request.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
      if (!supportedVoiceTypes.has(mimeType) || !Buffer.isBuffer(request.body) || request.body.length === 0) {
        throw new AppError(415, "UNSUPPORTED_VOICE", "Record voice using a supported browser audio format.");
      }
      assertAttachmentSize(mimeType, request.body.length);
      const transcript = await service.transcribeVoice(
        request.principal.uid,
        identifier(request, "orgId"),
        identifier(request, "sessionId"),
        mimeType,
        request.body,
      );
      response.json({ transcript });
    }),
  );

  router.get(
    "/organizations",
    route(async (request, response) => {
      response.json({ organizations: await service.listMine(request.principal.uid) });
    }),
  );

  router.patch(
    "/organizations/:orgId/sessions/:sessionId",
    validateBody(renameSessionSchema),
    route(async (request, response) => {
      const { title } = renameSessionSchema.parse(request.body);
      const session = await service.renameSession(
        request.principal.uid,
        identifier(request, "orgId"),
        identifier(request, "sessionId"),
        title,
      );
      response.json({ session });
    }),
  );

  router.patch(
    "/organizations/:orgId/sessions/:sessionId/tags",
    validateBody(updateSessionTagsSchema),
    route(async (request, response) => {
      const { tags } = updateSessionTagsSchema.parse(request.body);
      const session = await service.setSessionTags(
        request.principal.uid,
        identifier(request, "orgId"),
        identifier(request, "sessionId"),
        tags,
      );
      response.json({ session });
    }),
  );

  router.post(
    "/organizations/:orgId/sessions/:sessionId/attachments",
    uploadLimiter,
    attachmentUpload,
    route(async (request, response) => {
      const mimeType = request.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
      if (!supportedAttachmentTypes.has(mimeType) || !Buffer.isBuffer(request.body) || request.body.length === 0) {
        throw new AppError(415, "UNSUPPORTED_ATTACHMENT", "Upload an image or supported document.");
      }
      assertAttachmentSize(mimeType, request.body.length);
      const attachment = await service.createAttachment(
        request.principal.uid,
        identifier(request, "orgId"),
        identifier(request, "sessionId"),
        mimeType.startsWith("image/") ? "image" : "document",
        mimeType,
        request.body,
      );
      response.status(201).json({ attachment });
    }),
  );

  router.get(
    "/organizations/:orgId/sessions/:sessionId/attachments/:attachmentId",
    route(async (request, response) => {
      const attachment = await service.getAttachment(
        request.principal.uid,
        identifier(request, "orgId"),
        identifier(request, "sessionId"),
        identifier(request, "attachmentId"),
      );
      response.setHeader("Cache-Control", "private, no-store");
      response.type(attachment.mimeType).send(attachment.bytes);
    }),
  );

  router.delete(
    "/organizations/:orgId/sessions/:sessionId/attachments/:attachmentId",
    ...revocationChecked,
    route(async (request, response) => {
      await service.deleteAttachment(
        request.principal.uid,
        identifier(request, "orgId"),
        identifier(request, "sessionId"),
        identifier(request, "attachmentId"),
      );
      response.status(204).end();
    }),
  );

  router.post(
    "/organizations/:orgId/sessions/:sessionId/attachments/:attachmentId/transcribe",
    modelLimiter,
    route(async (request, response) => {
      const transcript = await service.transcribeAttachment(
        request.principal.uid,
        identifier(request, "orgId"),
        identifier(request, "sessionId"),
        identifier(request, "attachmentId"),
      );
      response.json({ transcript });
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
    ...revocationChecked,
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
    ...revocationChecked,
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
      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError(400, "INVALID_REQUEST", "The request is invalid.");
      }
      response.json({
        sessions: await service.listSessions(
          request.principal.uid,
          identifier(request, "orgId"),
          parsed.data.status,
        ),
      });
    }),
  );

  router.get(
    "/organizations/:orgId/eod-settings",
    route(async (request, response) => {
      response.json({
        settings: await service.getEodSettings(request.principal.uid, identifier(request, "orgId")),
      });
    }),
  );

  router.put(
    "/organizations/:orgId/eod-settings",
    ...sensitive,
    validateBody(organizationEodSettingsSchema),
    route(async (request, response) => {
      response.json({
        settings: await service.updateEodSettings(
          request.principal.uid,
          identifier(request, "orgId"),
          organizationEodSettingsSchema.parse(request.body),
        ),
      });
    }),
  );

  router.get(
    "/organizations/:orgId/eod-status/:localDate",
    route(async (request, response) => {
      const localDate = localDateSchema.parse(request.params.localDate);
      response.json({
        status: await service.getEodStatus(
          request.principal.uid,
          identifier(request, "orgId"),
          localDate,
        ),
      });
    }),
  );

  router.get(
    "/organizations/:orgId/eod-submission-count/:localDate",
    route(async (request, response) => {
      const localDate = localDateSchema.parse(request.params.localDate);
      response.json({
        submittedCount: await service.getEodSubmissionCount(
          request.principal.uid,
          identifier(request, "orgId"),
          localDate,
        ),
      });
    }),
  );

  router.put(
    "/organizations/:orgId/eod-status/:localDate",
    validateBody(organizationEodStatusSchema),
    route(async (request, response) => {
      const localDate = localDateSchema.parse(request.params.localDate);
      response.json({
        status: await service.updateEodStatus(
          request.principal.uid,
          identifier(request, "orgId"),
          localDate,
          organizationEodStatusSchema.parse(request.body),
        ),
      });
    }),
  );

  router.post(
    "/organizations/:orgId/memory/ask",
    modelLimiter,
    validateBody(organizationMemoryAskSchema),
    route(async (request, response) => {
      const body = organizationMemoryAskSchema.parse(request.body);
      response.json(
        await service.askOrganizationMemory(
          request.principal.uid,
          identifier(request, "orgId"),
          body.query,
        ),
      );
    }),
  );

  router.post(
    "/organizations/:orgId/memory/index",
    modelLimiter,
    validateBody(buildMemoryIndexSchema),
    route(async (request, response) => {
      const body = buildMemoryIndexSchema.parse(request.body);
      response.json(
        await service.buildMemoryIndex(
          request.principal.uid,
          identifier(request, "orgId"),
          body.limit,
        ),
      );
    }),
  );

  router.post(
    "/organizations/:orgId/sessions",
    validateBody(createSessionSchema),
    route(async (request, response) => {
      const { title, captureType } = createSessionSchema.parse(request.body);
      const session = await service.createSession(
        request.principal.uid,
        identifier(request, "orgId"),
        title,
        captureType,
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
    (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
      void (async () => {
        const body = createMessageSchema.parse(request.body);
        const orgId = identifier(request, "orgId");
        const sessionId = identifier(request, "sessionId");
        await service.assertSessionWritable(request.principal.uid, orgId, sessionId);

        const abortController = new AbortController();
        const abortIfDisconnected = () => {
          if (!response.writableEnded) abortController.abort();
        };
        request.once("aborted", abortIfDisconnected);
        response.once("close", abortIfDisconnected);
        const startedAt = Date.now();
        let firstChunkLatencyMs: number | null = null;
        const writeEvent = (event: object) => {
          if (!response.writableEnded) response.write(`${JSON.stringify(event)}\n`);
        };

        response.status(201);
        response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
        response.setHeader("Cache-Control", "no-store, no-transform");
        response.setHeader("X-Accel-Buffering", "no");
        response.flushHeaders();
        try {
          writeEvent({ type: "start", requestId: body.requestId });
          const exchange = await service.streamMessage(
            request.principal.uid,
            orgId,
            sessionId,
            body.requestId,
            body.content,
            (text) => {
              if (firstChunkLatencyMs === null) firstChunkLatencyMs = Date.now() - startedAt;
              writeEvent({ type: "chunk", text });
            },
            abortController.signal,
            body.attachmentIds ?? [],
          );
          console.log(JSON.stringify({
            severity: "INFO",
            event: "organization_stream_complete",
            requestId: request.requestId,
            durationMs: Date.now() - startedAt,
            firstChunkLatencyMs,
            status: 201,
          }));
          writeEvent({ type: "complete", exchange });
          response.end();
        } catch (error) {
          const aborted = abortController.signal.aborted ||
            (error instanceof Error && (error.name === "AbortError" || error.message === "AbortError"));
          if (aborted) {
            response.end();
            return;
          }
          const appError = error instanceof AppError ? error : null;
          console.error(JSON.stringify({
            severity: "ERROR",
            event: "organization_stream_error",
            requestId: request.requestId,
            durationMs: Date.now() - startedAt,
            status: appError?.status ?? 500,
            code: appError?.code ?? "INTERNAL_ERROR",
          }));
          writeEvent({
            type: "error",
            status: appError?.status ?? 500,
            code: appError?.code ?? "INTERNAL_ERROR",
            message: appError?.publicMessage ?? "The shared reflection could not be completed.",
          });
          response.end();
        } finally {
          request.off("aborted", abortIfDisconnected);
          response.off("close", abortIfDisconnected);
        }
      })().catch(next);
    },
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

  router.post(
    "/organizations/:orgId/sessions/:sessionId/archive",
    ...revocationChecked,
    route(async (request, response) => {
      const session = await service.archiveSession(
        request.principal.uid,
        identifier(request, "orgId"),
        identifier(request, "sessionId"),
      );
      response.json({ session });
    }),
  );

  router.post(
    "/organizations/:orgId/sessions/:sessionId/restore",
    ...revocationChecked,
    route(async (request, response) => {
      const session = await service.restoreSession(
        request.principal.uid,
        identifier(request, "orgId"),
        identifier(request, "sessionId"),
      );
      response.json({ session });
    }),
  );

  router.delete(
    "/organizations/:orgId/sessions/:sessionId",
    ...revocationChecked,
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
