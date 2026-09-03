import { describe, expect, it } from "vitest";
import { InMemoryPlatformUserRepository } from "../../src/server/data/in-memory-platform-user-repository.js";
import { PlatformUserService } from "../../src/server/services/platform-user-service.js";
import type { AuthenticatedPrincipal } from "../../src/server/types.js";

const BASE_TIME = Date.parse("2026-09-03T10:00:00.000Z");

function principal(overrides: Partial<AuthenticatedPrincipal> = {}): AuthenticatedPrincipal {
  return {
    uid: "user_alpha",
    email: "alpha@example.test",
    emailVerified: true,
    signInProvider: "password",
    issuedAt: Math.floor(BASE_TIME / 1_000),
    authTime: Math.floor(BASE_TIME / 1_000),
    ...overrides,
  };
}

function createService(startTime = BASE_TIME) {
  let currentTime = startTime;
  const clock = () => new Date(currentTime);
  const repository = new InMemoryPlatformUserRepository(clock);
  const service = new PlatformUserService(repository, clock);
  const advance = (milliseconds: number) => {
    currentTime += milliseconds;
  };
  return { repository, service, advance };
}

describe("PlatformUserService", () => {
  it("creates a platform user from verified claims on first contact", async () => {
    const { service } = createService();

    const user = await service.resolveActiveUser(principal());

    expect(user).toMatchObject({
      uid: "user_alpha",
      email: "alpha@example.test",
      displayName: null,
      providerIds: ["password"],
      emailVerified: true,
      platformRole: "user",
      status: "active",
      schemaVersion: 1,
    });
    expect(user.firstSeenAt).toBe(new Date(BASE_TIME).toISOString());
  });

  it("returns the stored user on later requests without changing the role", async () => {
    const { repository, service } = createService();
    repository.seed({ uid: "user_alpha", platformRole: "super_admin" });

    const user = await service.resolveActiveUser(principal());

    expect(user.platformRole).toBe("super_admin");
  });

  it("rejects a suspended user without updating activity metadata", async () => {
    const { repository, service, advance } = createService();
    repository.seed({ uid: "user_alpha", status: "suspended" });
    advance(60 * 60 * 1_000);

    await expect(service.resolveActiveUser(principal())).rejects.toMatchObject({
      status: 403,
      code: "ACCOUNT_SUSPENDED",
    });
    const stored = await repository.get("user_alpha");
    expect(stored?.lastSeenAt).toBe(new Date(BASE_TIME).toISOString());
  });

  it("refreshes identity metadata from token claims when it changes", async () => {
    const { repository, service } = createService();
    repository.seed({ uid: "user_alpha", email: "old@example.test", emailVerified: false });

    const user = await service.resolveActiveUser(principal({ displayName: "Alpha" }));

    expect(user.email).toBe("alpha@example.test");
    expect(user.displayName).toBe("Alpha");
    expect(user.emailVerified).toBe(true);
    expect(await repository.get("user_alpha")).toMatchObject({ email: "alpha@example.test" });
  });

  it("accumulates newly seen sign-in providers without duplicates", async () => {
    const { service } = createService();
    await service.resolveActiveUser(principal());
    await service.resolveActiveUser(principal({ signInProvider: "google.com" }));
    const user = await service.resolveActiveUser(principal({ signInProvider: "google.com" }));

    expect(user.providerIds).toEqual(["password", "google.com"]);
  });

  it("throttles last-seen writes to at most one per fifteen minutes", async () => {
    const { repository, service, advance } = createService();
    await service.resolveActiveUser(principal());

    advance(14 * 60 * 1_000);
    await service.resolveActiveUser(principal());
    expect((await repository.get("user_alpha"))?.lastSeenAt).toBe(
      new Date(BASE_TIME).toISOString(),
    );

    advance(2 * 60 * 1_000);
    await service.resolveActiveUser(principal());
    expect((await repository.get("user_alpha"))?.lastSeenAt).toBe(
      new Date(BASE_TIME + 16 * 60 * 1_000).toISOString(),
    );
  });

  it("stores no journal content, scores, or location fields", async () => {
    const { service } = createService();
    const user = await service.resolveActiveUser(principal());

    expect(Object.keys(user).sort()).toEqual([
      "createdAt",
      "displayName",
      "email",
      "emailVerified",
      "firstSeenAt",
      "lastSeenAt",
      "lastSeenWriteAt",
      "platformRole",
      "providerIds",
      "schemaVersion",
      "status",
      "uid",
      "updatedAt",
    ]);
  });
});
