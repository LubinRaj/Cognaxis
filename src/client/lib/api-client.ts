import type { User } from "firebase/auth";
import type {
  CreateMessageInput,
  CreateSessionInput,
  JournalSession,
  PersonalMemory,
  SessionDetail,
} from "../../shared/schemas";

type ErrorBody = { error?: { message?: string; requestId?: string } };

export class ApiClient {
  constructor(private readonly getUser: () => User | null) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const user = this.getUser();
    if (!user) throw new Error("Please sign in again.");
    const token = await user.getIdToken();
    const response = await fetch(`/api/v1${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ErrorBody;
      throw new Error(body.error?.message ?? "The request could not be completed.");
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
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
