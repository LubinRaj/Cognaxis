import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InMemoryOrganizationRepository } from "../../src/server/data/in-memory-organization-repository.js";
import { InMemoryPlatformUserRepository } from "../../src/server/data/in-memory-platform-user-repository.js";
import { InMemoryUsageRepository } from "../../src/server/data/in-memory-usage-repository.js";
import { PlatformAdminService } from "../../src/server/services/platform-admin-service.js";

const NOW = new Date("2026-09-03T10:00:00.000Z");
const REASON = "Routine operational access review.";

// Lets a test run a state change between a caller's decision to mutate and the repository's
// transactional apply, modelling a concurrent admin request that commits first.
class RacingPlatformUserRepository extends InMemoryPlatformUserRepository {
  beforeMutation: (() => Promise<void>) | null = null;

  override async applyAdminMutation(
    ...args: Parameters<InMemoryPlatformUserRepository["applyAdminMutation"]>
  ) {
    if (this.beforeMutation) {
      const hook = this.beforeMutation;
      this.beforeMutation = null;
      await hook();
    }
    return super.applyAdminMutation(...args);
  }
}

function createContext() {
  const clock = () => NOW;
  const platformUsers = new RacingPlatformUserRepository(clock);
  const organizations = new InMemoryOrganizationRepository(clock);
  platformUsers.linkOrganizations(organizations);
  const usage = new InMemoryUsageRepository();
  const service = new PlatformAdminService(platformUsers, organizations, usage, clock);
  return { platformUsers, organizations, usage, service };
}

async function seedAdmins(context: ReturnType<typeof createContext>) {
  context.platformUsers.seed({ uid: "user_root", platformRole: "super_admin" });
  context.platformUsers.seed({ uid: "user_second", platformRole: "super_admin" });
  context.platformUsers.seed({ uid: "user_target" });
  await context.platformUsers.initializeAccessControl(2);
}

describe("transactional actor recheck", () => {
  it("denies a mutation whose actor is not an active super admin at commit time", async () => {
    const context = createContext();
    await seedAdmins(context);
    context.platformUsers.seed({ uid: "user_plain" });

    await expect(
      context.service.setUserStatus(
        "user_plain",
        "user_target",
        { status: "suspended", reason: REASON },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect((await context.platformUsers.get("user_target"))?.status).toBe("active");
  });

  it("defeats an in-flight mutation from an admin demoted concurrently", async () => {
    const context = createContext();
    await seedAdmins(context);

    // Root demotes the second admin after that admin's request started but before it commits.
    context.platformUsers.beforeMutation = async () => {
      await context.service.setUserRole(
        "user_root",
        "user_second",
        { role: "user", reason: REASON },
        randomUUID(),
      );
    };

    await expect(
      context.service.setUserStatus(
        "user_second",
        "user_target",
        { status: "suspended", reason: REASON },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect((await context.platformUsers.get("user_target"))?.status).toBe("active");

    const audit = await context.platformUsers.listAdminAudit(null, 20);
    expect(audit.events.filter((event) => event.eventType === "platformUser.statusChanged")).toHaveLength(0);
  });

  it("records audit transitions from the state inside the transaction, never a stale snapshot", async () => {
    const context = createContext();
    await seedAdmins(context);

    // A concurrent request already applied the identical change; the second must not write a
    // duplicate or misleading audit event.
    context.platformUsers.beforeMutation = async () => {
      await context.service.setUserStatus(
        "user_root",
        "user_target",
        { status: "suspended", reason: REASON },
        randomUUID(),
      );
    };

    const result = await context.service.setUserStatus(
      "user_root",
      "user_target",
      { status: "suspended", reason: REASON },
      randomUUID(),
    );
    expect(result.status).toBe("suspended");

    const audit = await context.platformUsers.listAdminAudit(null, 20);
    const statusEvents = audit.events.filter(
      (event) => event.eventType === "platformUser.statusChanged",
    );
    expect(statusEvents).toHaveLength(1);
    expect(statusEvents[0]?.changes).toEqual([
      { field: "status", from: "active", to: "suspended" },
    ]);
  });
});

describe("access-control counter states", () => {
  it("fails closed when the counter was never initialized", async () => {
    const context = createContext();
    context.platformUsers.seed({ uid: "user_root", platformRole: "super_admin" });
    context.platformUsers.seed({ uid: "user_target" });

    await expect(
      context.service.setUserStatus(
        "user_root",
        "user_target",
        { status: "suspended", reason: REASON },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 409, code: "ACCESS_CONTROL_UNINITIALIZED" });
  });

  it("protects the last active super admin even when the counter overstates safety", async () => {
    const context = createContext();
    context.platformUsers.seed({ uid: "user_root", platformRole: "super_admin" });
    context.platformUsers.seed({ uid: "user_second", platformRole: "super_admin" });
    await context.platformUsers.initializeAccessControl(1);

    await expect(
      context.service.setUserRole(
        "user_root",
        "user_second",
        { role: "user", reason: REASON },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 409, code: "LAST_SUPER_ADMIN" });
  });
});

describe("bootstrapFirstAdmin", () => {
  it("promotes an existing user and writes a counter of one on a fresh deployment", async () => {
    const context = createContext();
    context.platformUsers.seed({ uid: "user_first" });

    const result = await context.platformUsers.bootstrapFirstAdmin("user_first");

    expect(result.activeSuperAdminCount).toBe(1);
    expect(await context.platformUsers.getActiveSuperAdminCount()).toBe(1);
    const promoted = await context.platformUsers.get("user_first");
    expect(promoted).toMatchObject({ platformRole: "super_admin", status: "active" });
  });

  it("refuses a target that has never signed in", async () => {
    const context = createContext();
    await expect(context.platformUsers.bootstrapFirstAdmin("user_ghost")).rejects.toThrow(
      "TARGET_NOT_FOUND",
    );
    expect(await context.platformUsers.getActiveSuperAdminCount()).toBeNull();
  });

  it("replaces a stale counter with the actual count of active super admins", async () => {
    const context = createContext();
    context.platformUsers.seed({ uid: "user_existing", platformRole: "super_admin" });
    context.platformUsers.seed({ uid: "user_new" });
    // A wrong counter (for example after a counter document loss) must be corrected, never
    // trusted or written back as zero.
    await context.platformUsers.initializeAccessControl(0);

    const result = await context.platformUsers.bootstrapFirstAdmin("user_new");

    expect(result.activeSuperAdminCount).toBe(2);
    expect(await context.platformUsers.getActiveSuperAdminCount()).toBe(2);
  });

  it("stays correct when run twice for the same user", async () => {
    const context = createContext();
    context.platformUsers.seed({ uid: "user_first" });

    await context.platformUsers.bootstrapFirstAdmin("user_first");
    const rerun = await context.platformUsers.bootstrapFirstAdmin("user_first");

    expect(rerun.activeSuperAdminCount).toBe(1);
    expect(await context.platformUsers.getActiveSuperAdminCount()).toBe(1);
  });
});

describe("atomic organization status changes", () => {
  async function seedOrganization(context: ReturnType<typeof createContext>) {
    const organization = await context.organizations.createWithOwner({
      name: "Synthetic Org",
      description: null,
      ownerUid: "user_owner",
      requestId: randomUUID(),
    });
    return organization.id;
  }

  it("suspends with an audit event recording the actual previous status", async () => {
    const context = createContext();
    await seedAdmins(context);
    const orgId = await seedOrganization(context);

    const updated = await context.service.setOrganizationStatus(
      "user_root",
      orgId,
      { status: "suspended", reason: REASON },
      randomUUID(),
    );
    expect(updated.status).toBe("suspended");

    const audit = await context.platformUsers.listAdminAudit(null, 20);
    const events = audit.events.filter(
      (event) => event.eventType === "organization.statusChanged",
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.changes).toEqual([{ field: "status", from: "active", to: "suspended" }]);
  });

  it("writes no duplicate audit when the status is already what was requested", async () => {
    const context = createContext();
    await seedAdmins(context);
    const orgId = await seedOrganization(context);

    await context.service.setOrganizationStatus(
      "user_root",
      orgId,
      { status: "suspended", reason: REASON },
      randomUUID(),
    );
    await context.service.setOrganizationStatus(
      "user_root",
      orgId,
      { status: "suspended", reason: REASON },
      randomUUID(),
    );

    const audit = await context.platformUsers.listAdminAudit(null, 20);
    expect(
      audit.events.filter((event) => event.eventType === "organization.statusChanged"),
    ).toHaveLength(1);
  });

  it("denies the change and leaves the organization untouched for a non-admin actor", async () => {
    const context = createContext();
    await seedAdmins(context);
    context.platformUsers.seed({ uid: "user_plain" });
    const orgId = await seedOrganization(context);

    await expect(
      context.service.setOrganizationStatus(
        "user_plain",
        orgId,
        { status: "suspended", reason: REASON },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });

    expect((await context.organizations.getOrganization(orgId))?.status).toBe("active");
    const audit = await context.platformUsers.listAdminAudit(null, 20);
    expect(
      audit.events.filter((event) => event.eventType === "organization.statusChanged"),
    ).toHaveLength(0);
  });

  it("returns not found for an unknown organization without writing audit", async () => {
    const context = createContext();
    await seedAdmins(context);

    await expect(
      context.service.setOrganizationStatus(
        "user_root",
        "org_missing",
        { status: "suspended", reason: REASON },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect((await context.platformUsers.listAdminAudit(null, 20)).events).toHaveLength(0);
  });
});
