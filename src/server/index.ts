import { createApp } from "./app.js";
import { FirebaseTokenVerifier } from "./auth/firebase-token-verifier.js";
import { loadConfig } from "./config/env.js";
import { FirestoreJournalRepository } from "./data/firestore-journal-repository.js";
import { FirestorePlatformUserRepository } from "./data/firestore-platform-user-repository.js";
import { FirestorePreferencesRepository } from "./data/firestore-preferences-repository.js";
import { FirestoreSignalRepository } from "./data/firestore-signal-repository.js";
import { FirestoreInsightRepository } from "./data/firestore-insight-repository.js";
import { FirestoreOrganizationRepository } from "./data/firestore-organization-repository.js";
import { FirestoreOrganizationWorkspaceRepository } from "./data/firestore-organization-workspace-repository.js";
import {
  GeminiConversationModel,
  organizationSystemInstruction,
} from "./services/conversation-model.js";
import { FirestoreUsageRepository } from "./data/firestore-usage-repository.js";
import { OrganizationService } from "./services/organization-service.js";
import { PlatformAdminService } from "./services/platform-admin-service.js";
import { UsageRecorder } from "./services/usage-recorder.js";
import { DashboardService } from "./services/dashboard-service.js";
import { GeminiInsightModel } from "./services/insight-model.js";
import { InsightInvalidationService, InsightService } from "./services/insight-service.js";
import { JournalService } from "./services/journal-service.js";
import { PlatformUserService } from "./services/platform-user-service.js";
import { SignalService } from "./services/signal-service.js";
import { EnvSecretProvider } from "./services/secret-provider.js";
import { startServer } from "./start.js";

try {
  process.loadEnvFile?.(".env.local");
} catch {
  // .env.local is optional
}

const config = loadConfig();
const verifier = new FirebaseTokenVerifier(config);
const repository = new FirestoreJournalRepository();
const secrets = new EnvSecretProvider(config);
const model = new GeminiConversationModel(config, secrets);
const signalRepository = new FirestoreSignalRepository();
const preferencesRepository = new FirestorePreferencesRepository();
const insightRepository = new FirestoreInsightRepository();
const usageRepository = new FirestoreUsageRepository();
const usageRecorder = new UsageRecorder(usageRepository);
const insightInvalidation = new InsightInvalidationService(insightRepository, preferencesRepository);
const signalService = new SignalService(
  signalRepository,
  repository,
  undefined,
  insightInvalidation,
);
const insightService = new InsightService(
  insightRepository,
  signalRepository,
  repository,
  preferencesRepository,
  new GeminiInsightModel(config, secrets),
  undefined,
  usageRecorder,
  config.GEMINI_MODEL,
);
const journalService = new JournalService(
  repository,
  model,
  [
    (uid, sessionId) => signalService.removeForDeletedSession(uid, sessionId),
    (uid, sessionId) => insightInvalidation.onSessionDeleted(uid, sessionId),
  ],
  [(uid, sessionCreatedAt) => insightInvalidation.onContentChanged(uid, sessionCreatedAt)],
  usageRecorder,
);
const dashboardService = new DashboardService(signalRepository, repository, preferencesRepository);
const platformUserRepository = new FirestorePlatformUserRepository();
const platformUserService = new PlatformUserService(platformUserRepository);
const organizationRepository = new FirestoreOrganizationRepository();
const organizationService = new OrganizationService(
  organizationRepository,
  new FirestoreOrganizationWorkspaceRepository(),
  platformUserRepository,
  new GeminiConversationModel(config, secrets, organizationSystemInstruction),
  undefined,
  usageRecorder,
);
const platformAdminService = new PlatformAdminService(
  platformUserRepository,
  organizationRepository,
  usageRepository,
);

const app = await createApp({
  config,
  verifier,
  journalService,
  platformUserService,
  signalService,
  dashboardService,
  insightService,
  organizationService,
  platformAdminService,
});

const server = startServer(app, config.PORT, () => {
  console.log(JSON.stringify({ severity: "INFO", event: "server_started", port: config.PORT }));
});

function shutdown(signal: string) {
  console.log(JSON.stringify({ severity: "INFO", event: "server_stopping", signal }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
