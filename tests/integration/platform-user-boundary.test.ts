import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { InMemoryJournalRepository } from "../../src/server/data/in-memory-journal-repository.js";
import { InMemoryPlatformUserRepository } from "../../src/server/data/in-memory-platform-user-repository.js";
import { TestModel, createTestApp, spyOnServerLogs } from "../helpers/test-app.js";

const errorResponseSchema = z.object({ error: z.object({ code: z.string() }) });

const capabilitiesSchema = z.object({
  capabilities: z.object({
    platformRole: z.enum(["user", "super_admin"]),
    status: z.enum(["active", "suspended"]),
    features: z.object({
      insights: z.boolean(),
      maps: z.boolean(),
      organizations: z.boolean(),
      admin: z.boolean(),
    }),
  }),
});

function errorCode(text: string): string {
  return errorResponseSchema.parse(JSON.parse(text)).error.code;
}

describe("platform user boundary", () => {
  beforeEach(() => {
    spyOnServerLogs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an active platform user record on the first verified request", async () => {
    const { app, platformUsers } = await createTestApp();

    await request(app)
      .get("/api/v1/sessions")
      .set("authorization", "Bearer token-user_alpha")
      .expect(200);

    const record = await platformUsers.get("user_alpha");
    expect(record).toMatchObject({
      uid: "user_alpha",
      email: "user_alpha@example.test",
      platformRole: "user",
      status: "active",
      emailVerified: true,
    });
  });

  it("denies a suspended platform user on every private route", async () => {
    const platformUsers = new InMemoryPlatformUserRepository();
    platformUsers.seed({ uid: "user_alpha", status: "suspended" });
    const model = new TestModel();
    const { app, repository } = await createTestApp({ platformUsers, model });

    const routes = [
      { method: "get" as const, path: "/api/v1/me/capabilities" },
      { method: "get" as const, path: "/api/v1/sessions" },
      { method: "post" as const, path: "/api/v1/sessions" },
      { method: "get" as const, path: "/api/v1/sessions/abc123456789" },
      { method: "post" as const, path: "/api/v1/sessions/abc123456789/messages" },
      { method: "post" as const, path: "/api/v1/sessions/abc123456789/summarize" },
      { method: "delete" as const, path: "/api/v1/sessions/abc123456789" },
    ];

    for (const routeCase of routes) {
      const response = await request(app)
        [routeCase.method](routeCase.path)
        .set("authorization", "Bearer token-user_alpha")
        .send(routeCase.method === "post" ? {} : undefined);
      expect(response.status).toBe(403);
      expect(errorCode(response.text)).toBe("ACCOUNT_SUSPENDED");
    }

    expect(model.calls).toBe(0);
    expect(await repository.listSessions("user_alpha", 10)).toHaveLength(0);
  });

  it("reports capabilities for an ordinary user without exposing admin features", async () => {
    const { app } = await createTestApp();

    const response = await request(app)
      .get("/api/v1/me/capabilities")
      .set("authorization", "Bearer token-user_alpha")
      .expect(200);

    expect(response.headers["cache-control"]).toBe("private, no-store");
    const { capabilities } = capabilitiesSchema.parse(JSON.parse(response.text));
    expect(capabilities.platformRole).toBe("user");
    expect(capabilities.status).toBe("active");
    expect(capabilities.features.admin).toBe(false);
    expect(capabilities.features.insights).toBe(true);
    expect(capabilities.features.organizations).toBe(true);
  });

  it("reports the admin feature only for an active super admin", async () => {
    const platformUsers = new InMemoryPlatformUserRepository();
    platformUsers.seed({ uid: "user_root", platformRole: "super_admin" });
    const { app } = await createTestApp({ platformUsers });

    const response = await request(app)
      .get("/api/v1/me/capabilities")
      .set("authorization", "Bearer token-user_root")
      .expect(200);

    const { capabilities } = capabilitiesSchema.parse(JSON.parse(response.text));
    expect(capabilities.platformRole).toBe("super_admin");
    expect(capabilities.features.admin).toBe(true);
  });

  it("reflects disabled feature flags in capabilities", async () => {
    const { app } = await createTestApp({
      environment: { FEATURE_ORGANIZATIONS: "false", FEATURE_MAPS: "false" },
    });

    const response = await request(app)
      .get("/api/v1/me/capabilities")
      .set("authorization", "Bearer token-user_alpha")
      .expect(200);

    const { capabilities } = capabilitiesSchema.parse(JSON.parse(response.text));
    expect(capabilities.features.organizations).toBe(false);
    expect(capabilities.features.maps).toBe(false);
    expect(capabilities.features.insights).toBe(true);
  });

  it("does not include capability data for another user", async () => {
    const platformUsers = new InMemoryPlatformUserRepository();
    platformUsers.seed({ uid: "user_root", platformRole: "super_admin" });
    const { app } = await createTestApp({ platformUsers });

    const response = await request(app)
      .get("/api/v1/me/capabilities")
      .set("authorization", "Bearer token-user_other")
      .expect(200);

    const { capabilities } = capabilitiesSchema.parse(JSON.parse(response.text));
    expect(capabilities.platformRole).toBe("user");
    expect(capabilities.features.admin).toBe(false);
    expect(response.text).not.toContain("user_root");
  });
});

describe("sanitized error logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the route template and error category without messages or stack traces", async () => {
    class FailingRepository extends InMemoryJournalRepository {
      override listSessions(): never {
        throw new Error("secret-internal-path /users/user_alpha/personalSessions");
      }
    }
    const errorSpy = spyOnServerLogs();
    const { app } = await createTestApp({ repository: new FailingRepository() });

    const response = await request(app)
      .get("/api/v1/sessions")
      .set("authorization", "Bearer token-user_alpha")
      .expect(500);

    expect(errorCode(response.text)).toBe("INTERNAL_ERROR");
    expect(response.text).not.toContain("secret-internal-path");

    const loggedLines = errorSpy.mock.calls.map((call) => String(call[0]));
    expect(loggedLines.length).toBeGreaterThan(0);
    for (const line of loggedLines) {
      const parsed = z.record(z.string(), z.unknown()).parse(JSON.parse(line));
      expect(parsed.route).toBe("/api/v1/sessions");
      expect(Object.keys(parsed)).not.toContain("stack");
      expect(Object.keys(parsed)).not.toContain("errorMessage");
      expect(line).not.toContain("secret-internal-path");
    }
  });
});

describe("browser security headers", () => {
  it("ships the documented feature-gated Maps allowlist", async () => {
    const { app } = await createTestApp({
      environment: { FIREBASE_AUTH_DOMAIN: "cognaxis.firebaseapp.com" },
    });

    const response = await request(app).get("/api/health").expect(200);
    const policy = response.headers["content-security-policy"];
    expect(policy).toBeDefined();

    const directives = new Map(
      policy.split(";").map((entry) => {
        const [name, ...values] = entry.trim().split(/\s+/);
        return [name, values] as const;
      }),
    );

    // The allowlist variant documented by Google requires both values. They are introduced only
    // when Maps is enabled; the no-Maps production policy remains strict.
    expect(directives.get("script-src")).toContain("'unsafe-inline'");
    expect(directives.get("script-src")).toContain("'unsafe-eval'");
    expect(directives.get("script-src")).toContain("https://*.googleapis.com");
    expect(directives.get("worker-src")).toContain("blob:");
    expect(directives.get("frame-src")).toContain("https://cognaxis.firebaseapp.com");
    expect(directives.get("frame-src")).not.toContain("https://*.firebaseapp.com");
    expect(directives.get("connect-src")).not.toContain("https://*.run.app");
    expect(directives.get("object-src")).toEqual(["'none'"]);
    expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
  });

  it("omits the Maps origins when the maps feature is disabled", async () => {
    const { app } = await createTestApp({ environment: { FEATURE_MAPS: "false" } });

    const response = await request(app).get("/api/health").expect(200);
    const policy = response.headers["content-security-policy"];
    expect(policy).not.toContain("maps.googleapis.com");
    expect(policy).toContain("script-src 'self';");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).not.toContain("script-src 'self' 'unsafe-eval'");
  });

  it("permits the mutation methods used by the private API in preflight", async () => {
    const { app } = await createTestApp();

    const response = await request(app)
      .options("/api/v1/sessions/abc123456789/signals")
      .set("origin", "https://cognaxis.test")
      .set("access-control-request-method", "PUT")
      .expect(204);

    const allowed = String(response.headers["access-control-allow-methods"]);
    expect(allowed).toContain("PUT");
    expect(allowed).toContain("PATCH");
    expect(allowed).toContain("DELETE");
  });
});
