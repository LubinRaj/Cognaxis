/**
 * One-time offline bootstrap for the first platform super admin.
 *
 * There is intentionally no HTTP endpoint that can create a super admin. This script must be run
 * by the project owner with application-default credentials that can write to Firestore:
 *
 *   npx tsx scripts/admin/bootstrap-super-admin.ts <uid>
 *
 * It promotes the existing platform user record for <uid> (the user must have signed in at least
 * once) and initializes the platformControl/access counter from an actual count of active super
 * admins taken inside the same transaction. Running it again is safe: the recount makes the
 * counter converge on the true value, and the counter can never be written as zero while an
 * active super admin exists.
 */
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { FirestorePlatformUserRepository } from "../../src/server/data/firestore-platform-user-repository.js";

const uid = process.argv[2];
if (!uid || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
  console.error("Usage: npx tsx scripts/admin/bootstrap-super-admin.ts <uid>");
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({ credential: applicationDefault(), projectId: process.env.GOOGLE_CLOUD_PROJECT });
}

const repository = new FirestorePlatformUserRepository(getFirestore());

repository
  .bootstrapFirstAdmin(uid)
  .then(({ activeSuperAdminCount }) => {
    console.log(
      `Promoted ${uid} to active super admin. platformControl/access now records ` +
        `${activeSuperAdminCount} active super admin(s), counted transactionally.`,
    );
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Bootstrap failed.";
    if (message === "TARGET_NOT_FOUND") {
      console.error(
        `platformUsers/${uid} does not exist. The user must sign in to Cognaxis once before being promoted.`,
      );
    } else if (message === "COUNT_UNAVAILABLE") {
      console.error(
        "Could not count active super admins, so the access counter was not written. " +
          "Verify Firestore availability and credentials, then run this script again.",
      );
    } else {
      console.error(message);
    }
    process.exit(1);
  });
