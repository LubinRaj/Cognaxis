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
    (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
      const { content, requestId } = createMessageSchema.parse(request.body);
      
      const abortController = new AbortController();
      request.on("close", () => abortController.abort());

      response.status(201);
      response.setHeader("Content-Type", "application/json-lines");
      response.setHeader("Cache-Control", "no-store, no-transform");
      response.setHeader("X-Accel-Buffering", "no");

      service
        .streamMessage(
          request.principal.uid,
          sessionId(request),
          requestId,
          content,
          (userMessage) => {
            response.write(JSON.stringify({ type: "start", userMessage }) + "\n");
          },
          (text) => {
            response.write(JSON.stringify({ type: "chunk", text }) + "\n");
          },
          abortController.signal,
        )
        .then((exchange) => {
          response.write(JSON.stringify({ type: "complete", exchange }) + "\n");
          response.end();
        })
        .catch((error) => {
          if (abortController.signal.aborted || (error as Error).name === "AbortError") {
            response.end();
            return;
          }
          if (response.headersSent) {
            console.error(
              JSON.stringify({
                severity: "ERROR",
                requestId: (request as any).requestId,
                method: request.method,
                route: request.route?.path,
                status: 500,
                code: "INTERNAL_ERROR",
                errorType: error instanceof Error ? error.name : "UnknownError",
              })
            );
            response.write(
              JSON.stringify({
                type: "error",
                message: error instanceof AppError ? error.message : "Internal stream error",
              }) + "\n",
            );
            response.end();
          } else {
            next(error);
          }
        });
    },
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
