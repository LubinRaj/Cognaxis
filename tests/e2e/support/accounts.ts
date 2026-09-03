import { randomUUID } from "node:crypto";
import { AUTH_EMULATOR_HOST, E2E_CLIENT_BUILD_ENV, E2E_PASSWORD, E2E_PROJECT_ID } from "./env.js";

// Synthetic account helpers backed by the Firebase Auth emulator's REST surface. The "owner"
// bearer token is an emulator-only convention for privileged operations; no real Firebase
// project ever accepts it.

export type SyntheticAccount = {
  uid: string;
  email: string;
  password: string;
};

const identityToolkit = `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`;
const apiKey = E2E_CLIENT_BUILD_ENV.VITE_FIREBASE_API_KEY;

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@cognaxis-e2e.test`;
}

async function post(url: string, body: unknown, owner = false): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(owner ? { authorization: "Bearer owner" } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Auth emulator request failed (${response.status}): ${await response.text()}`);
  }
  return response.json();
}

export async function createUser(prefix: string, emailVerified: boolean): Promise<SyntheticAccount> {
  const email = uniqueEmail(prefix);
  const created = (await post(`${identityToolkit}/accounts:signUp?key=${apiKey}`, {
    email,
    password: E2E_PASSWORD,
    returnSecureToken: true,
  })) as { localId: string };

  if (emailVerified) {
    await post(
      `${identityToolkit}/accounts:update?key=${apiKey}`,
      { localId: created.localId, emailVerified: true },
      true,
    );
  }

  return { uid: created.localId, email, password: E2E_PASSWORD };
}

export function createVerifiedUser(prefix = "user"): Promise<SyntheticAccount> {
  return createUser(prefix, true);
}

export type OobCode = {
  email: string;
  oobCode: string;
  oobLink: string;
  requestType: string;
};

// The emulator records every out-of-band action (verification, password reset) it would have
// emailed, so tests can follow the exact links a real user would receive.
export async function listOobCodes(): Promise<OobCode[]> {
  const response = await fetch(
    `http://${AUTH_EMULATOR_HOST}/emulator/v1/projects/${E2E_PROJECT_ID}/oobCodes`,
  );
  if (!response.ok) {
    throw new Error(`Could not list emulator oobCodes (${response.status}).`);
  }
  const body = (await response.json()) as { oobCodes: OobCode[] };
  return body.oobCodes;
}
