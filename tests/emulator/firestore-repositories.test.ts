import { createHash, randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { emotionLabels, type AuditEvent, type EmotionLabel } from "../../src/shared/schemas.js";
import { addDays } from "../../src/shared/dates.js";
import { periodKeyFor } from "../../src/shared/periods.js";
import { FirestoreJournalRepository } from "../../src/server/data/firestore-journal-repository.js";
import { FirestoreOrganizationRepository } from "../../src/server/data/firestore-organization-repository.js";
import { FirestoreInsightRepository } from "../../src/server/data/firestore-insight-repository.js";
import { FirestorePlatformUserRepository } from "../../src/server/data/firestore-platform-user-repository.js";
import { FirestoreSignalRepository } from "../../src/server/data/firestore-signal-repository.js";
import { FirestorePreferencesRepository } from "../../src/server/data/firestore-preferences-repository.js";
import type { ActorConstraint } from "../../src/server/data/organization-repository.js";
import type { PlatformIdentity } from "../../src/server/data/platform-user-repository.js";
import type { InsightWrite } from "../../src/server/data/insight-repository.js";
import type { ConversationModel } from "../../src/server/services/conversation-model.js";
import { JournalService } from "../../src/server/services/journal-service.js";
import { SignalService } from "../../src/server/services/signal-service.js";
import { InsightInvalidationService } from "../../src/server/services/insight-service.js";

// These tests exercise the production repositories against the real Firestore emulator, so the
// guard below prevents an accidental run against a live project.
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("FIRESTORE_EMULATOR_HOST is not set; run via firebase emulators:exec.");
}

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-cognaxis-e2e" });
}
const firestore = getFirestore();

const OWNER_ACTOR_ROLES: ActorConstraint["allowedRoles"] = ["owner", "admin"];

function uniqueUid(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

function tokenHashFor(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function inviteAudit(createdBy: string): {
  eventType: string;
  targetType: AuditEvent["targetType"];
  targetId: string;
  changes: AuditEvent["changes"];
  requestId: string;
} {
  return {
    eventType: "invite.created",
    targetType: "invite",
    targetId: "pending",
    changes: [{ field: "role", from: null, to: "member" }],
    requestId: `req_${createdBy}`,
  };
}

function identityFor(uid: string): PlatformIdentity {
  return {
    uid,
    email: `${uid}@example.com`,
    displayName: "Emulator User",
    providerId: "password",
    emailVerified: true,
  };
}

const utcToday = new Date().toISOString().slice(0, 10);

function insightWriteFor(uid: string, sessionId: string, localDate: string): InsightWrite {
  return {
    periodType: "day",
    periodKey: periodKeyFor("day", localDate),
    periodStart: localDate,
    periodEndExclusive: addDays(localDate, 1),
    timezone: "UTC",
    sourceSessionIds: [sessionId],
    sourceSignalSessionIds: [],
    sourceFingerprint: `fp_${sessionId}`,
    metrics: {
      reflectionCount: 1,
      checkinCount: 0,
      moodAverage: 4,
      energyAverage: 3,
      moodDeltaFromPrevious: null,
      energyDeltaFromPrevious: null,
      emotionCounts: Object.fromEntries(
        emotionLabels.map((label) => [label, 0]),
      ) as Record<EmotionLabel, number>,
    },
    narrative: {
      title: "Emulator insight",
      overview: "Seeded for cascade and query tests.",
      patterns: [],
      highlights: [],
      nextSteps: [],
      disclaimer: "Not medical advice.",
    },
    generationRequestId: randomUUID(),
    model: "test-model",
    promptVersion: "v1",
    stale: false,
    createdBy: uid,
    scopeType: "personal",
    scopeId: uid,
    schemaVersion: 1,
  };
}

const unusedModel: ConversationModel = {
  reply: () => Promise.reject(new Error("model must not be called")),
  replyStream: async function* () {
    throw new Error("model must not be called");
  },
  summarize: () => Promise.reject(new Error("model must not be called")),
};

// Mirrors the wiring in src/server/index.ts: the same repositories, the same two deletion
// cascade listeners, and the same content-change listener.
function productionComposedServices() {
  const journalRepository = new FirestoreJournalRepository(firestore);
  const signalRepository = new FirestoreSignalRepository(firestore);
  const insightRepository = new FirestoreInsightRepository(firestore);
  const preferencesRepository = new FirestorePreferencesRepository(firestore);
  const insightInvalidation = new InsightInvalidationService(
    insightRepository,
    preferencesRepository,
  );
  const signalService = new SignalService(
    signalRepository,
    journalRepository,
    undefined,
    insightInvalidation,
  );
  const journalService = new JournalService(
    journalRepository,
    unusedModel,
    [
      (uid, sessionId) => signalService.removeForDeletedSession(uid, sessionId),
      (uid, sessionId) => insightInvalidation.onSessionDeleted(uid, sessionId),
    ],
    [(uid, sessionCreatedAt) => insightInvalidation.onContentChanged(uid, sessionCreatedAt)],
  );
  return { journalRepository, signalRepository, insightRepository, signalService, journalService };
}

describe("FirestoreJournalRepository against the emulator", { timeout: 20_000 }, () => {
  const repository = new FirestoreJournalRepository(firestore);

  it("persists a message exchange transactionally and reports messages and count", async () => {
    const uid = uniqueUid("journal");
    const session = await repository.createSession(uid, "Morning reflection");
    expect(session.messageCount).toBe(0);

    const exchange = await repository.saveMessageExchange(uid, session.id, {
      requestId: "req-1",
      userContent: "I felt focused today.",
      assistantContent: "What helped you stay focused?",
      maxMessageCount: 120,
    });
    expect(exchange.messageCount).toBe(2);

    const messages = await repository.listMessages(uid, session.id, 10);
    expect(messages.map((message) => [message.role, message.content])).toEqual([
      ["user", "I felt focused today."],
      ["model", "What helped you stay focused?"],
    ]);
    const stored = await repository.getSession(uid, session.id);
    expect(stored?.messageCount).toBe(2);
  });

  it("replays an identical requestId idempotently without duplicating messages", async () => {
    const uid = uniqueUid("journal");
    const session = await repository.createSession(uid, "Replay check");
    const input = {
      requestId: "req-replay",
      userContent: "Same request twice.",
      assistantContent: "Stored once.",
      maxMessageCount: 120,
    };

    const first = await repository.saveMessageExchange(uid, session.id, input);
    const replay = await repository.saveMessageExchange(uid, session.id, input);

    expect(replay.userMessage.id).toBe(first.userMessage.id);
    expect(replay.assistantMessage.id).toBe(first.assistantMessage.id);
    expect(replay.messageCount).toBe(2);
    expect(await repository.listMessages(uid, session.id, 10)).toHaveLength(2);
  });

  it("keeps the stored exchange when a replayed requestId carries different content", async () => {
    const uid = uniqueUid("journal");
    const session = await repository.createSession(uid, "Conflict check");
    await repository.saveMessageExchange(uid, session.id, {
      requestId: "req-conflict",
      userContent: "Original content.",
      assistantContent: "Original answer.",
      maxMessageCount: 120,
    });

    // The repository returns the stored exchange untouched; JournalService compares the stored
    // user content against the replayed content to raise the 409 IDEMPOTENCY_CONFLICT.
    const replayed = await repository.saveMessageExchange(uid, session.id, {
      requestId: "req-conflict",
      userContent: "Tampered content.",
      assistantContent: "Different answer.",
      maxMessageCount: 120,
    });
    expect(replayed.userMessage.content).toBe("Original content.");
    expect(replayed.messageCount).toBe(2);
    expect(await repository.listMessages(uid, session.id, 10)).toHaveLength(2);
  });
});

describe("FirestoreOrganizationRepository against the emulator", { timeout: 30_000 }, () => {
  const repository = new FirestoreOrganizationRepository(firestore);

  async function createOrgWithInvite(role: "admin" | "member") {
    const ownerUid = uniqueUid("owner");
    const organization = await repository.createWithOwner({
      name: "Emulator Org",
      description: null,
      ownerUid,
      requestId: `req_${ownerUid}`,
    });
    const tokenHash = tokenHashFor(randomUUID());
    const { inviteId } = await repository.createInvite(
      organization.id,
      {
        tokenHash,
        role,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        createdBy: ownerUid,
      },
      { uid: ownerUid, allowedRoles: OWNER_ACTOR_ROLES },
      inviteAudit(ownerUid),
    );
    return { ownerUid, organization, inviteId, tokenHash };
  }

  it("admits exactly one of two concurrent acceptances of the same one-time invite", async () => {
    const { organization, inviteId, tokenHash } = await createOrgWithInvite("member");
    expect(organization.memberCount).toBe(1);

    const nowIso = new Date().toISOString();
    const contenders = [uniqueUid("racer"), uniqueUid("racer")];
    const settled = await Promise.allSettled(
      contenders.map((uid) =>
        repository.acceptInvite({
          orgId: organization.id,
          inviteId,
          uid,
          tokenHash,
          nowIso,
          requestId: `req_${uid}`,
        }),
      ),
    );

    const statuses = settled.map((outcome) =>
      outcome.status === "fulfilled" ? outcome.value.status : "rejected",
    );
    expect(statuses.filter((status) => status === "accepted")).toHaveLength(1);
    expect(statuses.filter((status) => status === "invalid")).toHaveLength(1);

    const after = await repository.getOrganization(organization.id);
    expect(after?.memberCount).toBe(2);
    expect(await repository.listMembers(organization.id, 10)).toHaveLength(2);
  });

  it("applies a mutation plan against transaction-read state, audits it, then removes the member", async () => {
    const { ownerUid, organization, inviteId, tokenHash } = await createOrgWithInvite("admin");
    const memberUid = uniqueUid("member");
    const accepted = await repository.acceptInvite({
      orgId: organization.id,
      inviteId,
      uid: memberUid,
      tokenHash,
      nowIso: new Date().toISOString(),
      requestId: `req_${memberUid}`,
    });
    expect(accepted.status).toBe("accepted");

    const updated = await repository.updateMembership(
      organization.id,
      memberUid,
      ownerUid,
      (actor, target) =>
        actor.role === "owner" && target.role === "admin"
          ? {
              changes: { role: "member" },
              // Derived from the membership the transaction just read, not a prior snapshot.
              auditChanges: [{ field: "role", from: target.role, to: "member" }],
            }
          : null,
      {
        eventType: "membership.updated",
        targetType: "membership",
        targetId: memberUid,
        requestId: `req_demote_${memberUid}`,
      },
    );
    expect(updated.role).toBe("member");

    const auditEvents = await repository.listAuditEvents(organization.id, 20);
    const demotion = auditEvents.find((event) => event.eventType === "membership.updated");
    expect(demotion?.actorUid).toBe(ownerUid);
    expect(demotion?.changes).toEqual([{ field: "role", from: "admin", to: "member" }]);

    await repository.removeMembership(
      organization.id,
      memberUid,
      ownerUid,
      (actor, target) =>
        actor.role === "owner"
          ? [{ field: "status", from: target.status, to: null }]
          : null,
      {
        eventType: "membership.removed",
        targetType: "membership",
        targetId: memberUid,
        requestId: `req_remove_${memberUid}`,
      },
    );
    expect(await repository.getMembership(organization.id, memberUid)).toBeNull();
    expect((await repository.getOrganization(organization.id))?.memberCount).toBe(1);
  });
});

describe("FirestoreInsightRepository generation lease against the emulator", { timeout: 20_000 }, () => {
  const repository = new FirestoreInsightRepository(firestore);
  const periodKey = "2026-09-03";

  it("grants a free lease, blocks a live foreign holder, and allows takeover after expiry", async () => {
    const uid = uniqueUid("insight");
    const future = new Date(Date.now() + 60_000).toISOString();
    const nowIso = new Date().toISOString();

    expect(
      await repository.acquireGenerationLease(uid, periodKey, {
        holder: "holder-a",
        nowIso,
        expiresAtIso: future,
      }),
    ).toBe(true);
    expect(
      await repository.acquireGenerationLease(uid, periodKey, {
        holder: "holder-b",
        nowIso,
        expiresAtIso: future,
      }),
    ).toBe(false);

    // The current holder rewrites its own lease with an already-passed expiry, simulating a
    // crashed instance whose lease has lapsed.
    expect(
      await repository.acquireGenerationLease(uid, periodKey, {
        holder: "holder-a",
        nowIso,
        expiresAtIso: new Date(Date.now() - 60_000).toISOString(),
      }),
    ).toBe(true);
    expect(
      await repository.acquireGenerationLease(uid, periodKey, {
        holder: "holder-b",
        nowIso: new Date().toISOString(),
        expiresAtIso: future,
      }),
    ).toBe(true);
  });

  it("releases only the holder's own lease", async () => {
    const uid = uniqueUid("insight");
    const future = new Date(Date.now() + 60_000).toISOString();
    const nowIso = new Date().toISOString();
    await repository.acquireGenerationLease(uid, periodKey, {
      holder: "holder-a",
      nowIso,
      expiresAtIso: future,
    });

    await repository.releaseGenerationLease(uid, periodKey, "holder-b");
    expect(
      await repository.acquireGenerationLease(uid, periodKey, {
        holder: "holder-c",
        nowIso,
        expiresAtIso: future,
      }),
    ).toBe(false);

    await repository.releaseGenerationLease(uid, periodKey, "holder-a");
    expect(
      await repository.acquireGenerationLease(uid, periodKey, {
        holder: "holder-c",
        nowIso,
        expiresAtIso: future,
      }),
    ).toBe(true);
  });
});

describe("FirestorePlatformUserRepository against the emulator", { timeout: 20_000 }, () => {
  const repository = new FirestorePlatformUserRepository(firestore);

  it("creates a platform user once and keeps the original record on replay", async () => {
    const uid = uniqueUid("platform");
    const created = await repository.getOrCreate(identityFor(uid));
    expect(created.platformRole).toBe("user");
    expect(created.status).toBe("active");

    const replayed = await repository.getOrCreate({
      ...identityFor(uid),
      displayName: "Someone Else",
    });
    expect(replayed.displayName).toBe("Emulator User");
    expect(replayed.createdAt).toBe(created.createdAt);
  });

  it("bootstraps the first admin with a counter derived from an in-transaction count", async () => {
    const uid = uniqueUid("platform");
    await repository.getOrCreate(identityFor(uid));

    const { activeSuperAdminCount } = await repository.bootstrapFirstAdmin(uid);
    expect(activeSuperAdminCount).toBeGreaterThanOrEqual(1);
    expect(activeSuperAdminCount).toBe(await repository.countActiveSuperAdmins());
    expect(await repository.getActiveSuperAdminCount()).toBe(activeSuperAdminCount);

    const promoted = await repository.get(uid);
    expect(promoted?.platformRole).toBe("super_admin");
    expect(promoted?.status).toBe("active");
  });

  it("refuses an admin mutation when the acting uid is not an active super admin", async () => {
    const actorUid = uniqueUid("platform");
    const targetUid = uniqueUid("platform");
    await repository.getOrCreate(identityFor(actorUid));
    await repository.getOrCreate(identityFor(targetUid));

    await expect(
      repository.applyAdminMutation({
        targetUid,
        changes: { status: "suspended" },
        audit: {
          actorUid,
          eventType: "platform_user.status_changed",
          targetType: "user",
          targetId: targetUid,
          organizationId: null,
          reason: "emulator test",
          requestId: `req_${actorUid}`,
        },
      }),
    ).rejects.toThrow("ACTOR_NOT_AUTHORIZED");
    expect((await repository.get(targetUid))?.status).toBe("active");
  });
});

describe("session deletion cascade as composed in production", { timeout: 30_000 }, () => {
  it("removes the session, messages, signal, and summary, and marks citing insights stale", async () => {
    const { journalRepository, signalRepository, insightRepository, signalService, journalService } =
      productionComposedServices();
    const uid = uniqueUid("cascade");

    const session = await journalService.createSession(uid, "Cascade reflection");
    await journalRepository.saveMessageExchange(uid, session.id, {
      requestId: "req-cascade",
      userContent: "A day at the park.",
      assistantContent: "What made it memorable?",
      maxMessageCount: 120,
    });
    const upserted = await signalService.upsert(uid, session.id, {
      moodScore: 4,
      energyScore: 3,
      emotions: ["calm"],
      note: "Sunny afternoon.",
      location: {
        placeId: null,
        label: "Test Park",
        latitude: 52.37,
        longitude: 4.89,
        precision: "exact",
      },
      localDate: utcToday,
      timezone: "UTC",
    });
    expect(upserted.signal?.location?.label).toBe("Test Park");
    await journalRepository.saveSummary(uid, {
      title: "Park day",
      summary: "Reflected on a calm afternoon.",
      themes: ["rest"],
      nextSteps: ["repeat it"],
      sourceSessionId: session.id,
      sourceMessageIds: [],
      sourceMessageCount: 2,
    });
    // The insight cites the session but covers a different period than the signal's localDate,
    // so only onSessionDeleted's listCitingSession path can explain it turning stale.
    const insightLocalDate = addDays(utcToday, -5);
    const insight = insightWriteFor(uid, session.id, insightLocalDate);
    await insightRepository.save(uid, insight);

    expect(await signalService.listMapPoints(uid, utcToday, utcToday, 10)).toHaveLength(1);

    await journalService.deleteSession(uid, session.id);

    expect(await journalRepository.getSession(uid, session.id)).toBeNull();
    expect(await journalRepository.listMessages(uid, session.id, 10)).toHaveLength(0);
    expect(await journalRepository.getSummary(uid, session.id)).toBeNull();
    expect(await signalRepository.get(uid, session.id)).toBeNull();
    expect(await signalService.listMapPoints(uid, utcToday, utcToday, 10)).toHaveLength(0);

    // onSessionDeleted marks citing insights stale; it deliberately does not delete them.
    const afterDelete = await insightRepository.get(uid, insight.periodKey);
    expect(afterDelete?.stale).toBe(true);
  });
});

// The emulator does not enforce composite indexes, so these prove the production query code
// paths execute — not that firestore.indexes.json is complete.
describe("production query paths execute against the emulator", { timeout: 30_000 }, () => {
  it("serves the dashboard signal range read and the insights page listing", async () => {
    const uid = uniqueUid("query");
    const signals = new FirestoreSignalRepository(firestore);
    const insights = new FirestoreInsightRepository(firestore);
    const yesterday = addDays(utcToday, -1);

    for (const localDate of [yesterday, utcToday]) {
      await signals.upsert(uid, `session_${localDate}`, {
        moodScore: 3,
        energyScore: 2,
        emotions: ["focused"],
        note: null,
        location: null,
        localDate,
        timezone: "UTC",
        createdBy: uid,
        scopeId: uid,
      });
      await insights.save(uid, insightWriteFor(uid, `session_${localDate}`, localDate));
    }

    const range = await signals.listRange(uid, yesterday, utcToday, 10);
    expect(range.map((signal) => signal.localDate)).toEqual([utcToday, yesterday]);

    const listed = await insights.list(uid, "day", 10);
    expect(listed.map((item) => item.periodStart)).toEqual([utcToday, yesterday]);
    expect(await insights.list(uid, "week", 10)).toHaveLength(0);
  });

  it("serves the organization listing, user edges, and audit-event reads", async () => {
    const repository = new FirestoreOrganizationRepository(firestore);
    const ownerUid = uniqueUid("querier");
    const organization = await repository.createWithOwner({
      name: "Query Org",
      description: null,
      ownerUid,
      requestId: `req_${ownerUid}`,
    });

    const active = await repository.listOrganizations(5, "active");
    expect(active.map((entry) => entry.id)).toContain(organization.id);
    expect(await repository.countOrganizations("active")).toBeGreaterThanOrEqual(1);

    const edges = await repository.listUserEdges(ownerUid);
    expect(edges).toHaveLength(1);
    expect(edges[0]?.orgId).toBe(organization.id);
    expect(edges[0]?.role).toBe("owner");

    const audit = await repository.listAuditEvents(organization.id, 10);
    expect(audit.map((event) => event.eventType)).toContain("organization.created");
  });

  it("pages the platform user list with a cursor and reads back admin audit", async () => {
    const repository = new FirestorePlatformUserRepository(firestore);
    const seeded = [uniqueUid("page"), uniqueUid("page"), uniqueUid("page")];
    for (const uid of seeded) await repository.getOrCreate(identityFor(uid));

    const firstPage = await repository.list({ status: "active", limit: 2 });
    expect(firstPage.users).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await repository.list({
      status: "active",
      limit: 2,
      cursor: firstPage.nextCursor,
    });
    const firstUids = new Set(firstPage.users.map((user) => user.uid));
    expect(secondPage.users.length).toBeGreaterThanOrEqual(1);
    expect(secondPage.users.some((user) => firstUids.has(user.uid))).toBe(false);

    const requestId = `req_audit_${randomUUID()}`;
    await repository.appendAdminAudit({
      actorUid: seeded[0] ?? "unknown",
      eventType: "platform.test_event",
      targetType: "user",
      targetId: seeded[1] ?? "unknown",
      organizationId: null,
      changes: [{ field: "status", from: "active", to: "suspended" }],
      reason: "emulator query-path test",
      requestId,
    });
    const auditPage = await repository.listAdminAudit(null, 50);
    expect(auditPage.events.map((event) => event.requestId)).toContain(requestId);
  });
});

describe("documents are rooted where the architecture promises", { timeout: 30_000 }, () => {
  it("stores personal and organization content under their scope roots and isolates strangers", async () => {
    const uid = uniqueUid("scope");
    const journal = new FirestoreJournalRepository(firestore);
    const signals = new FirestoreSignalRepository(firestore);
    const insights = new FirestoreInsightRepository(firestore);
    const organizations = new FirestoreOrganizationRepository(firestore);

    const session = await journal.createSession(uid, "Scope check");
    const exchange = await journal.saveMessageExchange(uid, session.id, {
      requestId: "req-scope",
      userContent: "Rooted content.",
      assistantContent: "Acknowledged.",
      maxMessageCount: 120,
    });
    await signals.upsert(uid, session.id, {
      moodScore: 5,
      energyScore: 5,
      emotions: [],
      note: null,
      location: null,
      localDate: utcToday,
      timezone: "UTC",
      createdBy: uid,
      scopeId: uid,
    });
    const insight = insightWriteFor(uid, session.id, utcToday);
    await insights.save(uid, insight);

    const ownerUid = uniqueUid("scopeowner");
    const organization = await organizations.createWithOwner({
      name: "Scope Org",
      description: null,
      ownerUid,
      requestId: `req_${ownerUid}`,
    });

    const rootedPaths = [
      `users/${uid}/personalSessions/${session.id}`,
      `users/${uid}/personalSessions/${session.id}/messages/${exchange.userMessage.id}`,
      `users/${uid}/personalSignals/${session.id}`,
      `users/${uid}/personalInsights/${insight.periodKey}`,
      `organizations/${organization.id}`,
      `organizations/${organization.id}/members/${ownerUid}`,
    ];
    for (const path of rootedPaths) {
      const snapshot = await firestore.doc(path).get();
      expect(snapshot.exists, `expected a document at ${path}`).toBe(true);
    }

    const stranger = uniqueUid("stranger");
    expect(await journal.listSessions(stranger, 10)).toHaveLength(0);
    expect(await signals.listRange(stranger, addDays(utcToday, -7), utcToday, 10)).toHaveLength(0);
    expect(await insights.list(stranger, "day", 10)).toHaveLength(0);
    expect(await organizations.listUserEdges(stranger)).toHaveLength(0);
    expect(await organizations.getMembership(organization.id, stranger)).toBeNull();
  });
});
