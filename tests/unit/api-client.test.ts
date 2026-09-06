import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { User } from "firebase/auth";
import { ApiClient, ApiError } from "../../src/client/lib/api-client.js";

type FetchCall = { url: string; init: RequestInit };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function failure(status: number, code: string): Response {
  return jsonResponse(status, { error: { code, message: "Generic failure.", requestId: "req-1" } });
}

describe("ApiClient bearer attachment and bounded recovery", () => {
  let calls: FetchCall[];
  let responses: Response[];
  let getIdToken: ReturnType<typeof vi.fn>;
  let user: User;
  let onSessionExpired: Mock<() => void>;
  let onEmailVerificationRequired: Mock<() => void>;

  beforeEach(() => {
    calls = [];
    responses = [];
    getIdToken = vi
      .fn()
      .mockImplementation((force?: boolean) =>
        Promise.resolve(force === true ? "refreshed-token" : "current-token"),
      );
    user = { uid: "user_alpha", getIdToken } as unknown as User;
    onSessionExpired = vi.fn<() => void>();
    onEmailVerificationRequired = vi.fn<() => void>();

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init: RequestInit) => {
        calls.push({ url, init });
        const next = responses.shift();
        if (!next) throw new Error("No queued response for " + url);
        return Promise.resolve(next);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function client() {
    return new ApiClient(() => user, { onSessionExpired, onEmailVerificationRequired });
  }

  function headerOf(call: FetchCall, name: string): string | undefined {
    return (call.init.headers as Record<string, string> | undefined)?.[name];
  }

  it("requests a current token immediately before each call", async () => {
    responses.push(jsonResponse(200, { sessions: [] }), jsonResponse(200, { sessions: [] }));

    await client().listSessions();
    await client().listSessions();

    expect(getIdToken).toHaveBeenCalledTimes(2);
    expect(getIdToken).toHaveBeenNthCalledWith(1, false);
    expect(headerOf(calls[0], "authorization")).toBe("Bearer current-token");
  });

  it("sends the token only in the Authorization header and never caches", async () => {
    responses.push(jsonResponse(200, { sessions: [] }));

    await client().listSessions();

    expect(calls[0].url).toBe("/api/v1/sessions?limit=30");
    expect(calls[0].url).not.toContain("current-token");
    expect(calls[0].init.cache).toBe("no-store");
    expect(calls[0].init.body).toBeUndefined();
  });

  it("cannot have its Authorization header overridden by a caller", async () => {
    responses.push(jsonResponse(201, { session: { id: "s1" } }));

    await client().createSession({ title: "Reflection" });

    expect(headerOf(calls[0], "authorization")).toBe("Bearer current-token");
    expect(headerOf(calls[0], "content-type")).toBe("application/json");
  });

  it("forces exactly one refresh and replays after a 401 UNAUTHENTICATED", async () => {
    responses.push(failure(401, "UNAUTHENTICATED"), jsonResponse(200, { sessions: [] }));

    await client().listSessions();

    expect(calls).toHaveLength(2);
    expect(getIdToken).toHaveBeenNthCalledWith(1, false);
    expect(getIdToken).toHaveBeenNthCalledWith(2, true);
    expect(headerOf(calls[1], "authorization")).toBe("Bearer refreshed-token");
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it("keeps the session intact after the single retry also fails, with no loop", async () => {
    responses.push(failure(401, "UNAUTHENTICATED"), failure(401, "UNAUTHENTICATED"));

    await expect(client().listSessions()).rejects.toBeInstanceOf(ApiError);

    expect(calls).toHaveLength(2);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it("recovers silently when verification completed since the token was issued", async () => {
    responses.push(failure(403, "EMAIL_VERIFICATION_REQUIRED"), jsonResponse(200, { sessions: [] }));

    await client().listSessions();

    expect(calls).toHaveLength(2);
    expect(getIdToken).toHaveBeenNthCalledWith(2, true);
    expect(headerOf(calls[1], "authorization")).toBe("Bearer refreshed-token");
    expect(onEmailVerificationRequired).not.toHaveBeenCalled();
  });

  it("reports a verification failure only after the refreshed replay also fails", async () => {
    responses.push(
      failure(403, "EMAIL_VERIFICATION_REQUIRED"),
      failure(403, "EMAIL_VERIFICATION_REQUIRED"),
    );
    await expect(client().listSessions()).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(2);
    expect(onEmailVerificationRequired).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it("does not retry an authorization failure", async () => {
    responses.push(failure(403, "FORBIDDEN"));
    await expect(client().listSessions()).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(1);
  });

  it("retries one transient rate-limited read after the server cooldown", async () => {
    responses.push(
      new Response(JSON.stringify({ error: { code: "RATE_LIMITED", message: "Generic failure." } }), {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "0" },
      }),
      jsonResponse(200, { sessions: [] }),
    );

    await expect(client().listSessions()).resolves.toEqual([]);
    expect(calls).toHaveLength(2);
    expect(getIdToken).toHaveBeenCalledTimes(2);
  });

  it("does not retry rate-limited writes, validation failures, or server errors", async () => {
    for (const [status, code] of [
      [400, "INVALID_REQUEST"],
      [404, "NOT_FOUND"],
      [500, "INTERNAL_ERROR"],
    ] as const) {
      calls.length = 0;
      responses.push(failure(status, code));
      await expect(client().listSessions()).rejects.toBeInstanceOf(ApiError);
      expect(calls).toHaveLength(1);
    }

    responses.push(failure(429, "RATE_LIMITED"));
    await expect(client().createSession()).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(2);

    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(getIdToken).not.toHaveBeenCalledWith(true);
  });

  it("does not replay a recent-authentication rejection and keeps the session intact", async () => {
    responses.push(failure(401, "RECENT_AUTH_REQUIRED"));

    await expect(client().deleteSession("s1")).rejects.toBeInstanceOf(ApiError);

    expect(calls).toHaveLength(1);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it("replays a write only because the server rejected it before executing", async () => {
    responses.push(failure(401, "UNAUTHENTICATED"), jsonResponse(201, { session: { id: "s2" } }));

    const session = await client().createSession({ title: "Reflection" });

    expect(session.id).toBe("s2");
    expect(calls).toHaveLength(2);
    expect(calls[0].init.body).toBe(calls[1].init.body);
  });

  it("refuses to call the API without a signed-in Firebase user", async () => {
    const anonymous = new ApiClient(() => null);
    await expect(anonymous.listSessions()).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(0);
  });

  it("surfaces the generic server message and never a raw body", async () => {
    responses.push(failure(500, "INTERNAL_ERROR"));

    await expect(client().listSessions()).rejects.toMatchObject({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Generic failure.",
    });
  });

  it("handles a 204 response without parsing a body", async () => {
    responses.push(new Response(null, { status: 204 }));

    await expect(client().deleteSession("s1")).resolves.toBeUndefined();
  });
});
