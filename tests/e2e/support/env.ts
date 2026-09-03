// Shared constants for the end-to-end harness. Everything here is synthetic: the demo project id
// is recognised by the Firebase CLI as emulator-only, and the browser keys are placeholders that
// never reach a real Google service.

export const E2E_PROJECT_ID = "demo-cognaxis-e2e";
export const AUTH_EMULATOR_HOST = "127.0.0.1:9099";
export const E2E_SERVER_PORT = 4173;
export const E2E_BASE_URL = `http://127.0.0.1:${E2E_SERVER_PORT}`;

export const E2E_PASSWORD = "E2e-password-1";

export const SUPER_ADMIN = {
  uid: "e2e-super-admin",
  email: "superadmin@cognaxis-e2e.test",
  password: E2E_PASSWORD,
};

// Compiled into the browser bundle by the end-to-end build only.
export const E2E_CLIENT_BUILD_ENV = {
  VITE_FIREBASE_API_KEY: "demo-e2e-browser-key",
  VITE_FIREBASE_AUTH_DOMAIN: `${E2E_PROJECT_ID}.firebaseapp.com`,
  VITE_FIREBASE_PROJECT_ID: E2E_PROJECT_ID,
  VITE_FIREBASE_APP_ID: "1:000000000000:web:e2e",
  VITE_FIREBASE_AUTH_EMULATOR_HOST: AUTH_EMULATOR_HOST,
  VITE_GOOGLE_MAPS_API_KEY: "demo-e2e-maps-key",
  VITE_E2E_FAKE_MAPS: "true",
} as const;
