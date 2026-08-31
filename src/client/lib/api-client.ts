import type { User } from "firebase/auth";
import {
  isSessionTerminatingResponse,
  shouldForceTokenRefresh,
} from "../auth/token-retry-policy.js";
import type {
  CreateMessageInput,
  CreateSessionInput,
  JournalSession,
  PersonalMemory,
  SessionDetail,
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
