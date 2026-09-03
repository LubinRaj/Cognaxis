import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from "firebase/auth";

const firebaseConfig = {
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
};

function isProvided(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.startsWith("replace-with-");
}

export const missingFirebaseConfigKeys: readonly string[] = Object.entries(firebaseConfig)
  .filter(([, value]) => !isProvided(value))
  .map(([key]) => key);

export const isFirebaseConfigured = missingFirebaseConfigKeys.length === 0;

// Firebase owns session persistence and token refresh. The persistence chain is declared here so
// the choice is explicit and reviewable; Cognaxis never reads or writes the stored session itself.
function createAuth(app: FirebaseApp): Auth {
  try {
    return initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    return getAuth(app);
  }
}

export const firebaseApp: FirebaseApp | null = isFirebaseConfigured
  ? getApps().length > 0
    ? getApp()
    : initializeApp({
        apiKey: firebaseConfig.VITE_FIREBASE_API_KEY,
        authDomain: firebaseConfig.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: firebaseConfig.VITE_FIREBASE_PROJECT_ID,
        appId: firebaseConfig.VITE_FIREBASE_APP_ID,
      })
  : null;

export const auth: Auth | null = firebaseApp ? createAuth(firebaseApp) : null;

// Automated end-to-end builds point authentication at the local Firebase Auth emulator. Both
// conditions are required: the host is compiled in only by the test build, and the page must be
// served from a loopback address, so a deployed bundle can never talk to an emulator.
const authEmulatorHost = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST;
if (
  auth &&
  typeof authEmulatorHost === "string" &&
  authEmulatorHost.length > 0 &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
) {
  connectAuthEmulator(auth, `http://${authEmulatorHost}`, { disableWarnings: true });
}

export function createGoogleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}
