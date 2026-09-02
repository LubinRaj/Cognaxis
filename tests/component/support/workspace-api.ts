import { vi } from "vitest";
import type { JournalSession, PersonalMemory, SessionDetail } from "../../../src/shared/schemas";

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
  /** Overrides for a specific route; return null to fall through to the default behaviour. */
  handler: ((route: ApiRoute) => Response | null) | null;
  /** Resolves the next matching request only when released, for race and pending-state tests. */
  gate: { pending: (() => void)[]; hold: boolean };
};

export function makeSession(overrides: Partial<JournalSession> & { id: string }): JournalSession {
  return {
    title: `Reflection ${overrides.id}`,
    status: "active",
    messageCount: 0,
    summarizedMessageCount: 0,
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

      if (route.method === "GET" && url.startsWith("/api/v1/sessions?")) {
        return json(200, { sessions: stub.sessions });
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

      const messageMatch = /^\/api\/v1\/sessions\/([^/?]+)\/messages$/.exec(url);
      if (messageMatch) {
        const id = decodeURIComponent(messageMatch[1]);
        const content = (route.body as { content: string }).content;
        const index = stub.details.get(id)?.messages.length ?? 0;
        return json(201, {
          userMessage: {
            id: `${id}-u${index}`,
            role: "user",
            content,
            createdAt: "2026-09-10T09:00:00.000Z",
          },
          assistantMessage: {
            id: `${id}-a${index}`,
            role: "model",
            content: "A grounded reply from Cognaxis.",
            createdAt: "2026-09-10T09:00:01.000Z",
          },
          summary: null,
        });
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
