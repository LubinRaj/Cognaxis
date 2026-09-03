import express from "express";
import { getAuth } from "firebase-admin/auth";
import { createApp } from "../../../src/server/app.js";
import { FirebaseTokenVerifier } from "../../../src/server/auth/firebase-token-verifier.js";
import { loadConfig } from "../../../src/server/config/env.js";
import { InMemoryInsightRepository } from "../../../src/server/data/in-memory-insight-repository.js";
import { InMemoryJournalRepository } from "../../../src/server/data/in-memory-journal-repository.js";
import { InMemoryOrganizationRepository } from "../../../src/server/data/in-memory-organization-repository.js";
import { InMemoryOrganizationWorkspaceRepository } from "../../../src/server/data/in-memory-organization-workspace-repository.js";
import { InMemoryPlatformUserRepository } from "../../../src/server/data/in-memory-platform-user-repository.js";
import { InMemoryPreferencesRepository } from "../../../src/server/data/in-memory-preferences-repository.js";
import { InMemorySignalRepository } from "../../../src/server/data/in-memory-signal-repository.js";
import { InMemoryUsageRepository } from "../../../src/server/data/in-memory-usage-repository.js";
import { DashboardService } from "../../../src/server/services/dashboard-service.js";
import {
  InsightInvalidationService,
  InsightService,
} from "../../../src/server/services/insight-service.js";
import { JournalService } from "../../../src/server/services/journal-service.js";
import { OrganizationService } from "../../../src/server/services/organization-service.js";
import { PlatformAdminService } from "../../../src/server/services/platform-admin-service.js";
import { PlatformUserService } from "../../../src/server/services/platform-user-service.js";
import { SignalService } from "../../../src/server/services/signal-service.js";
import { UsageRecorder } from "../../../src/server/services/usage-recorder.js";
import { startServer } from "../../../src/server/start.js";
import {
  DeterministicConversationModel,
  DeterministicInsightModel,
} from "./deterministic-models.js";
import {
  AUTH_EMULATOR_HOST,
  E2E_BASE_URL,
  E2E_PROJECT_ID,
  E2E_SERVER_PORT,
  SUPER_ADMIN,
} from "./env.js";

// The end-to-end server is the real application: the production createApp pipeline, middleware,
// CSP, rate limits, and static client serving. Only the outermost integrations are substituted
// through the existing dependency-injection seams — in-memory repositories, deterministic Gemini
// models, and Firebase Auth verification against the local emulator. NODE_ENV=production is used
// so the compiled client in dist/client is served exactly as it is in the container.

if (process.env.FIREBASE_AUTH_EMULATOR_HOST !== AUTH_EMULATOR_HOST) {
  throw new Error(
    `The end-to-end server refuses to start without FIREBASE_AUTH_EMULATOR_HOST=${AUTH_EMULATOR_HOST}.`,
  );
}
if (!E2E_PROJECT_ID.startsWith("demo-")) {
  throw new Error("The end-to-end project id must keep its demo- prefix.");
}
// Never let ambient Google credentials leak into the test process.
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

// The configuration is built from fixed literals rather than process.env so nothing from the
// developer's shell (real project ids, secret names) can reach the test server.
const config = loadConfig({
  NODE_ENV: "production",
  PORT: String(E2E_SERVER_PORT),
  APP_ORIGIN: E2E_BASE_URL,
  GOOGLE_CLOUD_PROJECT: E2E_PROJECT_ID,
  GEMINI_MODEL: "e2e-deterministic-model",
  GEMINI_API_KEY_SECRET: `projects/${E2E_PROJECT_ID}/secrets/e2e-placeholder/versions/1`,
  FIREBASE_AUTH_DOMAIN: `${E2E_PROJECT_ID}.firebaseapp.com`,
});

const verifier = new FirebaseTokenVerifier(config);
const model = new DeterministicConversationModel();
const insightModel = new DeterministicInsightModel();

const repository = new InMemoryJournalRepository();
const platformUsers = new InMemoryPlatformUserRepository();
const signals = new InMemorySignalRepository();
const preferences = new InMemoryPreferencesRepository();
const insights = new InMemoryInsightRepository();
const usage = new InMemoryUsageRepository();
const usageRecorder = new UsageRecorder(usage);

const invalidation = new InsightInvalidationService(insights, preferences);
const signalService = new SignalService(signals, repository, undefined, invalidation);
const insightService = new InsightService(
  insights,
  signals,
  repository,
  preferences,
  insightModel,
  undefined,
  usageRecorder,
  config.GEMINI_MODEL,
);
const journalService = new JournalService(
  repository,
  model,
  [
    (uid, sessionId) => signalService.removeForDeletedSession(uid, sessionId),
    (uid, sessionId) => invalidation.onSessionDeleted(uid, sessionId),
  ],
  [(uid, sessionCreatedAt) => invalidation.onContentChanged(uid, sessionCreatedAt)],
  usageRecorder,
);
const dashboardService = new DashboardService(signals, repository, preferences);
const organizations = new InMemoryOrganizationRepository();
platformUsers.linkOrganizations(organizations);
const organizationWorkspace = new InMemoryOrganizationWorkspaceRepository(undefined, organizations);
const organizationService = new OrganizationService(
  organizations,
  organizationWorkspace,
  platformUsers,
  model,
  undefined,
  usageRecorder,
);
const platformAdminService = new PlatformAdminService(platformUsers, organizations, usage);

async function waitForAuthEmulator(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://${AUTH_EMULATOR_HOST}/`);
      if (response.ok) return;
    } catch {
      // The emulator is still starting; poll again.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("The Firebase Auth emulator did not become reachable.");
}

async function seedSuperAdmin(): Promise<void> {
  try {
    await getAuth().createUser({
      uid: SUPER_ADMIN.uid,
      email: SUPER_ADMIN.email,
      password: SUPER_ADMIN.password,
      emailVerified: true,
    });
  } catch (error) {
    const code = (error as { errorInfo?: { code?: string } }).errorInfo?.code;
    if (code !== "auth/uid-already-exists" && code !== "auth/email-already-exists") throw error;
  }
  await platformUsers.getOrCreate({
    uid: SUPER_ADMIN.uid,
    email: SUPER_ADMIN.email,
    displayName: "E2E Super Admin",
    providerId: "password",
    emailVerified: true,
  });
  await platformUsers.bootstrapFirstAdmin(SUPER_ADMIN.uid);
}

const app = await createApp({
  config,
  verifier,
  journalService,
  platformUserService: new PlatformUserService(platformUsers),
  signalService,
  dashboardService,
  insightService,
  organizationService,
  platformAdminService,
});

// The browser must reach the Auth emulator over plain loopback HTTP, which the production CSP
// rightly forbids. The header is widened here, outside the application, so the production policy
// itself stays untouched.
const outer = express();
outer.use((_request, response, next) => {
  const original = response.setHeader.bind(response);
  const patched: typeof response.setHeader = (name, value) => {
    if (
      typeof name === "string" &&
      name.toLowerCase() === "content-security-policy" &&
      typeof value === "string"
    ) {
      return original(name, value.replace("connect-src", `connect-src http://${AUTH_EMULATOR_HOST}`));
    }
    return original(name, value);
  };
  response.setHeader = patched;
  next();
});
outer.use(app);

await waitForAuthEmulator();
await seedSuperAdmin();
startServer(outer, config.PORT, () => {
  console.log(
    JSON.stringify({ severity: "INFO", event: "e2e_server_started", port: config.PORT }),
  );
});
