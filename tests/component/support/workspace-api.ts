import { vi } from "vitest";
import type {
  AuditEvent,
  AttachmentReference,
  JournalSession,
  MapPoint,
  Organization,
  OrganizationDetail,
  OrganizationInvite,
  OrganizationMemberView,
  OrganizationSession,
  OrganizationSessionDetail,
  PersonalDashboard,
  PersonalCheckIn,
  PersonalInsight,
  PersonalMemory,
  PersonalOpenLoop,
  PersonalSignal,
  PlatformUser,
  SessionDetail,
  UpsertSignalInput,
  UserOrganizationEdge,
} from "../../../src/shared/schemas";

export type ApiRoute = {
  method: string;
  url: string;
  token: string | undefined;
  body: unknown;
};

export type WorkspaceApiStub = {
  routes: ApiRoute[];
  sessions: JournalSession[];
  details: Map<string, SessionDetail>;
  signals: Map<string, PersonalSignal>;
  checkIns: Map<string, PersonalCheckIn[]>;
  dashboard: PersonalDashboard;
  recentInsights: PersonalInsight[];
  openLoops: PersonalOpenLoop[];
  mapPoints: MapPoint[];
  organizations: UserOrganizationEdge[];
  orgDetail: OrganizationDetail | null;
  orgMembers: OrganizationMemberView[];
  orgInvites: Array<Omit<OrganizationInvite, "tokenHash">>;
  orgSessions: OrganizationSession[];
  orgSessionDetails: Map<string, OrganizationSessionDetail>;
  adminUsers: PlatformUser[];
  adminOrganizations: Organization[];
  adminAudit: AuditEvent[];
  capabilitiesAdmin: boolean;
  /** Overrides for a specific route; return null to fall through to the default behaviour. */
  handler: ((route: ApiRoute) => Response | null) | null;
  /** Resolves the next matching request only when released, for race and pending-state tests. */
  gate: { pending: (() => void)[]; hold: boolean };
};

export function makeDashboard(overrides: Partial<PersonalDashboard> = {}): PersonalDashboard {
  return {
    rangeDays: 7,
    from: "2026-08-28",
    to: "2026-09-03",
    timezone: "UTC",
    reflectionCount: 5,
    checkinCount: 3,
    locatedCount: 0,
    coverage: 0.6,
    moodAverage: 3.7,
    energyAverage: 3.2,
    moodDeltaFromPrevious: 0.5,
    energyDeltaFromPrevious: null,
    moodDistribution: { 1: 0, 2: 0, 3: 1, 4: 2, 5: 0 },
    energyDistribution: { 1: 0, 2: 1, 3: 2, 4: 0, 5: 0 },
    topEmotions: [
      { emotion: "calm", count: 2 },
      { emotion: "focused", count: 1 },
    ],
    trend: [
      { date: "2026-08-28", mood: 3, energy: 2 },
      { date: "2026-08-29", mood: null, energy: null },
      { date: "2026-08-30", mood: 4, energy: 3 },
      { date: "2026-08-31", mood: null, energy: null },
      { date: "2026-09-01", mood: 4, energy: 4 },
      { date: "2026-09-02", mood: null, energy: null },
      { date: "2026-09-03", mood: 4, energy: 3 },
    ],
    hasEnoughForTrend: true,
    reflectionStreak: {
      unit: "day",
      current: 2,
      longest: 4,
      activePeriods: 5,
      periods: [
        { start: "2026-08-28", end: "2026-08-28", reflectionCount: 0, isCurrent: false },
        { start: "2026-08-29", end: "2026-08-29", reflectionCount: 1, isCurrent: false },
        { start: "2026-08-30", end: "2026-08-30", reflectionCount: 1, isCurrent: false },
        { start: "2026-08-31", end: "2026-08-31", reflectionCount: 1, isCurrent: false },
        { start: "2026-09-01", end: "2026-09-01", reflectionCount: 1, isCurrent: false },
        { start: "2026-09-02", end: "2026-09-02", reflectionCount: 1, isCurrent: false },
        { start: "2026-09-03", end: "2026-09-03", reflectionCount: 1, isCurrent: true },
      ],
    },
    ...overrides,
  };
}

export function makePlatformUser(
  overrides: Partial<PlatformUser> & { uid: string },
): PlatformUser {
  return {
    email: `${overrides.uid}@example.test`,
    displayName: `Person ${overrides.uid}`,
    providerIds: ["password"],
    emailVerified: true,
    platformRole: "user",
    status: "active",
    firstSeenAt: "2026-08-01T09:00:00.000Z",
    lastSeenAt: "2026-09-03T09:00:00.000Z",
    lastSeenWriteAt: "2026-09-03T09:00:00.000Z",
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-09-03T09:00:00.000Z",
    schemaVersion: 1,
    ...overrides,
  };
}

export function makeOrgDetail(overrides: Partial<OrganizationDetail> = {}): OrganizationDetail {
  return {
    organization: {
      id: "org_1",
      name: "Synthetic Org",
      description: "A shared research space.",
      status: "active",
      ownerUid: "user_owner",
      memberCount: 2,
      createdBy: "user_owner",
      createdAt: "2026-09-01T09:00:00.000Z",
      updatedAt: "2026-09-01T09:00:00.000Z",
      schemaVersion: 1,
    },
    role: "member",
    permissions: {
      canWrite: true,
      canManageMembers: false,
      canViewInvites: false,
      canInviteAdmin: false,
      canUpdateSettings: false,
      canViewAudit: false,
    },
    ...overrides,
  };
}

export function makeOrgMember(
  overrides: Partial<OrganizationMemberView> & { uid: string },
): OrganizationMemberView {
  return {
    displayName: `Member ${overrides.uid}`,
    email: `${overrides.uid}@example.test`,
    role: "member",
    status: "active",
    joinedAt: "2026-09-01T09:00:00.000Z",
    ...overrides,
  };
}

export function makeOrgSession(
  overrides: Partial<OrganizationSession> & { id: string },
): OrganizationSession {
  return {
    title: `Shared reflection ${overrides.id}`,
    status: "active",
    messageCount: 0,
    summarizedMessageCount: 0,
    captureType: "reflection",
    tags: overrides.tags ?? [],
    createdBy: "user_owner",
    createdAt: "2026-09-01T09:00:00.000Z",
    updatedAt: "2026-09-01T09:00:00.000Z",
    ...overrides,
  };
}

export function makeOrgSessionDetail(
  overrides: Partial<OrganizationSessionDetail> & { id: string },
): OrganizationSessionDetail {
  return {
    ...makeOrgSession({ id: overrides.id }),
    messages: [],
    summary: null,
    ...overrides,
  };
}

export function makeMapPoint(
  overrides: Partial<MapPoint> & { sessionId: string },
): MapPoint {
  return {
    sessionTitle: `Reflection ${overrides.sessionId}`,
    label: "Neighborhood park",
    latitude: 12.97,
    longitude: 77.59,
    precision: "approximate",
    localDate: "2026-09-01",
    moodScore: 4,
    updatedAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

export function makeInsight(
  overrides: Partial<PersonalInsight> & { periodKey: string },
): PersonalInsight {
  return {
    periodType: "day",
    periodStart: "2026-09-03",
    periodEndExclusive: "2026-09-04",
    timezone: "UTC",
    sourceSessionIds: ["s1"],
    sourceSignalSessionIds: ["s1"],
    sourceFingerprint: "fp",
    metrics: {
      reflectionCount: 1,
      checkinCount: 1,
      moodAverage: 4,
      energyAverage: 3,
      moodDeltaFromPrevious: null,
      energyDeltaFromPrevious: null,
      emotionCounts: {
        calm: 1,
        hopeful: 0,
        focused: 0,
        energized: 0,
        grateful: 0,
        content: 0,
        uncertain: 0,
        tired: 0,
        stressed: 0,
        frustrated: 0,
        sad: 0,
        overwhelmed: 0,
      },
    },
    narrative: {
      title: "A steady day",
      overview: "A synthetic overview grounded only in the supplied records.",
      patterns: [
        {
          observation: "Reflections shared a calm tone.",
          evidenceSessionIds: ["s1"],
          confidence: "medium",
        },
      ],
      highlights: ["A synthetic highlight."],
      nextSteps: ["Write the next thought."],
      disclaimer:
        "These are patterns from your own reflections, not medical advice or a diagnosis.",
    },
    generationRequestId: "req-1",
    model: "gemini",
    promptVersion: "insight-v1",
    stale: false,
    createdAt: "2026-09-03T10:00:00.000Z",
    updatedAt: "2026-09-03T10:00:00.000Z",
    createdBy: "user_alpha",
    scopeType: "personal",
    scopeId: "user_alpha",
    schemaVersion: 1,
    ...overrides,
  };
}

export function makeSignal(
  overrides: Partial<PersonalSignal> & { sourceSessionId: string },
): PersonalSignal {
  return {
    moodScore: 4,
    energyScore: 3,
    emotions: ["calm"],
    note: null,
    location: null,
    localDate: "2026-09-03",
    timezone: "UTC",
    capturedAt: "2026-09-03T09:00:00.000Z",
    updatedAt: "2026-09-03T09:00:00.000Z",
    createdBy: "user_alpha",
    scopeType: "personal",
    scopeId: "user_alpha",
    schemaVersion: 1,
    ...overrides,
  };
}

export function makeCheckIn(
  overrides: Partial<PersonalCheckIn> & { id: string; sourceSessionId: string },
): PersonalCheckIn {
  const { id, sourceSessionId, ...rest } = overrides;
  return {
    ...makeSignal({ sourceSessionId }),
    id,
    anchorMessageId: null,
    schemaVersion: 2,
    ...rest,
  };
}

export function makeSession(overrides: Partial<JournalSession> & { id: string }): JournalSession {
  return {
    title: `Reflection ${overrides.id}`,
    status: "active",
    messageCount: 0,
    summarizedMessageCount: 0,
    captureType: "reflection",
    tags: overrides.tags ?? [],
    createdAt: "2026-09-01T09:00:00.000Z",
    updatedAt: "2026-09-01T09:00:00.000Z",
    ...overrides,
  };
}

export function makeDetail(
  overrides: Partial<SessionDetail> & { id: string },
): SessionDetail {
  return {
    ...makeSession({ id: overrides.id }),
    messages: [],
    summary: null,
    ...overrides,
  };
}

export function makeSummary(overrides: Partial<PersonalMemory> = {}): PersonalMemory {
  return {
    id: "memory-1",
    sourceSessionId: "s1",
    sourceMessageIds: ["m1", "m2"],
    title: "Simplify the storage layer",
    summary: "Complexity stems from coupling.",
    themes: ["design", "focus"],
    nextSteps: ["Isolate the storage layer.", "Define clear boundaries."],
    createdAt: "2026-09-02T09:00:00.000Z",
    updatedAt: "2026-09-02T09:00:00.000Z",
    ...overrides,
  };
}

function json(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function failure(status: number, code: string, message = "Something went wrong."): Response {
  return json(status, { error: { code, message } });
}

export function installWorkspaceApi(): WorkspaceApiStub {
  const stub: WorkspaceApiStub = {
    routes: [],
    sessions: [],
    details: new Map(),
    signals: new Map(),
    checkIns: new Map(),
    dashboard: makeDashboard(),
    recentInsights: [],
    openLoops: [],
    mapPoints: [],
    organizations: [],
    orgDetail: null,
    orgMembers: [],
    orgInvites: [],
    orgSessions: [],
    orgSessionDetails: new Map(),
    adminUsers: [],
    adminOrganizations: [],
    adminAudit: [],
    capabilitiesAdmin: false,
    handler: null,
    gate: { pending: [], hold: false },
  };

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const headers = init.headers as Record<string, string> | undefined;
      const route: ApiRoute = {
        method: init.method ?? "GET",
        url,
        token: headers?.authorization?.replace("Bearer ", ""),
        body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      };
      stub.routes.push(route);

      if (stub.gate.hold) {
        await new Promise<void>((resolve) => stub.gate.pending.push(resolve));
      }

      const override = stub.handler?.(route);
      if (override) return override;

      if (route.method === "GET" && url === "/api/v1/me/capabilities") {
        return json(200, {
          capabilities: {
            platformRole: stub.capabilitiesAdmin ? "super_admin" : "user",
            status: "active",
            features: {
              insights: true,
              maps: true,
              organizations: true,
              admin: stub.capabilitiesAdmin,
            },
          },
        });
      }

      if (url === "/api/v1/admin/overview" && route.method === "GET") {
        return json(200, {
          overview: {
            totalUsers: stub.adminUsers.length,
            activeUsersLast7Days: stub.adminUsers.length,
            activeOrganizations: stub.adminOrganizations.filter(
              (organization) => organization.status === "active",
            ).length,
            usage: [
              {
                date: "2026-09-03",
                sessionsCreated: 4,
                messageExchangesCompleted: 9,
                sessionSummariesGenerated: 1,
                personalInsightsGenerated: 1,
                organizationSessionsCreated: 0,
                organizationInvitesAccepted: 0,
              },
            ],
          },
        });
      }
      if (url.startsWith("/api/v1/admin/users") && route.method === "GET") {
        return json(200, { users: stub.adminUsers, nextCursor: null });
      }
      const adminUserPatch = /^\/api\/v1\/admin\/users\/([^/]+)\/(role|status)$/.exec(url);
      if (adminUserPatch && route.method === "PATCH") {
        const target = decodeURIComponent(adminUserPatch[1]);
        const body = route.body as { role?: "user" | "super_admin"; status?: "active" | "suspended" };
        stub.adminUsers = stub.adminUsers.map((user) =>
          user.uid === target
            ? {
                ...user,
                platformRole: body.role ?? user.platformRole,
                status: body.status ?? user.status,
              }
            : user,
        );
        return json(200, { user: stub.adminUsers.find((user) => user.uid === target) });
      }
      if (url.startsWith("/api/v1/admin/organizations") && route.method === "GET") {
        return json(200, { organizations: stub.adminOrganizations });
      }
      const adminOrgPatch = /^\/api\/v1\/admin\/organizations\/([^/]+)\/status$/.exec(url);
      if (adminOrgPatch && route.method === "PATCH") {
        const target = decodeURIComponent(adminOrgPatch[1]);
        const body = route.body as { status: "active" | "suspended" };
        stub.adminOrganizations = stub.adminOrganizations.map((organization) =>
          organization.id === target ? { ...organization, status: body.status } : organization,
        );
        return json(200, {
          organization: stub.adminOrganizations.find((organization) => organization.id === target),
        });
      }
      if (url.startsWith("/api/v1/admin/audit") && route.method === "GET") {
        return json(200, { events: stub.adminAudit, nextCursor: null });
      }

      if (route.method === "GET" && url.startsWith("/api/v1/sessions?")) {
        const status = new URL(url, "http://localhost").searchParams.get("status") ?? "active";
        return json(200, {
          sessions: stub.sessions.filter((session) => (session.status ?? "active") === status),
        });
      }

      if (route.method === "GET" && url.startsWith("/api/v1/tags?")) {
        return json(200, {
          tags: [...new Set(stub.sessions.flatMap((session) => session.tags ?? []))].sort(),
        });
      }

      if (route.method === "GET" && url === "/api/v1/personal/open-loops") {
        return json(200, { openLoops: stub.openLoops });
      }

      if (route.method === "POST" && url === "/api/v1/sessions") {
        const created = makeSession({
          id: `created-${stub.sessions.length + 1}`,
          title: "New reflection",
          updatedAt: "2026-09-09T09:00:00.000Z",
        });
        stub.sessions = [created, ...stub.sessions];
        stub.details.set(created.id, makeDetail({ id: created.id, title: created.title }));
        return json(201, { session: created });
      }

      if (url === "/api/v1/organizations") {
        if (route.method === "GET") return json(200, { organizations: stub.organizations });
        if (route.method === "POST") {
          const body = route.body as { name: string; description: string | null };
          const detail = makeOrgDetail({
            organization: {
              ...makeOrgDetail().organization,
              id: "org_new",
              name: body.name,
              description: body.description,
              memberCount: 1,
            },
            role: "owner",
            permissions: {
              canWrite: true,
              canManageMembers: true,
              canViewInvites: true,
              canInviteAdmin: true,
              canUpdateSettings: true,
              canViewAudit: true,
            },
          });
          stub.orgDetail = detail;
          stub.organizations = [
            {
              orgId: "org_new",
              organizationName: body.name,
              role: "owner",
              status: "active",
              joinedAt: "2026-09-03T09:00:00.000Z",
              updatedAt: "2026-09-03T09:00:00.000Z",
            },
            ...stub.organizations,
          ];
          return json(201, detail);
        }
      }

      const orgMatch = /^\/api\/v1\/organizations\/([^/?]+)(.*)$/.exec(url);
      if (orgMatch) {
        const rest = orgMatch[2];
        if (route.method === "GET" && (rest === "/tags" || rest.startsWith("/tags?"))) {
          return json(200, {
            tags: [...new Set(stub.orgSessions.flatMap((session) => session.tags ?? []))].sort(),
          });
        }
        if (rest === "" && route.method === "GET") {
          return stub.orgDetail
            ? json(200, stub.orgDetail)
            : failure(404, "NOT_FOUND", "The requested resource was not found.");
        }
        if (rest === "" && route.method === "PATCH" && stub.orgDetail) {
          const body = route.body as { name?: string; description?: string | null };
          stub.orgDetail = {
            ...stub.orgDetail,
            organization: {
              ...stub.orgDetail.organization,
              name: body.name ?? stub.orgDetail.organization.name,
              description:
                body.description === undefined
                  ? stub.orgDetail.organization.description
                  : body.description,
            },
          };
          return json(200, { organization: stub.orgDetail.organization });
        }
        if (rest === "/members" && route.method === "GET") {
          return json(200, { members: stub.orgMembers });
        }
        const memberMatch = /^\/members\/([^/?]+)$/.exec(rest);
        if (memberMatch && route.method === "PATCH") {
          const target = decodeURIComponent(memberMatch[1]);
          const body = route.body as { role?: "admin" | "member" | "viewer"; status?: "active" | "suspended" };
          stub.orgMembers = stub.orgMembers.map((member) =>
            member.uid === target
              ? { ...member, role: body.role ?? member.role, status: body.status ?? member.status }
              : member,
          );
          const updated = stub.orgMembers.find((member) => member.uid === target);
          return json(200, { member: updated });
        }
        if (memberMatch && route.method === "DELETE") {
          const target = decodeURIComponent(memberMatch[1]);
          stub.orgMembers = stub.orgMembers.filter((member) => member.uid !== target);
          return new Response(null, { status: 204 });
        }
        if (rest === "/invites" && route.method === "GET") {
          return json(200, { invites: stub.orgInvites });
        }
        if (rest === "/invites" && route.method === "POST") {
          const body = route.body as { role: "admin" | "member" | "viewer" };
          const invite = {
            inviteId: `invite_${stub.orgInvites.length + 1}`,
            secret: "s".repeat(43),
            role: body.role,
            expiresAt: "2026-09-10T09:00:00.000Z",
          };
          stub.orgInvites = [
            {
              id: invite.inviteId,
              role: invite.role,
              status: "pending",
              expiresAt: invite.expiresAt,
              createdBy: "user_alpha",
              acceptedBy: null,
              createdAt: "2026-09-03T09:00:00.000Z",
              acceptedAt: null,
              schemaVersion: 1,
            },
            ...stub.orgInvites,
          ];
          return json(201, { invite });
        }
        const inviteActionMatch = /^\/invites\/([^/?]+)(\/(preview|accept))?$/.exec(rest);
        if (inviteActionMatch && route.method === "DELETE") {
          const inviteId = decodeURIComponent(inviteActionMatch[1]);
          stub.orgInvites = stub.orgInvites.map((entry) =>
            entry.id === inviteId ? { ...entry, status: "revoked" as const } : entry,
          );
          return new Response(null, { status: 204 });
        }
        if (inviteActionMatch?.[3] === "preview" && route.method === "POST") {
          return json(200, {
            invite: { organizationName: "Synthetic Org", role: "member", expiresAt: "2026-09-10T09:00:00.000Z" },
          });
        }
        if (inviteActionMatch?.[3] === "accept" && route.method === "POST") {
          return json(200, {
            membership: {
              orgId: decodeURIComponent(orgMatch[1]),
              organizationName: "Synthetic Org",
              role: "member",
            },
          });
        }
        if ((rest === "/sessions" || rest.startsWith("/sessions?")) && route.method === "GET") {
          const status = new URL(`http://localhost${rest}`).searchParams.get("status") ?? "active";
          return json(200, {
            sessions: stub.orgSessions.filter((session) => (session.status ?? "active") === status),
          });
        }
        if (rest === "/sessions" && route.method === "POST") {
          const session = makeOrgSession({ id: `orgs-${stub.orgSessions.length + 1}`, title: "New shared reflection", createdBy: "user_alpha" });
          stub.orgSessions = [session, ...stub.orgSessions];
          stub.orgSessionDetails.set(session.id, makeOrgSessionDetail({ id: session.id, title: session.title, createdBy: "user_alpha" }));
          return json(201, { session });
        }
        const orgSessionLifecycleMatch = /^\/sessions\/([^/?]+)\/(archive|restore)$/.exec(rest);
        if (orgSessionLifecycleMatch && route.method === "POST") {
          const sessionId = decodeURIComponent(orgSessionLifecycleMatch[1]);
          const status: OrganizationSession["status"] =
            orgSessionLifecycleMatch[2] === "archive" ? "archived" : "active";
          const current = stub.orgSessions.find((session) => session.id === sessionId);
          if (!current) return failure(404, "NOT_FOUND", "The requested resource was not found.");
          const updated = { ...current, status };
          stub.orgSessions = stub.orgSessions.map((session) => session.id === sessionId ? updated : session);
          const detail = stub.orgSessionDetails.get(sessionId);
          if (detail) stub.orgSessionDetails.set(sessionId, { ...detail, status });
          return json(200, { session: updated });
        }
        const orgSessionMatch = /^\/sessions\/([^/?]+)(\/(messages|summarize))?$/.exec(rest);
        if (orgSessionMatch) {
          const sessionId = decodeURIComponent(orgSessionMatch[1]);
          if (!orgSessionMatch[3] && route.method === "GET") {
            const detail = stub.orgSessionDetails.get(sessionId);
            return detail
              ? json(200, { session: detail })
              : failure(404, "NOT_FOUND", "The requested resource was not found.");
          }
          if (!orgSessionMatch[3] && route.method === "PATCH") {
            const body = route.body as { title: string };
            const current = stub.orgSessionDetails.get(sessionId);
            if (!current) return failure(404, "NOT_FOUND", "The requested resource was not found.");
            const updated = { ...current, title: body.title };
            stub.orgSessionDetails.set(sessionId, updated);
            stub.orgSessions = stub.orgSessions.map((session) =>
              session.id === sessionId ? { ...session, title: body.title } : session,
            );
            return json(200, { session: updated });
          }
          if (!orgSessionMatch[3] && route.method === "DELETE") {
            stub.orgSessions = stub.orgSessions.filter((session) => session.id !== sessionId);
            stub.orgSessionDetails.delete(sessionId);
            return new Response(null, { status: 204 });
          }
          if (orgSessionMatch[3] === "messages" && route.method === "POST") {
            const body = route.body as { requestId: string; content: string; attachmentIds?: string[] };
            const content = body.content;
            const index = stub.orgSessionDetails.get(sessionId)?.messages.length ?? 0;
            const exchange = {
              userMessage: {
                id: `${sessionId}-u${index}`,
                role: "user" as const,
                content,
                ...(body.attachmentIds?.length ? { attachmentIds: body.attachmentIds } : {}),
                authorUid: "user_alpha",
                createdAt: "2026-09-03T09:00:00.000Z",
              },
              assistantMessage: {
                id: `${sessionId}-a${index}`,
                role: "model" as const,
                content: "A grounded reply for the organization.",
                authorUid: null,
                createdAt: "2026-09-03T09:00:01.000Z",
              },
              messageCount: index + 2,
            };
            const current = stub.orgSessionDetails.get(sessionId);
            if (current) {
              stub.orgSessionDetails.set(sessionId, {
                ...current,
                messages: [...current.messages, exchange.userMessage, exchange.assistantMessage],
                messageCount: exchange.messageCount,
              });
            }
            return new Response(
              [
                { type: "start", requestId: body.requestId },
                { type: "chunk", text: exchange.assistantMessage.content },
                { type: "complete", exchange },
              ].map((event) => `${JSON.stringify(event)}\n`).join(""),
              { status: 201, headers: { "content-type": "application/x-ndjson; charset=utf-8" } },
            );
          }
          if (orgSessionMatch[3] === "summarize" && route.method === "POST") {
            return json(200, {
              summary: {
                id: `session_${sessionId}`,
                title: "Shared summary",
                summary: "A synthetic organization summary.",
                themes: ["collaboration"],
                nextSteps: ["Continue the retro."],
                sourceSessionId: sessionId,
                createdBy: "user_alpha",
                createdAt: "2026-09-03T09:00:00.000Z",
                updatedAt: "2026-09-03T09:00:00.000Z",
              },
            });
          }
        }
      }

      if (url === "/api/v1/personal/preferences") {
        if (route.method === "GET") {
          return json(200, {
            preferences: {
              timezone: "UTC",
              weekStartsOn: "monday",
              insightRangeDays: 7,
              createdAt: "2026-09-01T00:00:00.000Z",
              updatedAt: "2026-09-01T00:00:00.000Z",
              schemaVersion: 1,
            },
          });
        }
        if (route.method === "PUT") {
          return json(200, { preferences: route.body });
        }
      }

      if (route.method === "GET" && url.startsWith("/api/v1/personal/map-points")) {
        return json(200, { points: stub.mapPoints });
      }

      if (route.method === "GET" && url.startsWith("/api/v1/personal/insights/dashboard")) {
        return json(200, { dashboard: stub.dashboard, recentInsights: stub.recentInsights });
      }

      const generateMatch = /^\/api\/v1\/personal\/insights\/(day|week)\/([^/]+)\/generate$/.exec(
        url,
      );
      if (generateMatch && route.method === "POST") {
        const insight = makeInsight({
          periodType: generateMatch[1] as "day" | "week",
          periodKey: decodeURIComponent(generateMatch[2]),
        });
        stub.recentInsights = [
          insight,
          ...stub.recentInsights.filter((entry) => entry.periodKey !== insight.periodKey),
        ];
        return json(200, { insight, outcome: "generated" });
      }

      const insightDeleteMatch = /^\/api\/v1\/personal\/insights\/([^/]+)$/.exec(url);
      if (insightDeleteMatch && route.method === "DELETE") {
        const key = decodeURIComponent(insightDeleteMatch[1]);
        stub.recentInsights = stub.recentInsights.filter((entry) => entry.periodKey !== key);
        return new Response(null, { status: 204 });
      }

      const signalMatch = /^\/api\/v1\/sessions\/([^/?]+)\/signals$/.exec(url);
      if (signalMatch) {
        const id = decodeURIComponent(signalMatch[1]);
        if (route.method === "GET") {
          return json(200, { signal: stub.signals.get(id) ?? null });
        }
        if (route.method === "PUT") {
          const body = route.body as UpsertSignalInput;
          const empty =
            body.moodScore === null &&
            body.energyScore === null &&
            body.emotions.length === 0 &&
            body.note === null &&
            body.location === null;
          if (empty) {
            stub.signals.delete(id);
            return json(200, { signal: null, deleted: true });
          }
          const saved = makeSignal({
            sourceSessionId: id,
            moodScore: body.moodScore,
            energyScore: body.energyScore,
            emotions: body.emotions,
            note: body.note,
            location: body.location,
            localDate: body.localDate,
            timezone: body.timezone,
          });
          stub.signals.set(id, saved);
          return json(200, { signal: saved, deleted: false });
        }
        if (route.method === "DELETE") {
          stub.signals.delete(id);
          return new Response(null, { status: 204 });
        }
      }

      const checkInMatch = /^\/api\/v1\/sessions\/([^/?]+)\/check-ins(?:\/([^/?]+))?$/.exec(url);
      if (checkInMatch) {
        const id = decodeURIComponent(checkInMatch[1]);
        const checkInId = checkInMatch[2] ? decodeURIComponent(checkInMatch[2]) : null;
        const existing = stub.checkIns.get(id) ?? [];
        if (!checkInId && route.method === "GET") return json(200, { checkIns: existing });
        if (!checkInId && route.method === "POST") {
          const body = route.body as UpsertSignalInput;
          const created = makeCheckIn({
            id: `checkin-${existing.length + 1}`,
            sourceSessionId: id,
            moodScore: body.moodScore,
            energyScore: body.energyScore,
            emotions: body.emotions,
            note: body.note,
            location: body.location,
          });
          stub.checkIns.set(id, [created, ...existing]);
          return json(201, { checkIn: created });
        }
        if (checkInId && route.method === "DELETE") {
          stub.checkIns.set(id, existing.filter((checkIn) => checkIn.id !== checkInId));
          return new Response(null, { status: 204 });
        }
      }

      const detailMatch = /^\/api\/v1\/sessions\/([^/?]+)$/.exec(url);
      if (detailMatch) {
        const id = decodeURIComponent(detailMatch[1]);
        if (route.method === "DELETE") {
          stub.sessions = stub.sessions.filter((session) => session.id !== id);
          stub.details.delete(id);
          return new Response(null, { status: 204 });
        }
        const detail = stub.details.get(id);
        return detail
          ? json(200, { session: detail })
          : failure(404, "NOT_FOUND", "The requested resource was not found.");
      }

      const sessionLifecycleMatch = /^\/api\/v1\/sessions\/([^/?]+)\/(archive|restore)$/.exec(url);
      if (sessionLifecycleMatch && route.method === "POST") {
        const id = decodeURIComponent(sessionLifecycleMatch[1]);
        const status: JournalSession["status"] =
          sessionLifecycleMatch[2] === "archive" ? "archived" : "active";
        const current = stub.sessions.find((session) => session.id === id);
        if (!current) return failure(404, "NOT_FOUND", "The requested resource was not found.");
        const updated = { ...current, status };
        stub.sessions = stub.sessions.map((session) => session.id === id ? updated : session);
        const detail = stub.details.get(id);
        if (detail) stub.details.set(id, { ...detail, status });
        return json(200, { session: updated });
      }

      const tagMatch = /^\/api\/v1\/sessions\/([^/?]+)\/tags$/.exec(url);
      if (tagMatch && route.method === "PATCH") {
        const id = decodeURIComponent(tagMatch[1]);
        const tags = (route.body as { tags: string[] }).tags;
        const current = stub.sessions.find((session) => session.id === id);
        const updated = current ? { ...current, tags } : null;
        if (updated) {
          stub.sessions = stub.sessions.map((session) => session.id === id ? updated : session);
          const detail = stub.details.get(id);
          if (detail) stub.details.set(id, { ...detail, tags });
        }
        return updated ? json(200, { session: updated }) : failure(404, "NOT_FOUND", "The requested resource was not found.");
      }

      const attachmentUploadMatch = /^\/api\/v1\/sessions\/([^/?]+)\/attachments$/.exec(url);
      if (attachmentUploadMatch && route.method === "POST") {
        const attachment: AttachmentReference = {
          id: `attachment-${stub.routes.length}`,
          kind: "document",
          mimeType: "application/pdf",
          byteSize: 5,
          createdAt: "2026-09-10T09:00:00.000Z",
        };
        return json(201, { attachment });
      }

      const messageMatch = /^\/api\/v1\/sessions\/([^/?]+)\/messages$/.exec(url);
      if (messageMatch) {
        const id = decodeURIComponent(messageMatch[1]);
        const content = (route.body as { content: string }).content;
        const index = stub.details.get(id)?.messages.length ?? 0;
        const exchange = {
          userMessage: {
            id: `${id}-u${index}`,
            role: "user" as const,
            content,
            createdAt: "2026-09-10T09:00:00.000Z",
          },
          assistantMessage: {
            id: `${id}-a${index}`,
            role: "model" as const,
            content: "A grounded reply from Cognaxis.",
            createdAt: "2026-09-10T09:00:01.000Z",
          },
          summary: null,
        };
        return new Response(
          [
            { type: "start", requestId: (route.body as { requestId: string }).requestId },
            { type: "chunk", text: exchange.assistantMessage.content },
            { type: "complete", exchange },
          ].map((event) => `${JSON.stringify(event)}\n`).join(""),
          { status: 201, headers: { "content-type": "application/x-ndjson; charset=utf-8" } },
        );
      }

      const summaryMatch = /^\/api\/v1\/sessions\/([^/?]+)\/summarize$/.exec(url);
      if (summaryMatch) {
        return json(200, { summary: makeSummary({ sourceSessionId: summaryMatch[1] }) });
      }

      return failure(404, "NOT_FOUND");
    }),
  );

  return stub;
}

export function releaseGate(stub: WorkspaceApiStub) {
  stub.gate.hold = false;
  const waiting = [...stub.gate.pending];
  stub.gate.pending.length = 0;
  for (const resolve of waiting) resolve();
}

/**
 * navigator.clipboard is defined with a getter only, so it must be redefined rather than assigned.
 */
export function stubClipboard(writeText: () => Promise<void>) {
  const spy = vi.fn(writeText);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: spy },
    configurable: true,
    writable: true,
  });
  return spy;
}
