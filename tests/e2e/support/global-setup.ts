import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { E2E_CLIENT_BUILD_ENV } from "./env.js";

// Builds the browser bundle for the end-to-end run with the synthetic demo configuration and the
// Auth-emulator/deterministic-maps flags compiled in. The output intentionally lands in
// dist/client — the exact directory the production server serves — so the tests exercise the real
// static pipeline. Run `npm run build` afterwards if you need a deployable bundle again.

export default function globalSetup(): void {
  const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
  const indexHtml = path.join(repositoryRoot, "dist/client/index.html");

  if (process.env.PW_SKIP_BUILD === "1" && existsSync(indexHtml)) {
    console.log("PW_SKIP_BUILD=1 — reusing the existing dist/client bundle.");
    return;
  }

  const result = spawnSync("npx", ["vite", "build"], {
    cwd: repositoryRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      ...E2E_CLIENT_BUILD_ENV,
      NODE_ENV: "production",
    },
  });

  if (result.status !== 0) {
    throw new Error("The end-to-end client build failed.");
  }
  if (!existsSync(indexHtml)) {
    throw new Error("The end-to-end client build produced no dist/client/index.html.");
  }
}
