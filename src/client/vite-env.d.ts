/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  /** Public Maps JavaScript browser key; restricted by referrer and API, never a secret. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  /**
   * Firebase Auth emulator host for automated end-to-end builds only. Deployed builds never
   * define it, and the connection additionally requires a loopback hostname at runtime.
   */
  readonly VITE_FIREBASE_AUTH_EMULATOR_HOST?: string;
  /** Selects the deterministic Maps adapter in end-to-end builds; never set for deployments. */
  readonly VITE_E2E_FAKE_MAPS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
