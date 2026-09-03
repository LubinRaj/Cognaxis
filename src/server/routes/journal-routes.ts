import { Router, type NextFunction, type Response } from "express";
import rateLimit from "express-rate-limit";
import {
  createMessageSchema,
  createSessionSchema,
  documentIdSchema,
  listQuerySchema,
} from "../../shared/schemas.js";
import { AppError } from "../errors.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRecentAuthentication } from "../middleware/recent-auth.js";
import { requireVerifiedEmail } from "../middleware/require-verified-email.js";
import { validateBody } from "../middleware/validate.js";
import type { AuthenticatedRequest, TokenVerifier } from "../types.js";
import type { JournalService } from "../services/journal-service.js";

function sessionId(request: AuthenticatedRequest): string {
  const parsed = documentIdSchema.safeParse(request.params.sessionId);
  if (!parsed.success) {
    throw new AppError(400, "INVALID_RESOURCE_ID", "The resource identifier is invalid.");
  }
  return parsed.data;
}

function route(
  handler: (request: AuthenticatedRequest, response: Response) => Promise<void>,
) {
  return (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

// Authentication, per-user rate limiting, verified email, and active platform status are enforced
// by the shared private pipeline in app.ts before this router runs.
export function createJournalRouter(
  service: JournalService,
  verifier: TokenVerifier,
): Router {
  const router = Router();

  // Model-backed routes carry a tighter per-user budget than plain reads. The counter lives in
  // this instance's memory, so the effective platform-wide ceiling scales with instance count;
  // the per-user duplicate protections in the data layer do not depend on it.
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

  router.get(
    "/sessions",
    route(async (request, response) => {
      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError(400, "INVALID_REQUEST", "The request is invalid.");
      }
      response.json({
        sessions: await service.listSessions(request.principal.uid, parsed.data.limit),
      });
    }),
  );

  router.post(
    "/sessions",
    validateBody(createSessionSchema),
    route(async (request, response) => {
      const { title } = createSessionSchema.parse(request.body);
      const session = await service.createSession(request.principal.uid, title);
      response.status(201).json({ session });
    }),
  );

  router.get(
    "/sessions/:sessionId",
    route(async (request, response) => {
      const session = await service.getSession(request.principal.uid, sessionId(request));
      response.json({ session });
    }),
  );

  router.post(
    "/sessions/:sessionId/messages",
    modelLimiter,
    validateBody(createMessageSchema),
    route(async (request, response) => {
      const { content, requestId } = createMessageSchema.parse(request.body);
      const exchange = await service.addMessage(
        request.principal.uid,
        sessionId(request),
        requestId,
        content,
      );
      response.status(201).json(exchange);
    }),
  );

  router.post(
    "/sessions/:sessionId/summarize",
    modelLimiter,
    route(async (request, response) => {
      const summary = await service.summarize(request.principal.uid, sessionId(request));
      response.json({ summary });
    }),
  );

  router.delete(
    "/sessions/:sessionId",
    authenticate(verifier, true),
    requireVerifiedEmail,
    requireRecentAuthentication,
    route(async (request, response) => {
      await service.deleteSession(request.principal.uid, sessionId(request));
      response.status(204).end();
    }),
  );

  return router;
}
