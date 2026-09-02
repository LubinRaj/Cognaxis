import { describe, expect, it } from "vitest";
import {
  parseActionLink,
  resolveContinueUrl,
  SUPPORTED_ACTION_MODES,
} from "../../src/client/auth/action-link.js";

describe("action link parsing", () => {
  it("accepts each documented Firebase mode", () => {
    for (const mode of SUPPORTED_ACTION_MODES) {
      const parsed = parseActionLink(`?mode=${mode}&oobCode=abcd1234efgh`);
      expect(parsed).toEqual({
        status: "ready",
        mode,
        oobCode: "abcd1234efgh",
        continueUrl: null,
      });
    }
  });

  it("rejects an unknown or missing mode", () => {
    expect(parseActionLink("?mode=signIn&oobCode=abcd1234efgh").status).toBe("unsupported");
    expect(parseActionLink("?mode=revertSecondFactorAddition&oobCode=abcd1234efgh").status).toBe(
      "unsupported",
    );
    expect(parseActionLink("?oobCode=abcd1234efgh").status).toBe("unsupported");
    expect(parseActionLink("").status).toBe("unsupported");
  });

  it("rejects a missing or malformed one-time code", () => {
    expect(parseActionLink("?mode=verifyEmail").status).toBe("unsupported");
    expect(parseActionLink("?mode=verifyEmail&oobCode=").status).toBe("unsupported");
    expect(parseActionLink("?mode=verifyEmail&oobCode=short").status).toBe("unsupported");
    expect(parseActionLink("?mode=verifyEmail&oobCode=has spaces here").status).toBe("unsupported");
    expect(parseActionLink("?mode=verifyEmail&oobCode=<script>alert(1)</script>").status).toBe(
      "unsupported",
    );
    expect(parseActionLink(`?mode=verifyEmail&oobCode=${"a".repeat(600)}`).status).toBe(
      "unsupported",
    );
  });

  it("ignores the informational apiKey and lang parameters", () => {
    const parsed = parseActionLink(
      "?mode=verifyEmail&oobCode=abcd1234efgh&apiKey=AIzaSyOTHERPROJECT&lang=fr",
    );

    expect(parsed).toEqual({
      status: "ready",
      mode: "verifyEmail",
      oobCode: "abcd1234efgh",
      continueUrl: null,
    });
    expect(JSON.stringify(parsed)).not.toContain("AIzaSy");
  });

  it("carries a continuation candidate through for separate validation", () => {
    const parsed = parseActionLink(
      "?mode=resetPassword&oobCode=abcd1234efgh&continueUrl=%2Fjournal",
    );
    expect(parsed).toMatchObject({ continueUrl: "/journal" });
  });
});

describe("continuation allowlisting", () => {
  const origin = "https://cognaxis.example";

  it("accepts a same-origin path", () => {
    expect(resolveContinueUrl("/journal", origin)).toBe("/journal");
    expect(resolveContinueUrl(`${origin}/journal?tab=recent`, origin)).toBe("/journal?tab=recent");
    expect(resolveContinueUrl(`${origin}/journal#top`, origin)).toBe("/journal#top");
  });

  it("rejects every other host", () => {
    for (const hostile of [
      "https://evil.example/steal",
      "http://cognaxis.example.evil.test/",
      "//evil.example/steal",
      "https://cognaxis.example.evil/",
      "https://user:pass@evil.example/",
    ]) {
      expect(resolveContinueUrl(hostile, origin)).toBeNull();
    }
  });

  it("rejects a non-http scheme", () => {
    for (const hostile of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "vbscript:msgbox(1)",
    ]) {
      expect(resolveContinueUrl(hostile, origin)).toBeNull();
    }
  });

  it("rejects a malformed or absent candidate", () => {
    expect(resolveContinueUrl(null, origin)).toBeNull();
    expect(resolveContinueUrl("", origin)).toBeNull();
    expect(resolveContinueUrl("http://[", origin)).toBeNull();
  });

  it("never returns an absolute URL, only an in-application path", () => {
    const resolved = resolveContinueUrl(`${origin}/journal`, origin);
    expect(resolved).not.toContain("https://");
    expect(resolved?.startsWith("/")).toBe(true);
  });
});
