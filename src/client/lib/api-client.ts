import type { User } from "firebase/auth";
import {
  isSessionTerminatingResponse,
  shouldForceTokenRefresh,
} from "../auth/token-retry-policy.js";
import { organizationStreamEventSchema, streamEventSchema } from "../../shared/schemas.js";
import type {
  AdminAuditPage,
  AdminOverview,
  AdminUserPage,
  AttachmentReference,
  Capabilities,
  CreateCheckInInput,
  CreateMessageInput,
  CreateOrganizationInput,
  CreateSessionInput,
  CreatedInvite,
  DashboardRangeDays,
  InvitePreview,
  JournalSession,
  MapPoint,
  MessageExchange,
  MemoryIndexBuildResult,
  Organization,
  OrganizationDetail,
  OrganizationInvite,
  OrganizationMemberView,
  OrganizationMessage,
  OrganizationMemoryAnswer,
  OrganizationEodSettings,
  OrganizationEodStatus,
  OrganizationSession,
  OrganizationSessionDetail,
  OrganizationSummary,
  PersonalDashboard,
  PersonalCheckIn,
  PersonalInsight,
  PersonalMemory,
  PersonalMemoryAnswer,
  PersonalOpenLoop,
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

// The private API permits ten requests per second per user. A browser page can legitimately
// mount several small data readers at once, especially when a person switches between sections,
// so let the client smooth that fan-out before it reaches the server. The queue is shared by all
// ApiClient instances in this tab; without that, each React feature hook would have its own view
// of the limit and a fast navigation would still release a burst of 429s. Writes and model
// streams are paced too, but are intentionally never replayed here.
const CLIENT_REQUEST_SPACING_MS = 125;
let nextRequestAt = 0;

function shouldSmoothRequests(): boolean {
  // Vitest's jsdom environment exposes a window, but it is not a real browser tab and should not
  // inherit production pacing delays. E2E and deployed clients run in an actual browser.
  return typeof window !== "undefined" && !window.navigator.userAgent.toLowerCase().includes("jsdom");
}

function retryDelayMs(response: Response): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number.parseFloat(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000);
  }

  const rateLimit = response.headers.get("ratelimit");
  const reset = rateLimit?.match(/(?:^|,)\s*reset=(\d+)/i);
  if (reset) return Math.max(0, Number(reset[1]) * 1_000);
  return 1_050;
}

function reserveRequestSlot(minDelayMs = 0): number {
  const scheduledAt = Math.max(Date.now() + minDelayMs, nextRequestAt);
  nextRequestAt = scheduledAt + CLIENT_REQUEST_SPACING_MS;
  return scheduledAt - Date.now();
}

async function waitForRequestSlot(signal?: AbortSignal | null): Promise<void> {
  if (!shouldSmoothRequests()) return;
  const delay = reserveRequestSlot();
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException("The request was aborted.", "AbortError");
  }
  if (delay <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delay);
    const abort = () => {
      globalThis.clearTimeout(timer);
      reject(
        signal?.reason instanceof Error
          ? signal.reason
          : new DOMException("The request was aborted.", "AbortError"),
      );
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function waitForReadRetry(response: Response): Promise<void> {
  if (!shouldSmoothRequests()) return;
  const delay = reserveRequestSlot(retryDelayMs(response));
  // Space queued calls just enough that a single retried page load cannot consume the next burst.
  if (delay > 0) await new Promise<void>((resolve) => globalThis.setTimeout(resolve, delay));
}

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

    const headers = {
      ...init.headers,
      authorization: `Bearer ${token}`,
    } as Record<string, string>;
    if (!headers["content-type"] && !headers["Content-Type"]) {
      headers["content-type"] = "application/json";
    }

    await waitForRequestSlot(init.signal);
    return fetch(`/api/v1${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  }

  private async requestResponse(path: string, init: RequestInit = {}): Promise<Response> {
    const method = init.method ?? "GET";
    let completedRefreshes = 0;
    let response = await this.send(path, init, false);

    // Normal page reads can fan out while a user switches screens. Respect the server's cooldown
    // and replay one idempotent read instead of surfacing a transient error state. Mutations stay
    // single-shot to avoid duplicate destructive or AI work.
    if (!response.ok && response.status === 429 && (method === "GET" || method === "HEAD")) {
      await waitForReadRetry(response);
      response = await this.send(path, init, false);
    }

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

    return response;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.requestResponse(path, init);

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

  async listSessions(status: "active" | "archived" = "active"): Promise<JournalSession[]> {
    const body = await this.request<{ sessions: JournalSession[] }>(
      `/sessions?limit=30${status === "archived" ? "&status=archived" : ""}`,
    );
    return body.sessions;
  }

  async listReflectionTags(): Promise<string[]> {
    const body = await this.request<{ tags: string[] }>("/tags?limit=100");
    return body.tags;
  }

  async createSession(input: CreateSessionInput = {}): Promise<JournalSession> {
    const body = await this.request<{ session: JournalSession }>("/sessions", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return body.session;
  }

  async renameSession(sessionId: string, title: string): Promise<JournalSession> {
    const body = await this.request<{ session: JournalSession }>(
      `/sessions/${encodeURIComponent(sessionId)}`,
      { method: "PATCH", body: JSON.stringify({ title }) },
    );
    return body.session;
  }

  async updateSessionTags(sessionId: string, tags: string[]): Promise<JournalSession> {
    const body = await this.request<{ session: JournalSession }>(
      `/sessions/${encodeURIComponent(sessionId)}/tags`,
      { method: "PATCH", body: JSON.stringify({ tags }) },
    );
    return body.session;
  }

  async getSession(sessionId: string): Promise<SessionDetail> {
    const body = await this.request<{ session: SessionDetail }>(
      `/sessions/${encodeURIComponent(sessionId)}`,
    );
    return body.session;
  }

  async getProfilePhoto(): Promise<string | null> {
    const response = await this.requestResponse("/profile/photo");
    if (response.status === 204) return null;
    return URL.createObjectURL(await response.blob());
  }

  async uploadProfilePhoto(file: File): Promise<string> {
    await this.request("/profile/photo", {
      method: "PUT",
      body: file,
      headers: { "content-type": file.type },
    });
    const photoUrl = await this.getProfilePhoto();
    if (!photoUrl) throw new ApiError(502, "PROFILE_PHOTO_UNAVAILABLE", "The uploaded photo could not be loaded.");
    return photoUrl;
  }

  async deleteProfilePhoto(): Promise<void> {
    await this.request("/profile/photo", { method: "DELETE" });
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

  async uploadPersonalAttachment(sessionId: string, file: File): Promise<AttachmentReference> {
    const body = await this.request<{ attachment: AttachmentReference }>(
      `/sessions/${encodeURIComponent(sessionId)}/attachments`,
      { method: "POST", body: file, headers: { "content-type": file.type } },
    );
    return body.attachment;
  }

  async deletePersonalAttachment(sessionId: string, attachmentId: string): Promise<void> {
    await this.request(
      `/sessions/${encodeURIComponent(sessionId)}/attachments/${encodeURIComponent(attachmentId)}`,
      { method: "DELETE" },
    );
  }

  async getPersonalAttachment(sessionId: string, attachmentId: string): Promise<Blob> {
    const response = await this.requestResponse(
      `/sessions/${encodeURIComponent(sessionId)}/attachments/${encodeURIComponent(attachmentId)}`,
    );
    return response.blob();
  }

  async transcribePersonalAttachment(sessionId: string, attachmentId: string): Promise<string> {
    const body = await this.request<{ transcript: string }>(
      `/sessions/${encodeURIComponent(sessionId)}/attachments/${encodeURIComponent(attachmentId)}/transcribe`,
      { method: "POST", body: "{}" },
    );
    return body.transcript;
  }

  async transcribePersonalVoice(sessionId: string, file: File): Promise<string> {
    const response = await this.requestResponse(
      `/sessions/${encodeURIComponent(sessionId)}/voice/transcribe`,
      { method: "POST", body: file, headers: { "content-type": file.type } },
    );
    return ((await response.json()) as { transcript: string }).transcript;
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
    session?: JournalSession;
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

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/x-ndjson")) {
      throw new ApiError(502, "INVALID_STREAM", "The response stream could not be started.");
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");
    const decoder = new TextDecoder();
    let buffer = "";
    let finalExchange: MessageExchange | null = null;

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
          
          const parsed = streamEventSchema.safeParse(safeJsonParse(line));
          if (!parsed.success) {
            throw new ApiError(502, "INVALID_STREAM", "The response stream was invalid.");
          }

          if (parsed.data.type === "chunk") {
            onChunk(parsed.data.text);
          } else if (parsed.data.type === "complete") {
            finalExchange = parsed.data.exchange;
          } else if (parsed.data.type === "error") {
            throw new ApiError(parsed.data.status, parsed.data.code, parsed.data.message);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    
    if (!finalExchange) {
      throw new ApiError(502, "INCOMPLETE_STREAM", "The response stream ended before completion.");
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

  async archiveSession(sessionId: string): Promise<JournalSession> {
    const body = await this.request<{ session: JournalSession }>(
      `/sessions/${encodeURIComponent(sessionId)}/archive`,
      { method: "POST", body: "{}" },
    );
    return body.session;
  }

  async restoreSession(sessionId: string): Promise<JournalSession> {
    const body = await this.request<{ session: JournalSession }>(
      `/sessions/${encodeURIComponent(sessionId)}/restore`,
      { method: "POST", body: "{}" },
    );
    return body.session;
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

  async listCheckIns(sessionId: string): Promise<PersonalCheckIn[]> {
    const body = await this.request<{ checkIns: PersonalCheckIn[] }>(
      `/sessions/${encodeURIComponent(sessionId)}/check-ins`,
    );
    return body.checkIns;
  }

  async createCheckIn(sessionId: string, input: CreateCheckInInput): Promise<PersonalCheckIn> {
    const body = await this.request<{ checkIn: PersonalCheckIn }>(
      `/sessions/${encodeURIComponent(sessionId)}/check-ins`,
      { method: "POST", body: JSON.stringify(input) },
    );
    return body.checkIn;
  }

  async deleteCheckIn(sessionId: string, checkInId: string): Promise<void> {
    await this.request(
      `/sessions/${encodeURIComponent(sessionId)}/check-ins/${encodeURIComponent(checkInId)}`,
      { method: "DELETE" },
    );
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

  async askPersonalMemory(query: string): Promise<PersonalMemoryAnswer> {
    const body = await this.request<PersonalMemoryAnswer>("/personal/memory/ask", {
      method: "POST",
      body: JSON.stringify({ requestId: crypto.randomUUID(), query }),
    });
    return body;
  }

  async buildPersonalMemoryIndex(limit = 20): Promise<MemoryIndexBuildResult> {
    return this.request<MemoryIndexBuildResult>("/personal/memory/index", {
      method: "POST",
      body: JSON.stringify({ limit }),
    });
  }

  async listPersonalOpenLoops(): Promise<PersonalOpenLoop[]> {
    const body = await this.request<{ openLoops: PersonalOpenLoop[] }>("/personal/open-loops");
    return body.openLoops;
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

  async listOrganizationSessions(
    orgId: string,
    status: "active" | "archived" = "active",
  ): Promise<OrganizationSession[]> {
    const body = await this.request<{ sessions: OrganizationSession[] }>(
      `/organizations/${encodeURIComponent(orgId)}/sessions${status === "archived" ? "?status=archived" : ""}`,
    );
    return body.sessions;
  }

  async askOrganizationMemory(orgId: string, query: string): Promise<OrganizationMemoryAnswer> {
    return this.request<OrganizationMemoryAnswer>(
      `/organizations/${encodeURIComponent(orgId)}/memory/ask`,
      {
        method: "POST",
        body: JSON.stringify({ requestId: crypto.randomUUID(), query }),
      },
    );
  }

  async buildOrganizationMemoryIndex(orgId: string, limit = 20): Promise<MemoryIndexBuildResult> {
    return this.request<MemoryIndexBuildResult>(
      `/organizations/${encodeURIComponent(orgId)}/memory/index`,
      { method: "POST", body: JSON.stringify({ limit }) },
    );
  }

  async getOrganizationEodSettings(orgId: string): Promise<OrganizationEodSettings> {
    const body = await this.request<{ settings: OrganizationEodSettings }>(
      `/organizations/${encodeURIComponent(orgId)}/eod-settings`,
    );
    return body.settings;
  }

  async saveOrganizationEodSettings(
    orgId: string,
    settings: Omit<OrganizationEodSettings, "updatedBy" | "updatedAt">,
  ): Promise<OrganizationEodSettings> {
    const body = await this.request<{ settings: OrganizationEodSettings }>(
      `/organizations/${encodeURIComponent(orgId)}/eod-settings`,
      { method: "PUT", body: JSON.stringify(settings) },
    );
    return body.settings;
  }

  async getOrganizationEodStatus(orgId: string, localDate: string): Promise<OrganizationEodStatus> {
    const body = await this.request<{ status: OrganizationEodStatus }>(
      `/organizations/${encodeURIComponent(orgId)}/eod-status/${encodeURIComponent(localDate)}`,
    );
    return body.status;
  }

  async getOrganizationEodSubmissionCount(orgId: string, localDate: string): Promise<number | null> {
    const body = await this.request<{ submittedCount: number | null }>(
      `/organizations/${encodeURIComponent(orgId)}/eod-submission-count/${encodeURIComponent(localDate)}`,
    );
    return body.submittedCount;
  }

  async saveOrganizationEodStatus(
    orgId: string,
    localDate: string,
    changes: { dismissed?: boolean; submittedSessionId?: string | null },
  ): Promise<OrganizationEodStatus> {
    const body = await this.request<{ status: OrganizationEodStatus }>(
      `/organizations/${encodeURIComponent(orgId)}/eod-status/${encodeURIComponent(localDate)}`,
      { method: "PUT", body: JSON.stringify(changes) },
    );
    return body.status;
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

  async listOrganizationTags(orgId: string): Promise<string[]> {
    const body = await this.request<{ tags: string[] }>(
      `/organizations/${encodeURIComponent(orgId)}/tags?limit=100`,
    );
    return body.tags;
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

  async updateOrganizationSessionTags(orgId: string, sessionId: string, tags: string[]): Promise<OrganizationSession> {
    const body = await this.request<{ session: OrganizationSession }>(
      `/organizations/${encodeURIComponent(orgId)}/sessions/${encodeURIComponent(sessionId)}/tags`,
      { method: "PATCH", body: JSON.stringify({ tags }) },
    );
    return body.session;
  }

  async renameOrganizationSession(orgId: string, sessionId: string, title: string): Promise<OrganizationSession> {
    const body = await this.request<{ session: OrganizationSession }>(
      `/organizations/${encodeURIComponent(orgId)}/sessions/${encodeURIComponent(sessionId)}`,
      { method: "PATCH", body: JSON.stringify({ title }) },
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
    session?: OrganizationSession;
  }> {
    return this.addOrganizationMessageStream(orgId, sessionId, input, () => undefined);
  }

  async addOrganizationMessageStream(
    orgId: string,
    sessionId: string,
    input: CreateMessageInput,
    onChunk: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<{
    userMessage: OrganizationMessage;
    assistantMessage: OrganizationMessage;
    messageCount: number;
    session?: OrganizationSession;
  }> {
    const path = `/organizations/${encodeURIComponent(orgId)}/sessions/${encodeURIComponent(sessionId)}/messages`;
    const init = { method: "POST", body: JSON.stringify(input), signal };
    let response = await this.send(path, init, false);
    if (!response.ok) {
      const failure = await readFailure(response);
      if (shouldForceTokenRefresh({ ...failure, completedRefreshes: 0, method: "POST" })) {
        response = await this.send(path, init, true);
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
    if (!(response.headers.get("content-type") ?? "").includes("application/x-ndjson")) {
      throw new ApiError(502, "INVALID_STREAM", "The team response stream could not be started.");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new ApiError(502, "INVALID_STREAM", "The team response stream could not be started.");
    const decoder = new TextDecoder();
    let buffer = "";
    let finalExchange: { userMessage: OrganizationMessage; assistantMessage: OrganizationMessage; messageCount: number; session?: OrganizationSession } | null = null;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!line) continue;
          const parsed = organizationStreamEventSchema.safeParse(safeJsonParse(line));
          if (!parsed.success) throw new ApiError(502, "INVALID_STREAM", "The team response stream was invalid.");
          if (parsed.data.type === "chunk") onChunk(parsed.data.text);
          else if (parsed.data.type === "complete") finalExchange = parsed.data.exchange;
          else if (parsed.data.type === "error") {
            throw new ApiError(parsed.data.status, parsed.data.code, parsed.data.message);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    if (!finalExchange) {
      throw new ApiError(502, "INCOMPLETE_STREAM", "The team response stream ended before completion.");
    }
    return finalExchange;
  }

  async uploadOrganizationAttachment(
    orgId: string,
    sessionId: string,
    file: File,
  ): Promise<AttachmentReference> {
    const body = await this.request<{ attachment: AttachmentReference }>(
      `/organizations/${encodeURIComponent(orgId)}/sessions/${encodeURIComponent(sessionId)}/attachments`,
      { method: "POST", body: file, headers: { "content-type": file.type } },
    );
    return body.attachment;
  }

  async deleteOrganizationAttachment(orgId: string, sessionId: string, attachmentId: string): Promise<void> {
    await this.request(
      `/organizations/${encodeURIComponent(orgId)}/sessions/${encodeURIComponent(sessionId)}/attachments/${encodeURIComponent(attachmentId)}`,
      { method: "DELETE" },
    );
  }

  async getOrganizationAttachment(orgId: string, sessionId: string, attachmentId: string): Promise<Blob> {
    const response = await this.requestResponse(
      `/organizations/${encodeURIComponent(orgId)}/sessions/${encodeURIComponent(sessionId)}/attachments/${encodeURIComponent(attachmentId)}`,
    );
    return response.blob();
  }

  async transcribeOrganizationAttachment(orgId: string, sessionId: string, attachmentId: string): Promise<string> {
    const body = await this.request<{ transcript: string }>(
      `/organizations/${encodeURIComponent(orgId)}/sessions/${encodeURIComponent(sessionId)}/attachments/${encodeURIComponent(attachmentId)}/transcribe`,
      { method: "POST", body: "{}" },
    );
    return body.transcript;
  }

  async transcribeOrganizationVoice(orgId: string, sessionId: string, file: File): Promise<string> {
    const response = await this.requestResponse(
      `/organizations/${encodeURIComponent(orgId)}/sessions/${encodeURIComponent(sessionId)}/voice/transcribe`,
      { method: "POST", body: file, headers: { "content-type": file.type } },
    );
    return ((await response.json()) as { transcript: string }).transcript;
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

  async archiveOrganizationSession(orgId: string, sessionId: string): Promise<OrganizationSession> {
    const body = await this.request<{ session: OrganizationSession }>(
      `/organizations/${encodeURIComponent(orgId)}/sessions/${encodeURIComponent(sessionId)}/archive`,
      { method: "POST", body: "{}" },
    );
    return body.session;
  }

  async restoreOrganizationSession(orgId: string, sessionId: string): Promise<OrganizationSession> {
    const body = await this.request<{ session: OrganizationSession }>(
      `/organizations/${encodeURIComponent(orgId)}/sessions/${encodeURIComponent(sessionId)}/restore`,
      { method: "POST", body: "{}" },
    );
    return body.session;
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

function safeJsonParse(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return null;
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
