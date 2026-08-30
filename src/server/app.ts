import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express, { type ErrorRequestHandler, type Request } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import type { AppConfig } from "./config/env.js";
import { AppError } from "./errors.js";
import { requestContext } from "./middleware/request-context.js";
import { createJournalRouter } from "./routes/journal-routes.js";
import type { JournalService } from "./services/journal-service.js";
import type { TokenVerifier } from "./types.js";

export type AppDependencies = {
  config: AppConfig;
  verifier: TokenVerifier;
  journalService: JournalService;
};

type RequestWithContext = Request & { requestId?: string };

export async function createApp(dependencies: AppDependencies) {
  const { config, verifier, journalService } = dependencies;
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(requestContext);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          imgSrc: ["'self'", "data:", "blob:", "https://images.unsplash.com", "https://*.googleusercontent.com"],
          connectSrc: [
            "'self'",
            "https://identitytoolkit.googleapis.com",
            "https://securetoken.googleapis.com",
            "https://*.googleapis.com",
            "https://*.run.app",
          ],
          frameSrc: ["'self'", "https://accounts.google.com", "https://*.firebaseapp.com"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: config.NODE_ENV === "development" ? ["*"] : ["'none'"],
        },
      },
      frameguard: config.NODE_ENV !== "development" ? { action: "deny" } : false,
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
          (config.NODE_ENV === "development" &&
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
      methods: ["GET", "POST", "DELETE", "OPTIONS"],
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

  app.use("/api/v1", createJournalRouter(journalService, verifier));

  if (config.NODE_ENV === "production") {
    const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
    const clientDirectory = path.resolve(currentDirectory, "../../../dist/client");
    app.use(express.static(clientDirectory, { index: false, etag: true, maxAge: "1h" }));
    app.get("/{*path}", (_request, response) => {
      response.setHeader("cache-control", "no-cache");
      response.sendFile(path.join(clientDirectory, "index.html"));
    });
  } else if (config.NODE_ENV === "development") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { 
        middlewareMode: true, 
        hmr: { port: 0 } 
      },
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
        route: request.path,
        status,
        code,
        errorType: error instanceof Error ? error.name : "UnknownError",
      }),
    );

    response.status(status).json({ error: { code, message, requestId } });
  };
  app.use(errorHandler);

  return app;
}
