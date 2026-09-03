import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  test: {
    coverage: {
      reporter: ["text", "json-summary"],
    },
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
          setupFiles: ["tests/setup/node-setup.ts"],
        },
      },
      {
        plugins: [react()],
        test: {
          name: "component",
          environment: "jsdom",
          include: ["tests/component/**/*.test.tsx"],
          setupFiles: ["tests/setup/component-setup.ts"],
          server: {
            deps: {
              // FirebaseUI must be processed rather than externalised so its internal
              // "firebase/auth" imports resolve to the synthetic module used by the tests.
              inline: [/@firebase-oss\//, /^firebase$/, /^@firebase\//],
            },
          },
        },
      },
    ],
  },
});
