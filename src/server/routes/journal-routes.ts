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
      void (async () => {
        const { content, requestId } = createMessageSchema.parse(request.body);
        const targetSessionId = sessionId(request);

        // Preserve the same owner-scoped 404 boundary as every other private route before
        // committing a successful streaming response. This is one Firestore document read.
        await service.assertSessionWritable(request.principal.uid, targetSessionId);

        const abortController = new AbortController();
        const abortIfDisconnected = () => {
          if (!response.writableEnded) abortController.abort();
        };
        request.once("aborted", abortIfDisconnected);
        response.once("close", abortIfDisconnected);

        const startTime = Date.now();
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
          writeEvent({ type: "start", requestId });

          const exchange = await service.streamMessage(
            request.principal.uid,
            targetSessionId,
            requestId,
            content,
            (text) => {
              if (firstChunkLatencyMs === null) firstChunkLatencyMs = Date.now() - startTime;
              writeEvent({ type: "chunk", text });
            },
            abortController.signal,
          );

          console.log(
            JSON.stringify({
              severity: "INFO",
              event: "journal_stream_complete",
              requestId: request.requestId,
              durationMs: Date.now() - startTime,
              firstChunkLatencyMs,
              status: 201,
            }),
          );
          writeEvent({ type: "complete", exchange });
          response.end();
        } catch (error) {
          const aborted = abortController.signal.aborted ||
            (error instanceof Error && error.name === "AbortError");
          if (aborted) {
            console.log(
              JSON.stringify({
                severity: "INFO",
                event: "journal_stream_aborted",
                requestId: request.requestId,
                durationMs: Date.now() - startTime,
              }),
            );
            response.end();
            return;
          }

          const appError = error instanceof AppError ? error : null;
          console.error(
            JSON.stringify({
              severity: "ERROR",
              event: "journal_stream_error",
              requestId: request.requestId,
              durationMs: Date.now() - startTime,
              status: appError?.status ?? 500,
              code: appError?.code ?? "INTERNAL_ERROR",
            }),
          );
          writeEvent({
            type: "error",
            status: appError?.status ?? 500,
            code: appError?.code ?? "INTERNAL_ERROR",
            message: appError?.publicMessage ?? "The reflection could not be completed.",
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
