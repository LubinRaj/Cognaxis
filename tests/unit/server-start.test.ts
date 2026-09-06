import express from "express";
import { describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { loadConfig } from "../../src/server/config/env.js";
import { startServer } from "../../src/server/start.js";

describe("server startup", () => {
  it("derives the listening port from the environment", () => {
    expect(loadConfig({ NODE_ENV: "test", PORT: "8080" }).PORT).toBe(8080);
    expect(loadConfig({ NODE_ENV: "test" }).PORT).toBe(3000);
  });

  it("rejects an invalid port instead of starting on a default", () => {
    expect(() => loadConfig({ NODE_ENV: "test", PORT: "0" })).toThrow();
    expect(() => loadConfig({ NODE_ENV: "test", PORT: "70000" })).toThrow();
  });

  it("reads GEMINI_API_KEY everywhere and requires it in production", () => {
    // One name for every environment: AI Studio injects it in Preview, and Cloud Run delivers
    // it as a Secret Manager reference exposed as an environment variable.
    expect(
      loadConfig({ NODE_ENV: "development", GEMINI_API_KEY: "synthetic-preview-key" })
        .GEMINI_API_KEY,
    ).toBe("synthetic-preview-key");
    expect(loadConfig({ NODE_ENV: "development" }).GEMINI_API_KEY).toBeUndefined();

    const production = {
      NODE_ENV: "production",
      APP_ORIGIN: "https://cognaxis.test",
      GOOGLE_CLOUD_PROJECT: "synthetic-project",
      FIREBASE_STORAGE_BUCKET: "synthetic-project.firebasestorage.app",
    } as const;
    expect(() => loadConfig(production)).toThrow();
    expect(
      loadConfig({ ...production, GEMINI_API_KEY: "synthetic-production-key" }).GEMINI_API_KEY,
    ).toBe("synthetic-production-key");
  });

  it("uses one opt-in flag for the Agent Platform fallback", () => {
    expect(loadConfig({ NODE_ENV: "test" }).AGENT_PLATFORM_FALLBACK_ENABLED).toBe(false);
    expect(
      loadConfig({
        NODE_ENV: "test",
        GOOGLE_CLOUD_PROJECT: "synthetic-project",
        GEMINI_MODEL: "gemini-3.7-flash",
        AGENT_PLATFORM_FALLBACK_ENABLED: "true",
      }).AGENT_PLATFORM_FALLBACK_ENABLED,
    ).toBe(true);
  });

  it("requires an exact application origin in production", () => {
    const production = {
      NODE_ENV: "production",
      GOOGLE_CLOUD_PROJECT: "synthetic-project",
      GEMINI_API_KEY: "synthetic-production-key",
      FIREBASE_STORAGE_BUCKET: "synthetic-project.firebasestorage.app",
    } as const;

    expect(() => loadConfig(production)).toThrow();
    expect(() => loadConfig({ ...production, APP_ORIGIN: "https://cognaxis.test/path" })).toThrow();
    expect(loadConfig({ ...production, APP_ORIGIN: "https://cognaxis.test" }).APP_ORIGIN).toBe(
      "https://cognaxis.test",
    );
  });

  it("listens on the supplied port", async () => {
    const app = express();
    app.get("/api/health", (_request, response) => {
      response.json({ status: "ok" });
    });

    const server = await new Promise<ReturnType<typeof startServer>>((resolve) => {
      const started = startServer(app, 0, () => resolve(started));
    });

    try {
      const { port } = server.address() as AddressInfo;
      expect(port).toBeGreaterThan(0);
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ok" });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
