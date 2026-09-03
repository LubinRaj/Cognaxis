import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/test-app.js";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const clientDirectory = path.join(repositoryRoot, "dist", "client");
const indexHtmlPath = path.join(clientDirectory, "index.html");

// The production server must be exercised against the real compiled client, otherwise a wrong
// static path resolves silently in tests and fails only on Cloud Run.
async function createProductionApp() {
  return createTestApp({
    environment: {
      NODE_ENV: "production",
      GOOGLE_CLOUD_PROJECT: "synthetic-project",
      GEMINI_API_KEY_SECRET: "projects/synthetic-project/secrets/gemini/versions/1",
    },
  });
}

describe("production static serving", () => {
  beforeAll(() => {
    if (!existsSync(indexHtmlPath)) {
      execFileSync("npx", ["vite", "build", "--logLevel", "error"], {
        cwd: repositoryRoot,
        env: { ...process.env, NODE_ENV: "production" },
        stdio: "ignore",
        timeout: 180_000,
      });
    }
  }, 200_000);

  it("serves the application HTML at the root", async () => {
    const { app } = await createProductionApp();
    const response = await request(app).get("/").expect(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.text).toContain('<div id="root">');
  });

  it("serves the application HTML for deep links", async () => {
    const { app } = await createProductionApp();
    for (const deepLink of ["/app/insights", "/app/organizations/org_123", "/join"]) {
      const response = await request(app).get(deepLink).expect(200);
      expect(response.headers["content-type"]).toContain("text/html");
      expect(response.text).toContain('<div id="root">');
    }
  });

  it("serves a real built asset and returns 404 for a missing one", async () => {
    const { app } = await createProductionApp();

    const html = readFileSync(indexHtmlPath, "utf8");
    const assetMatch = /\/assets\/[^"']+\.js/.exec(html);
    expect(assetMatch).not.toBeNull();
    await request(app).get(assetMatch![0]).expect(200);

    const missing = await request(app)
      .get("/assets/definitely-missing-4f9c1a.js")
      .expect(404);
    expect(missing.headers["content-type"]).toContain("application/json");
  });

  it("keeps the health endpoint working", async () => {
    const { app } = await createProductionApp();
    const response = await request(app).get("/api/health").expect(200);
    expect(JSON.parse(response.text)).toEqual({ status: "ok" });
  });

  it("never redirects unknown API routes to the application shell", async () => {
    const { app } = await createProductionApp();

    const outsideV1 = await request(app).get("/api/definitely-unknown").expect(404);
    expect(outsideV1.headers["content-type"]).toContain("application/json");
    expect(outsideV1.text).not.toContain("<html");

    // Unknown private paths still answer through the authenticated pipeline, not the SPA.
    const insideV1 = await request(app).get("/api/v1/definitely-unknown").expect(401);
    expect(insideV1.headers["content-type"]).toContain("application/json");
    expect(insideV1.text).not.toContain("<html");
  });
});
