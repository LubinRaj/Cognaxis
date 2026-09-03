// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  consumeIntendedPath,
  isSafeAppPath,
  rememberIntendedPath,
} from "../../src/client/shell/post-auth-redirect.js";

describe("post-authentication redirect", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("accepts only same-application paths", () => {
    expect(isSafeAppPath("/app/journal")).toBe(true);
    expect(isSafeAppPath("/app/organizations/org_123")).toBe(true);
    expect(isSafeAppPath("/app")).toBe(true);

    expect(isSafeAppPath("https://evil.test/app")).toBe(false);
    expect(isSafeAppPath("//evil.test/app")).toBe(false);
    expect(isSafeAppPath("/auth/action")).toBe(false);
    expect(isSafeAppPath("/app/journal?next=https://evil.test")).toBe(false);
    expect(isSafeAppPath("/app/journal#token=abc")).toBe(false);
    expect(isSafeAppPath("javascript:alert(1)")).toBe(false);
  });

  it("replays a remembered path exactly once", () => {
    rememberIntendedPath("/app/insights");
    expect(consumeIntendedPath()).toBe("/app/insights");
    expect(consumeIntendedPath()).toBeNull();
  });

  it("never stores an unsafe path", () => {
    rememberIntendedPath("https://evil.test/app");
    expect(consumeIntendedPath()).toBeNull();
  });

  it("never replays a value that was tampered into storage", () => {
    window.sessionStorage.setItem("cognaxis.postAuthPath", "https://evil.test");
    expect(consumeIntendedPath()).toBeNull();
  });
});
