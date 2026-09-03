import { defineConfig } from "vitest/config";

// Firestore security-rules tests run only against the local emulator via `npm run test:rules`
// (firebase emulators:exec). They are deliberately excluded from the default projects so the
// ordinary suite never needs a running emulator.
export default defineConfig({
  test: {
    name: "rules",
    environment: "node",
    include: ["tests/emulator/**/*.test.ts"],
  },
});
