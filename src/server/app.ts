import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express, { Router, type ErrorRequestHandler, type Request } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import type { AppConfig } from "./config/env.js";
import { AppError } from "./errors.js";
import { authenticate } from "./middleware/authenticate.js";
import { requestContext } from "./middleware/request-context.js";
import { requireActiveUser } from "./middleware/require-active-user.js";
import { requireVerifiedEmail } from "./middleware/require-verified-email.js";
import { createAdminRouter } from "./routes/admin-routes.js";
import { createJournalRouter } from "./routes/journal-routes.js";
import { createMeRouter } from "./routes/me-routes.js";
import { createOrganizationRouter } from "./routes/organization-routes.js";
import { createPersonalRouter } from "./routes/personal-routes.js";
import type { DashboardService } from "./services/dashboard-service.js";
import type { InsightService } from "./services/insight-service.js";
import type { JournalService } from "./services/journal-service.js";
import type { OrganizationService } from "./services/organization-service.js";
import type { PlatformAdminService } from "./services/platform-admin-service.js";
import type { PlatformUserService } from "./services/platform-user-service.js";
import type { SignalService } from "./services/signal-service.js";
import type { TokenVerifier } from "./types.js";

export type AppDependencies = {
  config: AppConfig;
  verifier: TokenVerifier;
  journalService: JournalService;
  platformUserService: PlatformUserService;
  signalService: SignalService;
  dashboardService: DashboardService;
  insightService: InsightService;
  organizationService: OrganizationService;
  platformAdminService: PlatformAdminService;
};

type RequestWithContext = Request & { requestId?: string };

function buildContentSecurityPolicy(config: AppConfig) {
  const development = config.NODE_ENV === "development";

  const scriptSrc = ["'self'"];
  const connectSrc = [
    "'self'",
    "https://identitytoolkit.googleapis.com",
    "https://securetoken.googleapis.com",
  ];
  const imgSrc = ["'self'", "data:", "blob:", "https://*.googleusercontent.com"];
  const frameSrc = [
    "https://accounts.google.com",
    config.FIREBASE_AUTH_DOMAIN ? `https://${config.FIREBASE_AUTH_DOMAIN}` : "https://*.firebaseapp.com",
  ];

  if (development) {
    scriptSrc.push("'unsafe-inline'");
    connectSrc.push("ws:");
  }

  const workerSrc = ["'self'"];

  if (config.FEATURE_MAPS) {
    // The complete allowlist Google documents for the Maps JavaScript API; a narrower list breaks
    // tiles, fonts, or web workers depending on the map mode in use.
    scriptSrc.push(
      "'unsafe-inline'",
      "'unsafe-eval'",
      "https://*.googleapis.com",
      "https://*.gstatic.com",
      "*.google.com",
      "https://*.ggpht.com",
      "*.googleusercontent.com",
      "blob:",
    );
    imgSrc.push("https://*.googleapis.com", "https://*.gstatic.com", "*.google.com");
    connectSrc.push(
      "https://*.googleapis.com",
      "*.google.com",
      "https://*.gstatic.com",
      "data:",
      "blob:",
    );
    frameSrc.push("*.google.com");
    workerSrc.push("blob:");
  }

  const isAiStudio = Boolean(process.env.APPLET_ID);
  const frameAncestors = development
    ? ["*"]
    : isAiStudio
      ? ["'self'", "https://*.google.com", "https://*.corp.google.com:*", "https://localhost.corp.google.com:*", "https://*.run.app"]
      : ["'none'"];

  return {
    defaultSrc: ["'self'"],
    scriptSrc,
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
    imgSrc,
    connectSrc,
    frameSrc,
    workerSrc,
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors,
  };
}

// Errors are logged with the matched route template rather than the concrete URL so private
// resource identifiers stay out of the logs.
function routeTemplate(request: Request): string {
  const original = request.originalUrl.split("?")[0] ?? "/";
  const route: unknown = (request as unknown as { route?: unknown }).route;
  let routePath: string | null = null;
  if (typeof route === "object" && route !== null && "path" in route) {
    const candidate: unknown = route.path;
    if (typeof candidate === "string") routePath = candidate;
  }
  if (!original.startsWith("/api")) {
    return routePath ?? "/";
  }
  const prefix = `/${original.split("/").filter(Boolean).slice(0, 2).join("/")}`;
  if (routePath === null) return prefix;
  return routePath.startsWith(prefix) ? routePath : `${prefix}${routePath}`;
}

export async function createApp(dependencies: AppDependencies) {
  const {
    config,
    verifier,
    journalService,
    platformUserService,
    signalService,
    dashboardService,
    insightService,
    organizationService,
    platformAdminService,
  } = dependencies;
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(requestContext);
  app.use(
    helmet({
      contentSecurityPolicy: { directives: buildContentSecurityPolicy(config) },
      frameguard:
        config.NODE_ENV !== "development" && !process.env.APPLET_ID ? { action: "deny" } : false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
      referrerPolicy: { policy: "no-referrer" },
    }),
  );
  app.use(
    cors({
      origin(origin, callback) {
        if (
          !origin ||
          origin === config.APP_ORIGIN ||
          ((config.NODE_ENV === "development" || Boolean(process.env.APPLET_ID)) &&
            (origin.startsWith("http://localhost:") ||
              origin.startsWith("http://127.0.0.1:") ||
              origin.endsWith(".run.app") ||
              origin.endsWith(".google.com") ||
              origin.endsWith(".web.app") ||
              origin.endsWith(".firebaseapp.com")))
        ) {
          callback(null, true);
        } else {
          callback(new AppError(403, "ORIGIN_DENIED", "The request origin is not allowed."));
        }
      },
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["authorization", "content-type", "x-request-id"],
      exposedHeaders: ["x-request-id", "ratelimit", "ratelimit-policy"],
      credentials: false,
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: "32kb", strict: true }));
  app.use(
    "/api",
    rateLimit({
      windowMs: 15 * 60 * 1_000,
      limit: 180,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: { code: "RATE_LIMITED", message: "Please try again later." } },
    }),
  );

  app.get("/api/health", (_request, response) => {
    response.setHeader("cache-control", "no-store");
    response.json({ status: "ok" });
  });

  // One shared pipeline protects every private route: authentication, per-user rate limiting,
  // verified email, active platform status, and non-cacheable responses are all resolved before
  // any feature router runs.
  const privateApi = Router();
  privateApi.use(authenticate(verifier));
  privateApi.use(
    rateLimit({
      windowMs: 60 * 1_000,
      limit: 45,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      keyGenerator: (request) => request.principal.uid,
      message: {
        error: { code: "RATE_LIMITED", message: "Please slow down and try again." },
      },
    }),
  );
  privateApi.use(requireVerifiedEmail);
  privateApi.use(requireActiveUser(platformUserService));
  privateApi.use((_request, response, next) => {
    response.setHeader("cache-control", "private, no-store");
    next();
  });
  privateApi.use(createMeRouter(config));
  privateApi.use(createJournalRouter(journalService, verifier));
  privateApi.use(createPersonalRouter(config, signalService, dashboardService, insightService));
  privateApi.use(createOrganizationRouter(config, organizationService, verifier));
  privateApi.use(createAdminRouter(config, platformAdminService, verifier));
  app.use("/api/v1", privateApi);

  if (config.NODE_ENV === "production") {
    // This file executes as src/server/app.ts in tests and dist-server/server/app.js in the
    // container; both sit exactly two directories below the repository root, where the compiled
    // client lives in dist/client.
    const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
    const clientDirectory = path.resolve(currentDirectory, "../../dist/client");
    app.use(express.static(clientDirectory, { index: false, etag: true, maxAge: "1h" }));
    // A fingerprinted asset that does not exist is a real 404; serving the application HTML for
    // it would mask broken deployments from monitoring.
    app.use("/assets", (_request, response) => {
      response.status(404).json({ error: { code: "NOT_FOUND", message: "Not found." } });
    });
    app.get("/{*path}", (request, response, next) => {
      // Unknown API paths must keep their JSON 404 contract instead of receiving the SPA shell.
      if (request.path.startsWith("/api")) {
        next();
        return;
      }
      response.setHeader("cache-control", "no-cache");
      response.sendFile(path.join(clientDirectory, "index.html"));
    });
  } else if (config.NODE_ENV === "development") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { port: 0 } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.use((_request, response) => {
    response.status(404).json({ error: { code: "NOT_FOUND", message: "Not found." } });
  });

  const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
    const appError = error instanceof AppError ? error : null;
    const status = appError?.status ?? 500;
    const code = appError?.code ?? "INTERNAL_ERROR";
    const message = appError?.publicMessage ?? "The request could not be completed.";
    const requestId = (request as RequestWithContext).requestId;

    console.error(
      JSON.stringify({
        severity: status >= 500 ? "ERROR" : "WARNING",
        requestId,
        method: request.method,
        route: routeTemplate(request),
        status,
        code,
        errorType: error instanceof Error ? error.name : "UnknownError",
      }),
    );

    if (response.headersSent) {
      return _next(error);
    }
    response.status(status).json({ error: { code, message, requestId } });
  };
  app.use(errorHandler);

  return app;
}
