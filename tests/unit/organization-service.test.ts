import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { JournalMessage, SummaryOutput } from "../../src/shared/schemas.js";
import { InMemoryOrganizationRepository } from "../../src/server/data/in-memory-organization-repository.js";
import { InMemoryOrganizationWorkspaceRepository } from "../../src/server/data/in-memory-organization-workspace-repository.js";
import { InMemoryMemoryIndexRepository } from "../../src/server/data/in-memory-memory-index-repository.js";
import { InMemoryPlatformUserRepository } from "../../src/server/data/in-memory-platform-user-repository.js";
import type {
  ConversationModel,
  ReflectionClassification,
  ReflectionClassificationInput,
} from "../../src/server/services/conversation-model.js";
import { OrganizationService } from "../../src/server/services/organization-service.js";
import { MemoryIndexService } from "../../src/server/services/memory-index-service.js";
import { TestModel } from "../helpers/test-app.js";

const START = Date.parse("2026-09-03T10:00:00.000Z");

function createContext<TModel extends ConversationModel = TestModel>(model: TModel = new TestModel() as unknown as TModel) {
  let currentTime = START;
  const clock = () => new Date(currentTime);
  const organizations = new InMemoryOrganizationRepository(clock);
  const workspace = new InMemoryOrganizationWorkspaceRepository(clock, organizations);
  const platformUsers = new InMemoryPlatformUserRepository(clock);
  const service = new OrganizationService(organizations, workspace, platformUsers, model, clock);
  const advance = (milliseconds: number) => {
    currentTime += milliseconds;
  };
  return { organizations, workspace, platformUsers, model, service, advance };
}

class ClassifyingOrganizationModel extends TestModel {
  classification: ReflectionClassification = { title: "", tags: [] };
  classificationInputs: ReflectionClassificationInput[] = [];

  async classifyReflection(input: ReflectionClassificationInput): Promise<ReflectionClassification> {
    this.classificationInputs.push(structuredClone(input));
    return this.classification;
  }
}

async function createOrgWith(
  context: { service: OrganizationService },
  members: Array<{ uid: string; role: "admin" | "member" | "viewer" }> = [],
): Promise<string> {
  const detail = await context.service.create(
    "user_owner",
    { name: "Synthetic Org", description: null },
    randomUUID(),
  );
  const orgId = detail.organization.id;
  for (const member of members) {
    const invite = await context.service.createInvite(
      "user_owner",
      orgId,
      member.role,
      randomUUID(),
    );
    await context.service.acceptInvite(
      member.uid,
      orgId,
      invite.inviteId,
      invite.secret,
      randomUUID(),
    );
  }
  return orgId;
}

describe("organization creation and isolation", () => {
  it("creates an organization with a transactional owner membership and edge", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context);

    const edges = await context.service.listMine("user_owner");
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ orgId, role: "owner", status: "active" });

    const detail = await context.service.get("user_owner", orgId);
    expect(detail.organization.memberCount).toBe(1);
    expect(detail.permissions.canInviteAdmin).toBe(true);
  });

  it("hides an organization completely from non-members", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context);

    await expect(context.service.get("user_stranger", orgId)).rejects.toMatchObject({
      status: 404,
    });
    await expect(context.service.listSessions("user_stranger", orgId)).rejects.toMatchObject({
      status: 404,
    });
    await expect(context.service.listMembers("user_stranger", orgId)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      context.service.createInvite("user_stranger", orgId, "member", randomUUID()),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      context.service.askOrganizationMemory("user_stranger", orgId, "what happened?"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("blocks every organization operation while the organization is suspended", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context, [{ uid: "user_member", role: "member" }]);
    await context.organizations.setOrganizationStatus(orgId, "suspended");

    await expect(context.service.get("user_owner", orgId)).rejects.toMatchObject({
      code: "ORGANIZATION_SUSPENDED",
    });
    await expect(
      context.service.createSession("user_member", orgId, "Blocked"),
    ).rejects.toMatchObject({ code: "ORGANIZATION_SUSPENDED" });
  });
});

describe("organization memory", () => {
  it("lets an owner build a bounded team index while blocking ordinary members", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context, [{ uid: "user_member", role: "member" }]);
    const session = await context.service.createSession("user_member", orgId, "Existing update", "update");
    await context.service.addMessage("user_member", orgId, session.id, randomUUID(), "Existing shared progress.");
    const indexedModel = context.model as unknown as ConversationModel & {
      embedText: NonNullable<ConversationModel["embedText"]>;
    };
    indexedModel.embedText = async () => ({ values: [1, 0], model: "test-embedding" });
    const memoryRepository = new InMemoryMemoryIndexRepository();
    const indexedService = new OrganizationService(
      context.organizations,
      context.workspace,
      context.platformUsers,
      indexedModel,
      undefined,
      undefined,
      undefined,
      new MemoryIndexService(memoryRepository, indexedModel),
    );

    await expect(indexedService.buildMemoryIndex("user_member", orgId)).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
    await expect(indexedService.buildMemoryIndex("user_owner", orgId)).resolves.toEqual({
      examined: 1,
      indexed: 1,
      skipped: 0,
      failed: 0,
    });
    await expect(memoryRepository.findNearest(
      { type: "organization", scopeId: orgId },
      [1, 0],
      8,
    )).resolves.toEqual([expect.objectContaining({ sourceSessionId: session.id })]);

    await indexedService.archiveSession("user_owner", orgId, session.id);
    await expect(memoryRepository.findNearest(
      { type: "organization", scopeId: orgId },
      [1, 0],
      8,
    )).resolves.toEqual([]);

    await indexedService.restoreSession("user_owner", orgId, session.id);
    await vi.waitFor(async () => {
      await expect(memoryRepository.findNearest(
        { type: "organization", scopeId: orgId },
        [1, 0],
        8,
      )).resolves.toEqual([expect.objectContaining({ sourceSessionId: session.id })]);
    });
  });

  it("answers from shared summaries and returns only same-organization citations", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context, [{ uid: "user_member", role: "member" }]);
    const session = await context.service.createSession("user_member", orgId, "Onboarding decision", "decision");
    await context.service.addMessage("user_member", orgId, session.id, randomUUID(), "We decided to keep onboarding in one shared checklist.");
    await context.service.addMessage("user_member", orgId, session.id, randomUUID(), "The checklist is ready for review.");
    await context.service.summarize("user_member", orgId, session.id);

    const answer = await context.service.askOrganizationMemory("user_owner", orgId, "What did we decide about onboarding?");
    expect(answer.answer).toContain("grounded response");
    expect(answer.citations).toEqual([
      expect.objectContaining({ sessionId: session.id, title: "Reflection summary", captureType: "decision" }),
    ]);
    expect(context.model.lastMessages[0]?.content).toContain("authorizedOrganizationSummaries");
    expect(context.model.lastMessages[0]?.content).not.toContain("user_member");
  });

  it("returns an honest no-evidence answer without calling Gemini", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context);
    const before = context.model.calls;
    await expect(context.service.askOrganizationMemory("user_owner", orgId, "anything?"))
      .resolves.toEqual({
        answer: "I couldn't find enough shared team context to answer that reliably yet.",
        citations: [],
      });
    expect(context.model.calls).toBe(before);
  });

  it("does not cite an unrelated shared summary", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context, [{ uid: "user_member", role: "member" }]);
    const session = await context.service.createSession("user_member", orgId, "Onboarding decision", "decision");
    await context.service.addMessage("user_member", orgId, session.id, randomUUID(), "Use one shared onboarding checklist.");
    await context.service.addMessage("user_member", orgId, session.id, randomUUID(), "The checklist is ready.");
    await context.service.summarize("user_member", orgId, session.id);
    const before = context.model.calls;

    await expect(context.service.askOrganizationMemory("user_owner", orgId, "Where is the office coffee machine?"))
      .resolves.toEqual({
        answer: "I couldn't find enough shared team context to answer that reliably yet.",
        citations: [],
      });
    expect(context.model.calls).toBe(before);
  });

  it("answers from messages without mixing another team's content", async () => {
    const context = createContext();
    const firstOrgId = await createOrgWith(context);
    const secondOrgId = await createOrgWith(context);
    const firstSession = await context.service.createSession("user_owner", firstOrgId, "First team roadmap", "update");
    await context.service.addMessage("user_owner", firstOrgId, firstSession.id, randomUUID(), "The first team roadmap is ready for review.");
    const secondSession = await context.service.createSession("user_owner", secondOrgId, "Second team roadmap", "update");
    await context.service.addMessage("user_owner", secondOrgId, secondSession.id, randomUUID(), "The second team secret must stay private.");

    const answer = await context.service.askOrganizationMemory("user_owner", firstOrgId, "What is the roadmap status?");

    expect(answer.citations).toEqual([
      expect.objectContaining({ sessionId: firstSession.id }),
    ]);
    expect(context.model.lastMessages[0]?.content).toContain("first team roadmap");
    expect(context.model.lastMessages[0]?.content).not.toContain("second team secret");
  });
});

describe("organization EOD status", () => {
  it("allows a member to dismiss their own prompt but blocks a viewer from claiming a submission", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context, [
      { uid: "user_member", role: "member" },
      { uid: "user_viewer", role: "viewer" },
    ]);

    await expect(
      context.service.updateEodStatus("user_member", orgId, "2026-09-03", { dismissed: true }),
    ).resolves.toMatchObject({ uid: "user_member", dismissed: true });
    await expect(
      context.service.updateEodStatus("user_viewer", orgId, "2026-09-03", {
        submittedSessionId: "missing_session",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("accepts only the member's completed update as an EOD submission", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context, [
      { uid: "user_member", role: "member" },
      { uid: "user_other", role: "member" },
    ]);
    const ownUpdate = await context.service.createSession("user_member", orgId, "EOD update", "update");
    await context.service.addMessage("user_member", orgId, ownUpdate.id, randomUUID(), "Progress and blockers.");
    const otherUpdate = await context.service.createSession("user_other", orgId, "Other update", "update");
    await context.service.addMessage("user_other", orgId, otherUpdate.id, randomUUID(), "Other person's update.");
    const ownDecision = await context.service.createSession("user_member", orgId, "A decision", "decision");
    await context.service.addMessage("user_member", orgId, ownDecision.id, randomUUID(), "We chose an option.");

    await expect(
      context.service.updateEodStatus("user_member", orgId, "2026-09-03", {
        submittedSessionId: otherUpdate.id,
      }),
    ).rejects.toMatchObject({ code: "INVALID_EOD_SUBMISSION" });
    await expect(
      context.service.updateEodStatus("user_member", orgId, "2026-09-03", {
        submittedSessionId: ownDecision.id,
      }),
    ).rejects.toMatchObject({ code: "INVALID_EOD_SUBMISSION" });
    await expect(
      context.service.updateEodStatus("user_member", orgId, "2026-09-03", {
        submittedSessionId: ownUpdate.id,
      }),
    ).resolves.toMatchObject({ uid: "user_member", submittedSessionId: ownUpdate.id });
  });

  it("reveals only an aggregate submission count when the owner enables it", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context, [{ uid: "user_member", role: "member" }]);
    await expect(context.service.getEodSubmissionCount("user_member", orgId, "2026-09-03"))
      .resolves.toBeNull();
    await context.service.updateEodSettings("user_owner", orgId, {
      enabled: true,
      timezone: "UTC",
      activeWeekdays: [1, 2, 3, 4, 5],
      dueLocalTime: "17:00",
      questions: ["What moved forward?"],
      showSubmissionStatus: true,
    });
    const update = await context.service.createSession("user_member", orgId, "EOD", "update");
    await context.service.addMessage("user_member", orgId, update.id, randomUUID(), "Progress.");
    await context.service.updateEodStatus("user_member", orgId, "2026-09-03", { submittedSessionId: update.id });

    await expect(context.service.getEodSubmissionCount("user_owner", orgId, "2026-09-03"))
      .resolves.toBe(1);
  });
});

describe("invitations", () => {
  it("lets only the owner invite admins", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context, [{ uid: "user_admin", role: "admin" }]);

    await expect(
      context.service.createInvite("user_admin", orgId, "admin", randomUUID()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      context.service.createInvite("user_admin", orgId, "member", randomUUID()),
    ).resolves.toMatchObject({ role: "member" });
  });

  it("stores only the token hash and never returns it", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context);
    const invite = await context.service.createInvite("user_owner", orgId, "viewer", randomUUID());

    const listed = await context.service.listInvites("user_owner", orgId);
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty("tokenHash");
    expect(JSON.stringify(listed)).not.toContain(invite.secret);

    const stored = await context.organizations.getInvite(orgId, invite.inviteId);
    expect(stored?.tokenHash).toBeDefined();
    expect(stored?.tokenHash).not.toBe(invite.secret);
  });

  it("previews a valid invitation and rejects tampered, expired, and revoked ones", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context);
    const invite = await context.service.createInvite("user_owner", orgId, "member", randomUUID());

    await expect(
      context.service.previewInvite(orgId, invite.inviteId, invite.secret),
    ).resolves.toMatchObject({ organizationName: "Synthetic Org", role: "member" });

    await expect(
      context.service.previewInvite(orgId, invite.inviteId, `${invite.secret.slice(0, -2)}xx`),
    ).rejects.toMatchObject({ code: "INVITE_INVALID" });

    context.advance(8 * 24 * 60 * 60 * 1_000);
    await expect(
      context.service.previewInvite(orgId, invite.inviteId, invite.secret),
    ).rejects.toMatchObject({ code: "INVITE_INVALID" });
  });

  it("consumes an invitation exactly once across users", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context);
    const invite = await context.service.createInvite("user_owner", orgId, "member", randomUUID());

    await context.service.acceptInvite(
      "user_first",
      orgId,
      invite.inviteId,
      invite.secret,
      randomUUID(),
    );
    await expect(
      context.service.acceptInvite("user_second", orgId, invite.inviteId, invite.secret, randomUUID()),
    ).rejects.toMatchObject({ code: "INVITE_INVALID" });

    const detail = await context.service.get("user_first", orgId);
    expect(detail.organization.memberCount).toBe(2);
  });

  it("keeps a retried acceptance by the same account successful", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context);
    const invite = await context.service.createInvite("user_owner", orgId, "viewer", randomUUID());

    const first = await context.service.acceptInvite(
      "user_first",
      orgId,
      invite.inviteId,
      invite.secret,
      randomUUID(),
    );
    const retry = await context.service.acceptInvite(
      "user_first",
      orgId,
      invite.inviteId,
      invite.secret,
      randomUUID(),
    );
    expect(first.role).toBe("viewer");
    expect(retry.role).toBe("viewer");
    const detail = await context.service.get("user_first", orgId);
    expect(detail.organization.memberCount).toBe(2);
  });

  it("survives two simultaneous acceptance attempts with a single membership", async () => {
    const context = createRaceContext();
    const orgId = await createOrgWith(context);
    const invite = await context.service.createInvite("user_owner", orgId, "member", randomUUID());

    // Both acceptances are held at the transactional boundary until each has passed every
    // service pre-check, so the overlap is guaranteed rather than left to scheduling luck.
    let arrived = 0;
    let releaseBoth = () => undefined as void;
    const bothArrived = new Promise<void>((resolve) => {
      releaseBoth = resolve;
    });
    context.organizations.beforeAcceptInvite = async () => {
      arrived += 1;
      if (arrived === 2) releaseBoth();
      await bothArrived;
    };

    const results = await Promise.allSettled([
      context.service.acceptInvite("user_a", orgId, invite.inviteId, invite.secret, randomUUID()),
      context.service.acceptInvite("user_b", orgId, invite.inviteId, invite.secret, randomUUID()),
    ]);
    expect(arrived).toBe(2);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);

    const detail = await context.service.get("user_owner", orgId);
    expect(detail.organization.memberCount).toBe(2);
  });

  it("revokes a pending invitation so it can no longer be used", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context);
    const invite = await context.service.createInvite("user_owner", orgId, "member", randomUUID());

    await context.service.revokeInvite("user_owner", orgId, invite.inviteId, randomUUID());
    await expect(
      context.service.acceptInvite("user_x", orgId, invite.inviteId, invite.secret, randomUUID()),
    ).rejects.toMatchObject({ code: "INVITE_INVALID" });
  });
});

describe("membership management", () => {
  it("enforces the full mutation matrix", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context, [
      { uid: "user_admin", role: "admin" },
      { uid: "user_member", role: "member" },
    ]);

    // An admin may govern members and viewers.
    await expect(
      context.service.updateMember("user_admin", orgId, "user_member", { role: "viewer" }, randomUUID()),
    ).resolves.toMatchObject({ role: "viewer" });

    // An admin may not touch another admin or create one.
    await expect(
      context.service.updateMember("user_admin", orgId, "user_member", { role: "admin" }, randomUUID()),
    ).rejects.toMatchObject({ status: 403 });

    // Nobody may mutate themselves, and the owner is untouchable.
    await expect(
      context.service.updateMember("user_admin", orgId, "user_admin", { role: "member" }, randomUUID()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      context.service.removeMember("user_admin", orgId, "user_owner", randomUUID()),
    ).rejects.toMatchObject({ status: 403 });

    // The owner may promote to admin and demote again.
    await expect(
      context.service.updateMember("user_owner", orgId, "user_member", { role: "admin" }, randomUUID()),
    ).resolves.toMatchObject({ role: "admin" });
    await expect(
      context.service.removeMember("user_admin", orgId, "user_member", randomUUID()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      context.service.updateMember("user_owner", orgId, "user_member", { role: "member" }, randomUUID()),
    ).resolves.toMatchObject({ role: "member" });
  });

  it("revokes access immediately on removal and blocks the removed member's late writes", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context, [{ uid: "user_member", role: "member" }]);

    await context.service.removeMember("user_owner", orgId, "user_member", randomUUID());

    await expect(context.service.get("user_member", orgId)).rejects.toMatchObject({ status: 404 });
    expect(await context.service.listMine("user_member")).toHaveLength(0);

    const detail = await context.service.get("user_owner", orgId);
    expect(detail.organization.memberCount).toBe(1);
  });

  it("re-checks the actor inside the mutation transaction", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context, [
      { uid: "user_admin", role: "admin" },
      { uid: "user_member", role: "member" },
    ]);

    // Simulates an in-flight request from an admin whose membership was just revoked.
    await context.organizations.removeMembership(
      orgId,
      "user_admin",
      "user_owner",
      (_actor, target) => [{ field: "status", from: target.status, to: null }],
      {
        eventType: "membership.removed",
        targetType: "membership",
        targetId: "user_admin",
        requestId: randomUUID(),
      },
    );
    await expect(
      context.organizations.updateMembership(
        orgId,
        "user_member",
        "user_admin",
        (_actor, target) => ({
          changes: { role: "viewer" },
          auditChanges: [{ field: "role", from: target.role, to: "viewer" }],
        }),
        {
          eventType: "membership.updated",
          targetType: "membership",
          targetId: "user_member",
          requestId: randomUUID(),
        },
      ),
    ).rejects.toThrow("ACTOR_NOT_AUTHORIZED");
  });

  it("suspended memberships authorize nothing", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context, [{ uid: "user_member", role: "member" }]);

    await context.service.updateMember(
      "user_owner",
      orgId,
      "user_member",
      { status: "suspended" },
      randomUUID(),
    );

    await expect(context.service.get("user_member", orgId)).rejects.toMatchObject({ status: 404 });
    await expect(
      context.service.createSession("user_member", orgId, "Blocked"),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("membership capacity", () => {
  it("stops accepting invitations once the organization is full", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context);

    for (let index = 1; index < 50; index += 1) {
      const invite = await context.service.createInvite("user_owner", orgId, "member", randomUUID());
      await context.service.acceptInvite(
        `user_member_${index}`,
        orgId,
        invite.inviteId,
        invite.secret,
        randomUUID(),
      );
    }
    expect((await context.service.get("user_owner", orgId)).organization.memberCount).toBe(50);

    const overflow = await context.service.createInvite("user_owner", orgId, "member", randomUUID());
    await expect(
      context.service.acceptInvite(
        "user_overflow",
        orgId,
        overflow.inviteId,
        overflow.secret,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 409, code: "ORGANIZATION_FULL" });
    expect((await context.service.get("user_owner", orgId)).organization.memberCount).toBe(50);
    await expect(context.service.get("user_overflow", orgId)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("organization conversations", () => {
  it("uses the same concise title and conservative tag lifecycle for team reflections", async () => {
    const model = new ClassifyingOrganizationModel();
    model.classification = { title: "Planning a focused launch", tags: ["work"] };
    const context = createContext(model);
    const orgId = await createOrgWith(context, [{ uid: "user_member", role: "member" }]);
    const session = await context.service.createSession("user_member", orgId);

    await context.service.addMessage(
      "user_member",
      orgId,
      session.id,
      randomUUID(),
      "We need to prepare the product launch plan.",
    );

    await expect(context.workspace.getSession(orgId, session.id)).resolves.toMatchObject({
      title: "Planning a focused launch",
      tags: ["work"],
    });
    expect(model.classificationInputs[0]).toMatchObject({ purpose: "initial", scope: "organization" });

    model.classification = { tags: ["goals"] };
    await context.service.summarize("user_member", orgId, session.id);

    await expect(context.workspace.getSession(orgId, session.id)).resolves.toMatchObject({
      tags: ["work", "goals"],
    });
    expect(model.classificationInputs.at(-1)).toMatchObject({
      purpose: "summary",
      scope: "organization",
      currentTags: ["work"],
    });
  });

  it("gives viewers read access but never write or model access", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context, [
      { uid: "user_member", role: "member" },
      { uid: "user_viewer", role: "viewer" },
    ]);
    const session = await context.service.createSession("user_member", orgId, "Team retro");
    await context.service.addMessage(
      "user_member",
      orgId,
      session.id,
      randomUUID(),
      "A shared organization thought.",
    );

    const detail = await context.service.getSession("user_viewer", orgId, session.id);
    expect(detail.messages).toHaveLength(2);

    const callsBefore = context.model.calls;
    await expect(
      context.service.addMessage("user_viewer", orgId, session.id, randomUUID(), "Not allowed"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      context.service.summarize("user_viewer", orgId, session.id),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      context.service.createSession("user_viewer", orgId, "Nope"),
    ).rejects.toMatchObject({ status: 403 });
    expect(context.model.calls).toBe(callsBefore);
  });

  it("lets writers rename active team reflections while viewers and archived sessions remain read-only", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context, [
      { uid: "user_member", role: "member" },
      { uid: "user_viewer", role: "viewer" },
    ]);
    const session = await context.service.createSession("user_member", orgId, "Old title");

    await expect(context.service.renameSession("user_member", orgId, session.id, "Clear team title"))
      .resolves.toMatchObject({ title: "Clear team title" });
    await expect(context.service.renameSession("user_viewer", orgId, session.id, "Forbidden"))
      .rejects.toMatchObject({ status: 403 });

    await context.service.archiveSession("user_member", orgId, session.id);
    await expect(context.service.renameSession("user_member", orgId, session.id, "Archived edit"))
      .rejects.toMatchObject({ status: 409, code: "SESSION_ARCHIVED" });
  });

  it("keeps the model context strictly inside the organization subtree", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context, [{ uid: "user_member", role: "member" }]);
    const session = await context.service.createSession("user_member", orgId, "Team retro");

    await context.service.addMessage(
      "user_member",
      orgId,
      session.id,
      randomUUID(),
      "Organization-shared content only.",
    );

    const supplied = context.model.lastMessages.map((message) => message.content);
    expect(supplied).toEqual(["Organization-shared content only."]);
  });

  it("attributes user messages to their author and replies to nobody", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context, [{ uid: "user_member", role: "member" }]);
    const session = await context.service.createSession("user_member", orgId, "Team retro");

    const exchange = await context.service.addMessage(
      "user_member",
      orgId,
      session.id,
      randomUUID(),
      "A shared organization thought.",
    );
    expect(exchange.userMessage.authorUid).toBe("user_member");
    expect(exchange.assistantMessage.authorUid).toBeNull();
  });

  it("streams a team reply and persists exactly the completed exchange", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context, [{ uid: "user_member", role: "member" }]);
    const session = await context.service.createSession("user_member", orgId, "Team retro");
    const chunks: string[] = [];

    const exchange = await context.service.streamMessage(
      "user_member",
      orgId,
      session.id,
      randomUUID(),
      "Stream this shared thought.",
      (chunk) => chunks.push(chunk),
    );

    expect(chunks.join("")).toBe("A grounded response for the authenticated journal.");
    expect(exchange.userMessage.authorUid).toBe("user_member");
    expect(exchange.assistantMessage.authorUid).toBeNull();
    expect((await context.service.getSession("user_member", orgId, session.id)).messages).toEqual([
      exchange.userMessage,
      exchange.assistantMessage,
    ]);
  });

  it("blocks a viewer before opening a team response stream", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context, [
      { uid: "user_member", role: "member" },
      { uid: "user_viewer", role: "viewer" },
    ]);
    const session = await context.service.createSession("user_member", orgId, "Team retro");
    const callsBefore = context.model.calls;

    await expect(context.service.assertSessionWritable("user_viewer", orgId, session.id))
      .rejects.toMatchObject({ status: 403 });
    expect(context.model.calls).toBe(callsBefore);
  });

  it("returns the identical exchange for a repeated request id without a second model call", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context, [{ uid: "user_member", role: "member" }]);
    const session = await context.service.createSession("user_member", orgId, "Team retro");
    const requestId = randomUUID();

    const first = await context.service.addMessage(
      "user_member",
      orgId,
      session.id,
      requestId,
      "Same message.",
    );
    const second = await context.service.addMessage(
      "user_member",
      orgId,
      session.id,
      requestId,
      "Same message.",
    );
    expect(second.userMessage.id).toBe(first.userMessage.id);
    expect(context.model.calls).toBe(1);
  });

  it("lets creators delete their own sessions and only admins delete others", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context, [
      { uid: "user_admin", role: "admin" },
      { uid: "user_member", role: "member" },
      { uid: "user_other", role: "member" },
    ]);
    const session = await context.service.createSession("user_member", orgId, "Mine");

    await expect(
      context.service.deleteSession("user_other", orgId, session.id),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      context.service.deleteSession("user_member", orgId, session.id),
    ).resolves.toBeUndefined();

    const second = await context.service.createSession("user_member", orgId, "Another");
    await expect(
      context.service.deleteSession("user_admin", orgId, second.id),
    ).resolves.toBeUndefined();
  });

  it("never mixes sessions across organizations", async () => {
    const context = createContext();
    const orgA = await createOrgWith(context, [{ uid: "user_member", role: "member" }]);
    const otherOwner = await context.service.create(
      "user_other_owner",
      { name: "Second Org", description: null },
      randomUUID(),
    );
    const sessionA = await context.service.createSession("user_member", orgA, "Org A session");

    await expect(
      context.service.getSession("user_other_owner", otherOwner.organization.id, sessionA.id),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      await context.service.listSessions("user_other_owner", otherOwner.organization.id),
    ).toHaveLength(0);
  });
});

describe("organization audit", () => {
  it("records fixed-schema events without private content", async () => {
    const context = createContext();
    const orgId = await createOrgWith(context, [{ uid: "user_member", role: "member" }]);
    const session = await context.service.createSession("user_member", orgId, "Team retro");
    await context.service.addMessage(
      "user_member",
      orgId,
      session.id,
      randomUUID(),
      "CANARY-PRIVATE-PHRASE inside a message.",
    );

    const events = await context.service.listAudit("user_owner", orgId);
    expect(events.length).toBeGreaterThanOrEqual(3);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("CANARY-PRIVATE-PHRASE");
    expect(serialized).not.toContain("@example.test");
    for (const event of events) {
      expect(Object.keys(event).sort()).toEqual([
        "actorUid",
        "changes",
        "createdAt",
        "eventType",
        "id",
        "organizationId",
        "reason",
        "requestId",
        "schemaVersion",
        "targetId",
        "targetType",
      ]);
    }

    await expect(context.service.listAudit("user_member", orgId)).rejects.toMatchObject({
      status: 403,
    });
  });
});

// Holds the model reply open so tests can change authorization state while the "model call" is
// in flight, exactly like a slow Gemini request.
class GatedConversationModel implements ConversationModel {
  private releaseGate!: () => void;
  private readonly gate = new Promise<void>((resolve) => {
    this.releaseGate = resolve;
  });
  private signalStarted!: () => void;
  readonly started = new Promise<void>((resolve) => {
    this.signalStarted = resolve;
  });

  async reply(_messages: JournalMessage[]): Promise<string> {
    this.signalStarted();
    await this.gate;
    return "A gated organization reply.";
  }

  async *replyStream(_messages: JournalMessage[]): AsyncIterable<string> {
    this.signalStarted();
    await this.gate;
    yield "A gated organization reply.";
  }

  async summarize(_messages: JournalMessage[]): Promise<SummaryOutput> {
    this.signalStarted();
    await this.gate;
    return { title: "Gated", summary: "A gated summary.", themes: [], nextSteps: [] };
  }

  finish(): void {
    this.releaseGate();
  }
}

// Lets a test run an arbitrary state change between the service's pre-checks and the repository's
// write transaction, modelling a concurrent request that commits first.
class RacingOrganizationRepository extends InMemoryOrganizationRepository {
  beforeMutation: (() => Promise<void>) | null = null;

  private async runHook(): Promise<void> {
    if (this.beforeMutation) {
      const hook = this.beforeMutation;
      this.beforeMutation = null;
      await hook();
    }
  }

  override async updateMembership(
    ...args: Parameters<InMemoryOrganizationRepository["updateMembership"]>
  ) {
    await this.runHook();
    return super.updateMembership(...args);
  }

  override async removeMembership(
    ...args: Parameters<InMemoryOrganizationRepository["removeMembership"]>
  ) {
    await this.runHook();
    return super.removeMembership(...args);
  }

  // Unlike the one-shot mutation hook above, this one runs for every acceptance so a test can
  // hold several concurrent acceptances at the transactional boundary and release them together.
  beforeAcceptInvite: (() => Promise<void>) | null = null;

  override async acceptInvite(
    ...args: Parameters<InMemoryOrganizationRepository["acceptInvite"]>
  ) {
    if (this.beforeAcceptInvite) await this.beforeAcceptInvite();
    return super.acceptInvite(...args);
  }
}

function createRaceContext(model: ConversationModel = new TestModel()) {
  const clock = () => new Date(START);
  const organizations = new RacingOrganizationRepository(clock);
  const workspace = new InMemoryOrganizationWorkspaceRepository(clock, organizations);
  const platformUsers = new InMemoryPlatformUserRepository(clock);
  const service = new OrganizationService(organizations, workspace, platformUsers, model, clock);
  return { organizations, workspace, platformUsers, service };
}

describe("in-flight authorization races", () => {
  it("persists nothing when the author is removed while the model call is in flight", async () => {
    const model = new GatedConversationModel();
    const context = createRaceContext(model);
    const orgId = await createOrgWith(context, [{ uid: "user_member", role: "member" }]);
    const session = await context.service.createSession("user_member", orgId, "Team retro");
    const requestId = randomUUID();

    const pending = context.service.addMessage(
      "user_member",
      orgId,
      session.id,
      requestId,
      "Written moments before removal.",
    );
    await model.started;
    await context.service.removeMember("user_owner", orgId, "user_member", randomUUID());
    model.finish();

    await expect(pending).rejects.toMatchObject({ status: 403 });
    expect(await context.workspace.listMessages(orgId, session.id, 10)).toHaveLength(0);
    expect(await context.workspace.getMessageExchange(orgId, session.id, requestId)).toBeNull();
    expect((await context.workspace.getSession(orgId, session.id))?.messageCount).toBe(0);
  });

  it("persists nothing when the organization is suspended while the model call is in flight", async () => {
    const model = new GatedConversationModel();
    const context = createRaceContext(model);
    const orgId = await createOrgWith(context, [{ uid: "user_member", role: "member" }]);
    const session = await context.service.createSession("user_member", orgId, "Team retro");
    const requestId = randomUUID();

    const pending = context.service.addMessage(
      "user_member",
      orgId,
      session.id,
      requestId,
      "Written moments before suspension.",
    );
    await model.started;
    await context.organizations.setOrganizationStatus(orgId, "suspended");
    model.finish();

    await expect(pending).rejects.toMatchObject({ status: 403 });
    expect(await context.workspace.listMessages(orgId, session.id, 10)).toHaveLength(0);
    expect(await context.workspace.getMessageExchange(orgId, session.id, requestId)).toBeNull();
  });

  it("re-evaluates the seniority matrix against the target as it exists at commit time", async () => {
    const context = createRaceContext();
    const orgId = await createOrgWith(context, [
      { uid: "user_admin", role: "admin" },
      { uid: "user_target", role: "member" },
    ]);

    // The owner promotes the target to admin after the admin's pre-checks but before the write.
    context.organizations.beforeMutation = async () => {
      await context.service.updateMember(
        "user_owner",
        orgId,
        "user_target",
        { role: "admin" },
        randomUUID(),
      );
    };

    await expect(
      context.service.updateMember(
        "user_admin",
        orgId,
        "user_target",
        { role: "viewer" },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });

    const target = await context.organizations.getMembership(orgId, "user_target");
    expect(target?.role).toBe("admin");
    const updates = (await context.service.listAudit("user_owner", orgId)).filter(
      (event) => event.eventType === "membership.updated",
    );
    expect(updates).toHaveLength(1);
    expect(updates[0]?.changes).toEqual([{ field: "role", from: "member", to: "admin" }]);
  });

  it("denies a mutation whose actor was removed after the pre-checks", async () => {
    const context = createRaceContext();
    const orgId = await createOrgWith(context, [
      { uid: "user_admin", role: "admin" },
      { uid: "user_target", role: "member" },
    ]);

    context.organizations.beforeMutation = async () => {
      await context.service.removeMember("user_owner", orgId, "user_admin", randomUUID());
    };

    await expect(
      context.service.updateMember(
        "user_admin",
        orgId,
        "user_target",
        { status: "suspended" },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect((await context.organizations.getMembership(orgId, "user_target"))?.status).toBe(
      "active",
    );
  });

  it("writes no duplicate audit when a concurrent request already applied the same change", async () => {
    const context = createRaceContext();
    const orgId = await createOrgWith(context, [{ uid: "user_target", role: "member" }]);

    context.organizations.beforeMutation = async () => {
      await context.service.updateMember(
        "user_owner",
        orgId,
        "user_target",
        { role: "viewer" },
        randomUUID(),
      );
    };

    const result = await context.service.updateMember(
      "user_owner",
      orgId,
      "user_target",
      { role: "viewer" },
      randomUUID(),
    );
    expect(result.role).toBe("viewer");

    const updates = (await context.service.listAudit("user_owner", orgId)).filter(
      (event) => event.eventType === "membership.updated",
    );
    expect(updates).toHaveLength(1);
    expect(updates[0]?.changes).toEqual([{ field: "role", from: "member", to: "viewer" }]);
  });
});
