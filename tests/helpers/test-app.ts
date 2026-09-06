import { onTestFailed, vi } from "vitest";
import type { JournalMessage, SummaryOutput } from "../../src/shared/schemas.js";
import { createApp } from "../../src/server/app.js";
import { loadConfig, type AppConfig } from "../../src/server/config/env.js";
import { InMemoryInsightRepository } from "../../src/server/data/in-memory-insight-repository.js";
import { InMemoryAttachmentRepository } from "../../src/server/data/in-memory-attachment-repository.js";
import { InMemoryJournalRepository } from "../../src/server/data/in-memory-journal-repository.js";
import { InMemoryOrganizationRepository } from "../../src/server/data/in-memory-organization-repository.js";
import { InMemoryOrganizationWorkspaceRepository } from "../../src/server/data/in-memory-organization-workspace-repository.js";
import { InMemoryPlatformUserRepository } from "../../src/server/data/in-memory-platform-user-repository.js";
import { InMemoryPreferencesRepository } from "../../src/server/data/in-memory-preferences-repository.js";
import { InMemorySignalRepository } from "../../src/server/data/in-memory-signal-repository.js";
import { InMemoryUsageRepository } from "../../src/server/data/in-memory-usage-repository.js";
import type { ConversationModel } from "../../src/server/services/conversation-model.js";
import { DashboardService } from "../../src/server/services/dashboard-service.js";
import type { InsightModel, InsightModelInput } from "../../src/server/services/insight-model.js";
import {
  InsightInvalidationService,
  InsightService,
} from "../../src/server/services/insight-service.js";
import { JournalService } from "../../src/server/services/journal-service.js";
import { OrganizationService } from "../../src/server/services/organization-service.js";
import { PlatformAdminService } from "../../src/server/services/platform-admin-service.js";
import { PlatformUserService } from "../../src/server/services/platform-user-service.js";
import { SignalService } from "../../src/server/services/signal-service.js";
import { UsageRecorder } from "../../src/server/services/usage-recorder.js";
import type { AuthenticatedPrincipal, TokenVerifier } from "../../src/server/types.js";

const nowSeconds = Math.floor(Date.now() / 1_000);

// A synthetic stand-in for Firebase Admin verification. Tokens of the form `token-<uid>` decode to
// a verified principal for that uid; every other value rejects, exactly as an unverifiable token
// does in production.
export class TestVerifier implements TokenVerifier {
  readonly checks: boolean[] = [];

  async verify(token: string, checkRevoked = false): Promise<AuthenticatedPrincipal> {
    this.checks.push(checkRevoked);
    if (!token.startsWith("token-")) throw new Error("invalid token");
    const uid = token.slice("token-".length);
    return {
      uid,
      email: `${uid}@example.test`,
      emailVerified: true,
      signInProvider: "password",
      issuedAt: nowSeconds,
      authTime: nowSeconds,
    };
  }
}

export class TestModel implements ConversationModel {
  calls = 0;
  lastMessages: JournalMessage[] = [];

  async reply(messages: JournalMessage[]): Promise<string> {
    this.calls += 1;
    this.lastMessages = structuredClone(messages);
    return "A grounded response for the authenticated journal.";
  }

  async *replyStream(messages: JournalMessage[], signal?: AbortSignal): AsyncIterable<string> {
    this.calls += 1;
    this.lastMessages = structuredClone(messages);
    if (signal?.aborted) throw new Error("AbortError");
    yield "A grounded ";
    yield "response for the authenticated journal.";
  }

  async summarize(): Promise<SummaryOutput> {
    this.calls += 1;
    return {
      title: "Reflection summary",
      summary: "A synthetic summary containing no private fixture data.",
      themes: ["clarity"],
      nextSteps: ["Write the next thought."],
    };
  }
}

export class TestInsightModel implements InsightModel {
  calls = 0;
  lastInput: InsightModelInput | null = null;
  nextOutput: unknown = null;
  failure: Error | null = null;

  async generateNarrative(input: InsightModelInput): Promise<unknown> {
    this.calls += 1;
    this.lastInput = input;
    if (this.failure) throw this.failure;
    if (this.nextOutput !== null) return this.nextOutput;
    return {
      title: "A steady period",
      overview: "A synthetic overview grounded only in the supplied records.",
      patterns:
        input.evidence.length > 0
          ? [
              {
                observation: "Reflections in this period shared a calm, focused tone.",
                evidenceSessionIds: [input.evidence[0].sessionId],
                confidence: "medium",
              },
            ]
          : [],
      highlights: ["A synthetic highlight."],
      nextSteps: ["Write the next thought."],
    };
  }
}

// Silences the server's structured error log during a test, but replays every captured line when
// the test fails so a bare status mismatch always comes with the server's own error code.
export function spyOnServerLogs() {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  onTestFailed(() => {
    for (const call of errorSpy.mock.calls) {
      console.log("SERVER-LOG:", ...(call as unknown[]));
    }
  });
  return errorSpy;
}

export function testConfig(environment: Record<string, string> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: "test",
    APP_ORIGIN: "https://cognaxis.test",
    GEMINI_MODEL: "test-model",
    ...environment,
  });
}

export type TestAppOverrides = {
  environment?: Record<string, string>;
  verifier?: TokenVerifier;
  model?: ConversationModel;
  insightModel?: InsightModel;
  repository?: InMemoryJournalRepository;
  platformUsers?: InMemoryPlatformUserRepository;
  signals?: InMemorySignalRepository;
  preferences?: InMemoryPreferencesRepository;
  insights?: InMemoryInsightRepository;
  organizations?: InMemoryOrganizationRepository;
  organizationWorkspace?: InMemoryOrganizationWorkspaceRepository;
  usage?: InMemoryUsageRepository;
  now?: () => Date;
};

export async function createTestApp(overrides: TestAppOverrides = {}) {
  const config = testConfig(overrides.environment);
  const repository = overrides.repository ?? new InMemoryJournalRepository();
  const platformUsers = overrides.platformUsers ?? new InMemoryPlatformUserRepository();
  const signals = overrides.signals ?? new InMemorySignalRepository(overrides.now);
  const preferences = overrides.preferences ?? new InMemoryPreferencesRepository(overrides.now);
  const insights = overrides.insights ?? new InMemoryInsightRepository(overrides.now);
  const verifier = overrides.verifier ?? new TestVerifier();
  const model = overrides.model ?? new TestModel();
  const insightModel = overrides.insightModel ?? new TestInsightModel();

  const usage = overrides.usage ?? new InMemoryUsageRepository();
  const usageRecorder = new UsageRecorder(usage, overrides.now);
  const attachments = new InMemoryAttachmentRepository();

  const invalidation = new InsightInvalidationService(insights, preferences, overrides.now);
  const signalService = new SignalService(signals, repository, overrides.now, invalidation);
  const insightService = new InsightService(
    insights,
    signals,
    repository,
    preferences,
    insightModel,
    overrides.now,
    usageRecorder,
    config.GEMINI_MODEL,
  );
  const journalService = new JournalService(
    repository,
    model,
    [
      (uid, sessionId) => signalService.removeForDeletedSession(uid, sessionId),
      (uid, sessionId) => invalidation.onSessionDeleted(uid, sessionId),
      (uid, sessionId) => attachments.deleteForSession({ type: "personal", scopeId: uid }, sessionId),
    ],
    [(uid, sessionCreatedAt) => invalidation.onContentChanged(uid, sessionCreatedAt)],
    usageRecorder,
    attachments,
  );
  const dashboardService = new DashboardService(signals, repository, preferences, overrides.now);
  const organizations = overrides.organizations ?? new InMemoryOrganizationRepository(overrides.now);
  platformUsers.linkOrganizations(organizations);
  const organizationWorkspace =
    overrides.organizationWorkspace ??
    new InMemoryOrganizationWorkspaceRepository(overrides.now, organizations);
  const organizationService = new OrganizationService(
    organizations,
    organizationWorkspace,
    platformUsers,
    model,
    overrides.now,
    usageRecorder,
    attachments,
  );
  const platformAdminService = new PlatformAdminService(
    platformUsers,
    organizations,
    usage,
    overrides.now,
  );

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

  return {
    app,
    config,
    repository,
    platformUsers,
    signals,
    preferences,
    insights,
    organizations,
    organizationWorkspace,
    usage,
    verifier,
    model,
    insightModel,
    attachments,
  };
}
