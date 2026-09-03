import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { requireVerifiedEmail } from "../middleware/require-verified-email.js";
import { requireActivePlatformUser } from "../middleware/require-platform-user.js";
import { validateBody } from "../middleware/validate.js";
import type { TokenVerifier } from "../types.js";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import type { SignalService } from "../services/signal-service.js";
import type { InsightService } from "../services/insight-service.js";
import { AppError } from "../errors.js";
import {
  upsertSignalSchema,
  updatePreferencesSchema,
  type UpsertSignalInput,
  type UpdatePreferencesInput,
} from "../../shared/schemas.js";

export function createPersonalRoutes(
  verifier: TokenVerifier,
  signalService: SignalService,
  insightService: InsightService,
): Router {
  const router = Router();
  router.use(authenticate(verifier));
  router.use(requireVerifiedEmail);
  router.use(requireActivePlatformUser);

  router.get("/me/capabilities", (_req, res, next) => {
    try {
      res.json({
        platformRole: _req.platformUser?.platformRole ?? "user",
        status: _req.platformUser?.status ?? "active",
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/personal/preferences", async (req, res, next) => {
    try {
      const db = getFirestore();
      const doc = await db
        .collection("users")
        .doc(req.principal.uid)
        .collection("settings")
        .doc("preferences")
        .get();
      if (!doc.exists) {
        res.json({
          timezone: "UTC",
          weekStartsOn: "monday",
          insightRangeDays: 7,
        });
        return;
      }
      res.json(doc.data());
    } catch (error) {
      next(error);
    }
  });

  router.put("/personal/preferences", validateBody(updatePreferencesSchema), async (req, res, next) => {
    try {
      const db = getFirestore();
      const body = req.body as UpdatePreferencesInput;
      const ref = db
        .collection("users")
        .doc(req.principal.uid)
        .collection("settings")
        .doc("preferences");
      await ref.set(
        {
          ...body,
          updatedAt: FieldValue.serverTimestamp(),
          schemaVersion: 1,
        },
        { merge: true },
      );
      res.json({ status: "updated", preferences: body });
    } catch (error) {
      next(error);
    }
  });

  router.get("/personal/signals", async (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 30, 100);
      const signals = await signalService.listSignals(req.principal.uid, limit);
      res.json({ signals });
    } catch (error) {
      next(error);
    }
  });

function paramId(val: unknown): string {
  if (typeof val === "string" && val.length > 0) return val;
  if (Array.isArray(val) && typeof val[0] === "string") return val[0];
  throw new AppError(400, "INVALID_RESOURCE_ID", "The resource identifier is invalid.");
}

  router.get("/sessions/:sessionId/signals", async (req, res, next) => {
    try {
      const sessionId = paramId(req.params.sessionId);
      const signal = await signalService.getSignal(req.principal.uid, sessionId);
      if (!signal) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Signal not found" } });
        return;
      }
      res.json(signal);
    } catch (error) {
      next(error);
    }
  });

  router.put("/sessions/:sessionId/signals", validateBody(upsertSignalSchema), async (req, res, next) => {
    try {
      const sessionId = paramId(req.params.sessionId);
      const signal = await signalService.upsertSignal(
        req.principal.uid,
        sessionId,
        req.body as UpsertSignalInput,
      );
      res.json(signal);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/sessions/:sessionId/signals", async (req, res, next) => {
    try {
      const sessionId = paramId(req.params.sessionId);
      await signalService.deleteSignal(req.principal.uid, sessionId);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.get("/personal/insights", async (req, res, next) => {
    try {
      const periodType = req.query.periodType === "day" ? "day" : "week";
      const insights = await insightService.listInsights(req.principal.uid, periodType, 20);
      res.json({ insights });
    } catch (error) {
      next(error);
    }
  });

  router.get("/personal/insights/:periodType/:periodKey", async (req, res, next) => {
    try {
      const periodKey = paramId(req.params.periodKey);
      const insight = await insightService.getInsight(req.principal.uid, periodKey);
      if (!insight) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Insight not found" } });
        return;
      }
      res.json(insight);
    } catch (error) {
      next(error);
    }
  });

  router.post("/personal/insights/:periodType/:periodKey/generate", async (req, res, next) => {
    try {
      const periodKey = paramId(req.params.periodKey);
      const type = req.params.periodType === "day" ? "day" : "week";
      const insight = await insightService.generateInsight(req.principal.uid, type, periodKey);
      res.json(insight);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
