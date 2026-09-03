import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { JournalMessage, SummaryOutput } from "../../src/shared/schemas.js";
import { createApp } from "../../src/server/app.js";
import type { AppConfig } from "../../src/server/config/env.js";
import { InMemoryJournalRepository } from "../../src/server/data/in-memory-journal-repository.js";
import type { ConversationModel } from "../../src/server/services/conversation-model.js";
import { JournalService } from "../../src/server/services/journal-service.js";
import type { SignalService } from "../../src/server/services/signal-service.js";
import type { InsightService } from "../../src/server/services/insight-service.js";
import type { AuthenticatedPrincipal, TokenVerifier } from "../../src/server/types.js";

const nowSeconds = Math.floor(Date.now() / 1_000);
const errorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), requestId: z.string().optional() }),
});

const VERIFIED_PASSWORD_TOKEN = "verified-password";
const VERIFIED_GOOGLE_TOKEN = "verified-google";
const UNVERIFIED_PASSWORD_TOKEN = "unverified-password";
const EXPIRED_TOKEN = "expired";
const WRONG_PROJECT_TOKEN = "wrong-project";
const REVOKED_TOKEN = "revoked";

// A synthetic stand-in for Firebase Admin verification. Only the tokens listed here decode; every
// other value rejects, exactly as an unverifiable token does in production.
class MatrixVerifier implements TokenVerifier {
  readonly revocationChecks: boolean[] = [];

  async verify(token: string, checkRevoked = false): Promise<AuthenticatedPrincipal> {
    this.revocationChecks.push(checkRevoked);

    if (token === EXPIRED_TOKEN) throw new Error("auth/id-token-expired");
    if (token === WRONG_PROJECT_TOKEN) throw new Error("auth/argument-error");
    if (token === REVOKED_TOKEN && checkRevoked) throw new Error("auth/id-token-revoked");

    switch (token) {
      case VERIFIED_PASSWORD_TOKEN:
        return principal("user_verified", true, "password");
      case VERIFIED_GOOGLE_TOKEN:
        return principal("user_google", true, "google.com");
      case UNVERIFIED_PASSWORD_TOKEN:
        return principal("user_unverified", false, "password");
      case REVOKED_TOKEN:
        return principal("user_revoked", true, "password");
      default:
        throw new Error("auth/argument-error");
    }
  }
}

function principal(uid: string, emailVerified: boolean, provider: string): AuthenticatedPrincipal {
  return {
    uid,
    email: `${uid}@example.test`,
    emailVerified,
    signInProvider: provider,
    issuedAt: nowSeconds,
    authTime: nowSeconds,
  };
}

class RecordingModel implements ConversationModel {
  calls = 0;

  async reply(_messages: JournalMessage[]): Promise<string> {
    this.calls += 1;
    return "A grounded response for the authenticated journal.";
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

const config: AppConfig = {
  NODE_ENV: "test",
  PORT: 3000,
  APP_ORIGIN: "https://cognaxis.test",
  GEMINI_MODEL: "test-model",
};

describe("verified email authorization boundary", () => {
  let repository: InMemoryJournalRepository;
  let verifier: MatrixVerifier;
  let model: RecordingModel;
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    repository = new InMemoryJournalRepository();
    verifier = new MatrixVerifier();
    model = new RecordingModel();
    app = await createApp({
      config,
      verifier,
      journalService: new JournalService(repository, model),
      signalService: {} as unknown as SignalService,
      insightService: {} as unknown as InsightService,
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const protectedRoutes = [
    { method: "get" as const, path: "/api/v1/sessions" },
    { method: "post" as const, path: "/api/v1/sessions" },
    { method: "get" as const, path: "/api/v1/sessions/abc123" },
    { method: "post" as const, path: "/api/v1/sessions/abc123/messages" },
    { method: "post" as const, path: "/api/v1/sessions/abc123/summarize" },
    { method: "delete" as const, path: "/api/v1/sessions/abc123" },
  ];

  it("rejects every unusable token with a generic 401", async () => {
    const badTokens = ["", "forged", EXPIRED_TOKEN, WRONG_PROJECT_TOKEN, "a.b.c"];

    for (const token of badTokens) {
      const response = await request(app)
        .get("/api/v1/sessions")
        .set("authorization", `Bearer ${token}`);
      expect(response.status).toBe(401);
      expect(errorResponseSchema.parse(JSON.parse(response.text)).error.code).toBe(
        "UNAUTHENTICATED",
      );
    }
  });

  it("rejects a missing or malformed authorization header", async () => {
    await request(app).get("/api/v1/sessions").expect(401);
    await request(app).get("/api/v1/sessions").set("authorization", "token-only").expect(401);
    await request(app).get("/api/v1/sessions").set("authorization", "Basic abc123").expect(401);
    await request(app)
      .get("/api/v1/sessions")
      .set("authorization", "Bearer has spaces")
      .expect(401);
  });

  it("denies an unverified email account on every private route", async () => {
    for (const route of protectedRoutes) {
      const response = await request(app)
        [route.method](route.path)
        .set("authorization", `Bearer ${UNVERIFIED_PASSWORD_TOKEN}`)
        .send(route.method === "get" || route.method === "delete" ? undefined : {});

      expect(response.status).toBe(403);
      expect(errorResponseSchema.parse(JSON.parse(response.text)).error.code).toBe(
        "EMAIL_VERIFICATION_REQUIRED",
      );
    }
  });

  it("denies an unverified account before any repository or model call runs", async () => {
    await request(app)
      .post("/api/v1/sessions")
      .set("authorization", `Bearer ${UNVERIFIED_PASSWORD_TOKEN}`)
      .send({ title: "Should never be stored" })
      .expect(403);

    await request(app)
      .post("/api/v1/sessions/abc123/messages")
      .set("authorization", `Bearer ${UNVERIFIED_PASSWORD_TOKEN}`)
      .send({ content: "Should never reach the model." })
      .expect(403);

    expect(model.calls).toBe(0);
    expect(await repository.listSessions("user_unverified", 10)).toHaveLength(0);
  });

  it("allows a verified email and password account", async () => {
    const created = await request(app)
      .post("/api/v1/sessions")
      .set("authorization", `Bearer ${VERIFIED_PASSWORD_TOKEN}`)
      .send({ title: "Verified reflection" })
      .expect(201);

    expect(created.status).toBe(201);
    expect(await repository.listSessions("user_verified", 10)).toHaveLength(1);
  });

  it("allows a verified Google account", async () => {
    await request(app)
      .get("/api/v1/sessions")
      .set("authorization", `Bearer ${VERIFIED_GOOGLE_TOKEN}`)
      .expect(200);
  });

  it("ignores client-supplied identity and verification fields", async () => {
    const spoofed = [
      { title: "Attempt", uid: "user_verified" },
      { title: "Attempt", emailVerified: true },
      { title: "Attempt", email: "user_verified@example.test" },
      { title: "Attempt", signInProvider: "google.com" },
      { title: "Attempt", principal: { uid: "user_verified", emailVerified: true } },
    ];

    for (const body of spoofed) {
      const response = await request(app)
        .post("/api/v1/sessions")
        .set("authorization", `Bearer ${UNVERIFIED_PASSWORD_TOKEN}`)
        .send(body);

      expect([400, 403]).toContain(response.status);
      expect(response.status).not.toBe(201);
    }

    expect(await repository.listSessions("user_verified", 10)).toHaveLength(0);
    expect(await repository.listSessions("user_unverified", 10)).toHaveLength(0);
  });

  it("rejects a header that claims verification", async () => {
    await request(app)
      .get("/api/v1/sessions")
      .set("authorization", `Bearer ${UNVERIFIED_PASSWORD_TOKEN}`)
      .set("x-email-verified", "true")
      .set("x-uid", "user_verified")
      .expect(403);
  });

  it("checks revocation on the destructive route", async () => {
    const created = await request(app)
      .post("/api/v1/sessions")
      .set("authorization", `Bearer ${VERIFIED_PASSWORD_TOKEN}`)
      .send({})
      .expect(201);
    const sessionId = z
      .object({ session: z.object({ id: z.string() }) })
      .parse(JSON.parse(created.text)).session.id;

    await request(app)
      .delete(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${REVOKED_TOKEN}`)
      .expect(401);

    expect(verifier.revocationChecks).toContain(true);
  });

  it("never returns token claims, emails, or internal detail in an error body", async () => {
    const responses = await Promise.all([
      request(app).get("/api/v1/sessions").set("authorization", "Bearer forged"),
      request(app)
        .get("/api/v1/sessions")
        .set("authorization", `Bearer ${UNVERIFIED_PASSWORD_TOKEN}`),
      request(app).get("/api/v1/sessions").set("authorization", `Bearer ${EXPIRED_TOKEN}`),
    ]);

    for (const response of responses) {
      expect(response.text).not.toContain("@example.test");
      expect(response.text).not.toContain("email_verified");
      expect(response.text).not.toContain("sign_in_provider");
      expect(response.text).not.toContain("auth/");
      expect(response.text).not.toContain("Error:");
      expect(response.text).not.toMatch(/at .*\.ts:\d+/);
    }
  });

  it("keeps verified users isolated from one another", async () => {
    const created = await request(app)
      .post("/api/v1/sessions")
      .set("authorization", `Bearer ${VERIFIED_PASSWORD_TOKEN}`)
      .send({ title: "Private to the password account" })
      .expect(201);
    const sessionId = z
      .object({ session: z.object({ id: z.string() }) })
      .parse(JSON.parse(created.text)).session.id;

    await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${VERIFIED_GOOGLE_TOKEN}`)
      .expect(404);
  });

  it("marks authenticated responses as private and uncacheable", async () => {
    const response = await request(app)
      .get("/api/v1/sessions")
      .set("authorization", `Bearer ${VERIFIED_PASSWORD_TOKEN}`)
      .expect(200);

    expect(response.headers["cache-control"]).toBe("private, no-store");
  });
});
