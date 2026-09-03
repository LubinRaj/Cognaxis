import { readFileSync } from "node:fs";
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";

// Cognaxis routes every confidential read and write through its authenticated backend with the
// Admin SDK, so the deployed rules must deny ALL direct browser access — signed in or not, to
// every collection that exists in the data model.
let environment: RulesTestEnvironment;

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: "cognaxis-rules-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => {
  await environment?.cleanup();
});

const PRIVATE_PATHS = [
  "users/user_alpha",
  "users/user_alpha/journalSessions/session_1",
  "users/user_alpha/personalSignals/session_1",
  "users/user_alpha/personalInsights/day_2026-09-03",
  "users/user_alpha/insightGenerationLeases/day_2026-09-03",
  "users/user_alpha/organizationMemberships/org_1",
  "organizations/org_1",
  "organizations/org_1/members/user_alpha",
  "organizations/org_1/invites/invite_1",
  "organizations/org_1/auditEvents/event_1",
  "organizations/org_1/workspaceSessions/session_1",
  "platformUsers/user_alpha",
  "platformControl/access",
  "platformAdminAudit/event_1",
];

describe("Firestore rules deny all direct client access", () => {
  it("denies every read and write to an unauthenticated browser", async () => {
    const anonymous = environment.unauthenticatedContext().firestore();
    for (const path of PRIVATE_PATHS) {
      await assertFails(getDoc(doc(anonymous, path)));
      await assertFails(setDoc(doc(anonymous, path), { probe: true }));
    }
  });

  it("denies every read and write even to the authenticated owner of the data", async () => {
    const owner = environment
      .authenticatedContext("user_alpha", { email_verified: true })
      .firestore();
    for (const path of PRIVATE_PATHS) {
      await assertFails(getDoc(doc(owner, path)));
      await assertFails(setDoc(doc(owner, path), { probe: true }));
    }
  });

  it("denies collection queries that could sweep other tenants", async () => {
    const authenticated = environment.authenticatedContext("user_bravo").firestore();
    for (const path of ["users", "organizations", "platformUsers", "platformAdminAudit"]) {
      await assertFails(getDocs(collection(authenticated, path)));
    }
    expect(PRIVATE_PATHS.length).toBeGreaterThan(0);
  });
});
