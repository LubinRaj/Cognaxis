import type { User } from "firebase/auth";
import {
  isSessionTerminatingResponse,
  shouldForceTokenRefresh,
} from "../auth/token-retry-policy.js";
import type {
  AdminAuditPage,
  AdminOverview,
  AdminUserPage,
  Capabilities,
  CreateMessageInput,
  CreateOrganizationInput,
  CreateSessionInput,
  CreatedInvite,
  DashboardRangeDays,
  InvitePreview,
  JournalSession,
  MapPoint,
  Organization,
  OrganizationDetail,
  OrganizationInvite,
  OrganizationMemberView,
  OrganizationMessage,
  OrganizationSession,
  OrganizationSessionDetail,
  OrganizationSummary,
  PersonalDashboard,
  PersonalInsight,
  PersonalMemory,
  PersonalSignal,
  PlatformRole,
  PlatformStatus,
  PlatformUser,
  Preferences,
  SessionDetail,
  UpdateMemberInput,
  UpdateOrganizationStatusInput,
  UpdatePlatformRoleInput,
  UpdatePlatformStatusInput,
  UpdatePreferencesInput,
  UpsertSignalInput,
  UserOrganizationEdge,
} from "../../shared/schemas.js";

type ErrorBody = { error?: { code?: string; message?: string; requestId?: string } };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiClientHandlers = {
  onSessionExpired?: () => void;
  onEmailVerificationRequired?: () => void;
};

export class ApiClient {
  constructor(
    private readonly getUser: () => User | null,
    private readonly handlers: ApiClientHandlers = {},
  ) {}

  private async send(path: string, init: RequestInit, forceRefresh: boolean): Promise<Response> {
    const user = this.getUser();
    if (!user) throw new ApiError(401, "UNAUTHENTICATED", "Please sign in again.");

    // The token is requested immediately before the call so Firebase can supply a current one.
    // Cognaxis never stores the ID token or reads the refresh token.
    const token = await user.getIdToken(forceRefresh);

    return fetch(`/api/v1${path}`, {
      ...init,
      headers: {
        ...init.headers,
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      cache: "no-store",
    });
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const method = init.method ?? "GET";
    let completedRefreshes = 0;
    let response = await this.send(path, init, false);

    if (!response.ok) {
      const failure = await readFailure(response);

      if (shouldForceTokenRefresh({ ...failure, completedRefreshes, method })) {
        completedRefreshes += 1;
        response = await this.send(path, init, true);

        if (!response.ok) {
          const retried = await readFailure(response);
          this.reportTerminalFailure({ ...retried, completedRefreshes });
          throw new ApiError(retried.status, retried.errorCode, retried.message);
        }
      } else {
        this.reportTerminalFailure({ ...failure, completedRefreshes });
        throw new ApiError(failure.status, failure.errorCode, failure.message);
      }
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  private reportTerminalFailure(failure: {
    status: number;
    errorCode: string | null;
    completedRefreshes: number;
  }) {
    if (failure.status === 403 && failure.errorCode === "EMAIL_VERIFICATION_REQUIRED") {
      this.handlers.onEmailVerificationRequired?.();
      return;
    }
    if (isSessionTerminatingResponse(failure)) {
      this.handlers.onSessionExpired?.();
    }
  }

  async getCapabilities(): Promise<Capabilities> {
    return parseCapabilities(await this.request<unknown>("/me/capabilities"));
  }

  async listSessions(): Promise<JournalSession[]> {
    const body = await this.request<{ sessions: JournalSession[] }>("/sessions?limit=30");
    return body.sessions;
  }

  async createSession(input: CreateSessionInput = {}): Promise<JournalSession> {
    const body = await this.request<{ session: JournalSession }>("/sessions", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return body.session;
  }

  async getSession(sessionId: string): Promise<SessionDetail> {
    const body = await this.request<{ session: SessionDetail }>(
      `/sessions/${encodeURIComponent(sessionId)}`,
    );
    return body.session;
  }

  async addMessage(sessionId: string, input: CreateMessageInput) {
    return this.request<{
      userMessage: SessionDetail["messages"][number];
      assistantMessage: SessionDetail["messages"][number];
      summary: PersonalMemory | null;
    }>(`/sessions/${encodeURIComponent(sessionId)}/messages`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async addMessageStream(
    sessionId: string,
    input: CreateMessageInput,
    onChunk: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<{
    userMessage: SessionDetail["messages"][number];
    assistantMessage: SessionDetail["messages"][number];
    summary: PersonalMemory | null;
  }> {
    const init = { method: "POST", body: JSON.stringify(input), signal };
    let response = await this.send(`/sessions/${encodeURIComponent(sessionId)}/messages`, init, false);

    if (!response.ok) {
      const failure = await readFailure(response);
      if (shouldForceTokenRefresh({ ...failure, completedRefreshes: 0, method: "POST" })) {
        response = await this.send(`/sessions/${encodeURIComponent(sessionId)}/messages`, init, true);
        if (!response.ok) {
          const retried = await readFailure(response);
          this.reportTerminalFailure({ ...retried, completedRefreshes: 1 });
          throw new ApiError(retried.status, retried.errorCode, retried.message);
        }
      } else {
        this.reportTerminalFailure({ ...failure, completedRefreshes: 0 });
        throw new ApiError(failure.status, failure.errorCode, failure.message);
      }
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let finalExchange: any = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!line) continue;
          
          const parsed = JSON.parse(line);
          if (parsed.type === "chunk") {
            onChunk(parsed.text);
          } else if (parsed.type === "complete") {
            finalExchange = parsed.exchange;
          } else if (parsed.type === "error") {
            throw new ApiError(500, "INTERNAL_ERROR", parsed.message);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    
    if (!finalExchange) {
      throw new Error("Stream closed before completion");
    }
    return finalExchange;
  }

  async summarize(sessionId: string): Promise<PersonalMemory> {
    const body = await this.request<{ summary: PersonalMemory }>(
      `/sessions/${encodeURIComponent(sessionId)}/summarize`,
      { method: "POST", body: "{}" },
    );
    return body.summary;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.request(`/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  }

  async getSignal(sessionId: string): Promise<PersonalSignal | null> {
    const body = await this.request<{ signal: PersonalSignal | null }>(
      `/sessions/${encodeURIComponent(sessionId)}/signals`,
    );
    return body.signal;
  }

  async saveSignal(
    sessionId: string,
    input: UpsertSignalInput,
  ): Promise<{ signal: PersonalSignal | null; deleted: boolean }> {
    return this.request<{ signal: PersonalSignal | null; deleted: boolean }>(
      `/sessions/${encodeURIComponent(sessionId)}/signals`,
      { method: "PUT", body: JSON.stringify(input) },
    );
  }

  async deleteSignal(sessionId: string): Promise<void> {
    await this.request(`/sessions/${encodeURIComponent(sessionId)}/signals`, {
      method: "DELETE",
    });
  }

  async getPreferences(): Promise<Preferences> {
    const body = await this.request<{ preferences: Preferences }>("/personal/preferences");
    return body.preferences;
  }

  async savePreferences(input: UpdatePreferencesInput): Promise<Preferences> {
    const body = await this.request<{ preferences: Preferences }>("/personal/preferences", {
      method: "PUT",
      body: JSON.stringify(input),
    });
    return body.preferences;
  }

  async getDashboardView(rangeDays: DashboardRangeDays): Promise<DashboardView> {
    return this.request<DashboardView>(`/personal/insights/dashboard?rangeDays=${rangeDays}`);
  }

  async generateInsight(
    periodType: "day" | "week",
    periodKey: string,
    input: { requestId: string; regenerate?: boolean },
  ): Promise<InsightGenerationResult> {
    return this.request<InsightGenerationResult>(
      `/personal/insights/${periodType}/${encodeURIComponent(periodKey)}/generate`,
      { method: "POST", body: JSON.stringify(input) },
    );
  }

  async deleteInsight(periodKey: string): Promise<void> {
    await this.request(`/personal/insights/${encodeURIComponent(periodKey)}`, {
      method: "DELETE",
    });
  }

  async getMapPoints(): Promise<MapPoint[]> {
    const body = await this.request<{ points: MapPoint[] }>("/personal/map-points");
    return body.points;
  }

  async listOrganizations(): Promise<UserOrganizationEdge[]> {
    const body = await this.request<{ organizations: UserOrganizationEdge[] }>("/organizations");
    return body.organizations;
  }

  async createOrganization(input: CreateOrganizationInput): Promise<OrganizationDetail> {
    return this.request<OrganizationDetail>("/organizations", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async getOrganization(orgId: string): Promise<OrganizationDetail> {
    return this.request<OrganizationDetail>(`/organizations/${encodeURIComponent(orgId)}`);
  }

  async updateOrganization(
    orgId: string,
    input: { name?: string; description?: string | null },
  ): Promise<Organization> {
    const body = await this.request<{ organization: Organization }>(
      `/organizations/${encodeURIComponent(orgId)}`,
      { method: "PATCH", body: JSON.stringify(input) },
    );
    return body.organization;
  }

  async listOrganizationMembers(orgId: string): Promise<OrganizationMemberView[]> {
    const body = await this.request<{ members: OrganizationMemberView[] }>(
      `/organizations/${encodeURIComponent(orgId)}/members`,
    );
    return body.members;
  }

  async updateOrganizationMember(
    orgId: string,
    targetUid: string,
    input: UpdateMemberInput,
  ): Promise<OrganizationMemberView> {
    const body = await this.request<{ member: OrganizationMemberView }>(
      `/organizations/${encodeURIComponent(orgId)}/members/${encodeURIComponent(targetUid)}`,
      { method: "PATCH", body: JSON.stringify(input) },
    );
    return body.member;
  }

  async removeOrganizationMember(orgId: string, targetUid: string): Promise<void> {
    await this.request(
      `/organizations/${encodeURIComponent(orgId)}/members/${encodeURIComponent(targetUid)}`,
      { method: "DELETE" },
    );
  }

  async listOrganizationInvites(orgId: string): Promise<Array<Omit<OrganizationInvite, "tokenHash">>> {
    const body = await this.request<{ invites: Array<Omit<OrganizationInvite, "tokenHash">> }>(
      `/organizations/${encodeURIComponent(orgId)}/invites`,
    );
    return body.invites;
  }

  async createOrganizationInvite(
    orgId: string,
    role: "admin" | "member" | "viewer",
  ): Promise<CreatedInvite> {
    const body = await this.request<{ invite: CreatedInvite }>(
      `/organizations/${encodeURIComponent(orgId)}/invites`,
      { method: "POST", body: JSON.stringify({ role }) },
    );
    return body.invite;
  }

  async revokeOrganizationInvite(orgId: string, inviteId: string): Promise<void> {
    await this.request(
      `/organizations/${encodeURIComponent(orgId)}/invites/${encodeURIComponent(inviteId)}`,
      { method: "DELETE" },
    );
  }

  async previewOrganizationInvite(
    orgId: string,
    inviteId: string,
    secret: string,
  ): Promise<InvitePreview> {
    const body = await this.request<{ invite: InvitePreview }>(
      `/organizations/${encodeURIComponent(orgId)}/invites/${encodeURIComponent(inviteId)}/preview`,
      { method: "POST", body: JSON.stringify({ secret }) },
    );
    return body.invite;
  }

  async acceptOrganizationInvite(
    orgId: string,
    inviteId: string,
    secret: string,
  ): Promise<{ orgId: string; organizationName: string; role: string }> {
    const body = await this.request<{
      membership: { orgId: string; organizationName: string; role: string };
    }>(
      `/organizations/${encodeURIComponent(orgId)}/invites/${encodeURIComponent(inviteId)}/accept`,
      { method: "POST", body: JSON.stringify({ secret }) },
    );
    return body.membership;
  }

  async listOrganizationSessions(orgId: string): Promise<OrganizationSession[]> {
    const body = await this.request<{ sessions: OrganizationSession[] }>(
      `/organizations/${encodeURIComponent(orgId)}/sessions`,
    );
    return body.sessions;
  }

  async createOrganizationSession(
    orgId: string,
    input: CreateSessionInput = {},
  ): Promise<OrganizationSession> {
    const body = await this.request<{ session: OrganizationSession }>(
      `/organizations/${encodeURIComponent(orgId)}/sessions`,
      { method: "POST", body: JSON.stringify(input) },
    );
    return body.session;
  }

  async getOrganizationSession(
    orgId: string,
    sessionId: string,
  ): Promise<OrganizationSessionDetail> {
    const body = await this.request<{ session: OrganizationSessionDetail }>(
      `/organizations/${encodeURIComponent(orgId)}/sessions/${encodeURIComponent(sessionId)}`,
    );
    return body.session;
  }

  async addOrganizationMessage(
    orgId: string,
    sessionId: string,
    input: CreateMessageInput,
  ): Promise<{
    userMessage: OrganizationMessage;
    assistantMessage: OrganizationMessage;
    messageCount: number;
  }> {
    return this.request(
      `/organizations/${encodeURIComponent(orgId)}/sessions/${encodeURIComponent(sessionId)}/messages`,
      { method: "POST", body: JSON.stringify(input) },
    );
  }

  async summarizeOrganizationSession(
    orgId: string,
    sessionId: string,
  ): Promise<OrganizationSummary> {
    const body = await this.request<{ summary: OrganizationSummary }>(
      `/organizations/${encodeURIComponent(orgId)}/sessions/${encodeURIComponent(sessionId)}/summarize`,
      { method: "POST", body: "{}" },
    );
    return body.summary;
  }

  async deleteOrganizationSession(orgId: string, sessionId: string): Promise<void> {
    await this.request(
      `/organizations/${encodeURIComponent(orgId)}/sessions/${encodeURIComponent(sessionId)}`,
      { method: "DELETE" },
    );
  }

  async adminOverview(): Promise<AdminOverview> {
    const body = await this.request<{ overview: AdminOverview }>("/admin/overview");
    return body.overview;
  }

  async adminListUsers(filters: {
    query?: string;
    role?: PlatformRole;
    status?: PlatformStatus;
    cursor?: string | null;
    limit?: number;
  }): Promise<AdminUserPage> {
    const parameters = new URLSearchParams();
    if (filters.query) parameters.set("query", filters.query);
    if (filters.role) parameters.set("role", filters.role);
    if (filters.status) parameters.set("status", filters.status);
    if (filters.cursor) parameters.set("cursor", filters.cursor);
    parameters.set("limit", String(filters.limit ?? 25));
    return this.request<AdminUserPage>(`/admin/users?${parameters.toString()}`);
  }

  async adminSetUserRole(
    targetUid: string,
    input: UpdatePlatformRoleInput,
  ): Promise<PlatformUser> {
    const body = await this.request<{ user: PlatformUser }>(
      `/admin/users/${encodeURIComponent(targetUid)}/role`,
      { method: "PATCH", body: JSON.stringify(input) },
    );
    return body.user;
  }

  async adminSetUserStatus(
    targetUid: string,
    input: UpdatePlatformStatusInput,
  ): Promise<PlatformUser> {
    const body = await this.request<{ user: PlatformUser }>(
      `/admin/users/${encodeURIComponent(targetUid)}/status`,
      { method: "PATCH", body: JSON.stringify(input) },
    );
    return body.user;
  }

  async adminListOrganizations(status?: "active" | "suspended"): Promise<Organization[]> {
    const parameters = new URLSearchParams();
    if (status) parameters.set("status", status);
    const suffix = parameters.size > 0 ? `?${parameters.toString()}` : "";
    const body = await this.request<{ organizations: Organization[] }>(
      `/admin/organizations${suffix}`,
    );
    return body.organizations;
  }

  async adminSetOrganizationStatus(
    orgId: string,
    input: UpdateOrganizationStatusInput,
  ): Promise<Organization> {
    const body = await this.request<{ organization: Organization }>(
      `/admin/organizations/${encodeURIComponent(orgId)}/status`,
      { method: "PATCH", body: JSON.stringify(input) },
    );
    return body.organization;
  }

  async adminListAudit(cursor?: string | null): Promise<AdminAuditPage> {
    const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    return this.request<AdminAuditPage>(`/admin/audit${suffix}`);
  }
}

export type DashboardView = {
  dashboard: PersonalDashboard;
  recentInsights: PersonalInsight[];
};

export type InsightGenerationResult = {
  insight: PersonalInsight;
  outcome: "generated" | "reused" | "deterministic";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// The navigation decides which destinations exist from this response, so it is validated instead
// of trusted; a malformed body becomes a normal error state rather than a broken shell.
function parseCapabilities(body: unknown): Capabilities {
  const capabilities = isRecord(body) ? body.capabilities : null;
  if (!isRecord(capabilities) || !isRecord(capabilities.features)) {
    throw new ApiError(502, "INVALID_RESPONSE", "The request could not be completed.");
  }
  const { platformRole, status, features } = capabilities;
  if (
    (platformRole !== "user" && platformRole !== "super_admin") ||
    (status !== "active" && status !== "suspended")
  ) {
    throw new ApiError(502, "INVALID_RESPONSE", "The request could not be completed.");
  }
  return {
    platformRole,
    status,
    features: {
      insights: features.insights === true,
      maps: features.maps === true,
      organizations: features.organizations === true,
      admin: features.admin === true,
    },
  };
}

async function readFailure(response: Response): Promise<{
  status: number;
  errorCode: string | null;
  message: string;
}> {
  const body = (await response.json().catch(() => ({}))) as ErrorBody;
  return {
    status: response.status,
    errorCode: typeof body.error?.code === "string" ? body.error.code : null,
    message: body.error?.message ?? "The request could not be completed.",
  };
}
