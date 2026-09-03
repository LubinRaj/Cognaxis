import { Router, type NextFunction, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { addDays, localDateOf } from "../../shared/dates.js";
import {
  documentIdSchema,
  generateInsightSchema,
  localDateSchema,
  updatePreferencesSchema,
  upsertSignalSchema,
} from "../../shared/schemas.js";
import type { AppConfig } from "../config/env.js";
import { AppError } from "../errors.js";
import { requireFeature } from "../middleware/require-feature.js";
import { validateBody } from "../middleware/validate.js";
import type { DashboardService } from "../services/dashboard-service.js";
import type { InsightService } from "../services/insight-service.js";
import type { SignalService } from "../services/signal-service.js";
import type { AuthenticatedRequest } from "../types.js";

const dashboardQuerySchema = z
  .object({
    rangeDays: z.coerce.number().pipe(z.union([z.literal(7), z.literal(30), z.literal(90)])),
  })
  .strict();

const periodsQuerySchema = z
  .object({
    type: z.enum(["day", "week"]),
    limit: z.coerce.number().int().min(1).max(20).default(10),
  })
  .strict();

const mapPointsQuerySchema = z
  .object({
    from: localDateSchema.optional(),
    to: localDateSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(200),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "from must not be after to",
  });

const periodTypeSchema = z.enum(["day", "week"]);
const periodKeyPattern = /^[A-Za-z0-9_-]{5,24}$/;

function periodKey(request: AuthenticatedRequest): string {
  const value = request.params.periodKey;
  if (typeof value !== "string" || !periodKeyPattern.test(value)) {
    throw new AppError(400, "INVALID_RESOURCE_ID", "The resource identifier is invalid.");
  }
  return value;
}

function sessionId(request: AuthenticatedRequest): string {
  const parsed = documentIdSchema.safeParse(request.params.sessionId);
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
// by the shared private pipeline in app.ts before this router runs. Every handler derives the
// owner exclusively from the verified principal.
export function createPersonalRouter(
  config: AppConfig,
  signalService: SignalService,
  dashboardService: DashboardService,
  insightService: InsightService,
): Router {
  const router = Router();

  // AI generation is far more expensive than a read, so it carries its own tighter per-user limit
  // on top of the shared private-pipeline limit.
  const generationLimiter = rateLimit({
    windowMs: 15 * 60 * 1_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (request) => request.principal.uid,
    message: {
      error: { code: "RATE_LIMITED", message: "Please wait before creating more insights." },
    },
  });

  router.get(
    "/personal/preferences",
    route(async (request, response) => {
      const preferences = await dashboardService.getPreferences(request.principal.uid);
      response.json({ preferences });
    }),
  );

  router.put(
    "/personal/preferences",
    validateBody(updatePreferencesSchema),
    route(async (request, response) => {
      const preferences = await dashboardService.updatePreferences(
        request.principal.uid,
        updatePreferencesSchema.parse(request.body),
      );
      response.json({ preferences });
    }),
  );

  router.get(
    "/sessions/:sessionId/signals",
    route(async (request, response) => {
      const signal = await signalService.getForSession(request.principal.uid, sessionId(request));
      response.json({ signal });
    }),
  );

  router.put(
    "/sessions/:sessionId/signals",
    validateBody(upsertSignalSchema),
    route(async (request, response) => {
      const outcome = await signalService.upsert(
        request.principal.uid,
        sessionId(request),
        upsertSignalSchema.parse(request.body),
      );
      response.json(outcome);
    }),
  );

  router.delete(
    "/sessions/:sessionId/signals",
    route(async (request, response) => {
      await signalService.remove(request.principal.uid, sessionId(request));
      response.status(204).end();
    }),
  );

  router.get(
    "/personal/map-points",
    requireFeature(config, "FEATURE_MAPS"),
    route(async (request, response) => {
      const parsed = mapPointsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError(400, "INVALID_REQUEST", "The request is invalid.");
      }
      // The default window ends on the user's own current day: local dates are stored in the
      // user's saved timezone, so a UTC-derived "tomorrow" would either miss or invent a day.
      const timezone = (await dashboardService.getPreferences(request.principal.uid)).timezone;
      const to = parsed.data.to ?? localDateOf(new Date(), timezone);
      const from = parsed.data.from ?? addDays(to, -89);
      const points = await signalService.listMapPoints(
        request.principal.uid,
        from,
        to,
        parsed.data.limit,
      );
      response.json({ points });
    }),
  );

  router.get(
    "/personal/insights/dashboard",
    requireFeature(config, "FEATURE_INSIGHTS"),
    route(async (request, response) => {
      const parsed = dashboardQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError(400, "INVALID_REQUEST", "The request is invalid.");
      }
      const [dashboard, recentInsights] = await Promise.all([
        dashboardService.getDashboard(request.principal.uid, parsed.data.rangeDays),
        insightService.recent(request.principal.uid),
      ]);
      response.json({ dashboard, recentInsights });
    }),
  );

  router.get(
    "/personal/insights/periods",
    requireFeature(config, "FEATURE_INSIGHTS"),
    route(async (request, response) => {
      const parsed = periodsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError(400, "INVALID_REQUEST", "The request is invalid.");
      }
      const insights = await insightService.list(
        request.principal.uid,
        parsed.data.type,
        parsed.data.limit,
      );
      response.json({ insights });
    }),
  );

  router.post(
    "/personal/insights/:periodType/:periodKey/generate",
    requireFeature(config, "FEATURE_INSIGHTS"),
    generationLimiter,
    validateBody(generateInsightSchema),
    route(async (request, response) => {
      const parsedType = periodTypeSchema.safeParse(request.params.periodType);
      if (!parsedType.success) {
        throw new AppError(400, "INVALID_RESOURCE_ID", "The resource identifier is invalid.");
      }
      const body = generateInsightSchema.parse(request.body);
      const result = await insightService.generate(
        request.principal.uid,
        parsedType.data,
        periodKey(request),
        body.requestId,
        body.regenerate,
      );
      response.json(result);
    }),
  );

  router.delete(
    "/personal/insights/:periodKey",
    requireFeature(config, "FEATURE_INSIGHTS"),
    route(async (request, response) => {
      await insightService.delete(request.principal.uid, periodKey(request));
      response.status(204).end();
    }),
  );

  return router;
}
