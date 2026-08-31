import { vi } from "vitest";
import type { Auth, PasswordValidationStatus, User, UserCredential } from "firebase/auth";

export type TestUser = User & { email: string | null; emailVerified: boolean };

type IdTokenObserver = {
  next: (user: User | null) => void;
  error: (failure: unknown) => void;
};

const observers: IdTokenObserver[] = [];

export const authStub = {
  currentUser: null as User | null,
  name: "[DEFAULT]",
  app: { name: "[DEFAULT]", options: {} },
} as unknown as Auth;

export const appStub = { name: "[DEFAULT]", options: {}, automaticDataCollectionEnabled: false };

export function makeUser(overrides: Partial<TestUser> = {}): TestUser {
  const user = {
    uid: "user_alpha",
    email: "alpha@example.test",
    emailVerified: true,
    displayName: null,
    reload: vi.fn().mockResolvedValue(undefined),
    getIdToken: vi.fn().mockResolvedValue("synthetic-id-token"),
    getIdTokenResult: vi.fn().mockResolvedValue({
      claims: { email_verified: overrides.emailVerified ?? true },
    }),
    ...overrides,
  } as unknown as TestUser;
  return user;
}

export function emitUser(user: User | null) {
  (authStub as { currentUser: User | null }).currentUser = user;
  for (const observer of observers) observer.next(user);
}

export function emitObserverError(failure: unknown) {
  for (const observer of observers) observer.error(failure);
}

export function observerCount(): number {
  return observers.length;
}

export const firebaseAuthMocks = {
  onIdTokenChanged: vi.fn(
    (
      _auth: Auth,
      next: (user: User | null) => void,
      error: (failure: unknown) => void = () => undefined,
    ) => {
      const observer: IdTokenObserver = { next, error };
      observers.push(observer);
      return () => {
        const index = observers.indexOf(observer);
        if (index >= 0) observers.splice(index, 1);
      };
    },
  ),
  getRedirectResult: vi.fn().mockResolvedValue(null),
  signOut: vi.fn(() => {
    emitUser(null);
    return Promise.resolve();
  }),
  sendEmailVerification: vi.fn().mockResolvedValue(undefined),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  signInWithCredential: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  validatePassword: vi.fn(),
  initializeAuth: vi.fn(() => authStub),
  getAuth: vi.fn(() => authStub),
};

export const firebaseModuleMock = {
  auth: authStub,
  firebaseApp: appStub,
  isFirebaseConfigured: true,
  missingFirebaseConfigKeys: [] as string[],
  createGoogleProvider: () => ({ providerId: "google.com", addScope: vi.fn() }),
};

export function passwordPolicy(
  password: string,
  options: { minPasswordLength?: number; containsNumericCharacter?: boolean } = {},
): PasswordValidationStatus {
  const minPasswordLength = options.minPasswordLength ?? 12;
  const requiresNumber = options.containsNumericCharacter ?? true;
  const meetsMinPasswordLength = password.length >= minPasswordLength;
  const containsNumericCharacter = /\d/.test(password);

  return {
    isValid: meetsMinPasswordLength && (!requiresNumber || containsNumericCharacter),
    meetsMinPasswordLength,
    containsNumericCharacter: requiresNumber ? containsNumericCharacter : undefined,
    passwordPolicy: {
      customStrengthOptions: {
        minPasswordLength,
        containsNumericCharacter: requiresNumber || undefined,
      },
    },
  } as unknown as PasswordValidationStatus;
}

export function credential(user: TestUser): UserCredential {
  return { user, providerId: "password", operationType: "signIn" } as unknown as UserCredential;
}

export function resetHarness() {
  observers.length = 0;
  (authStub as { currentUser: User | null }).currentUser = null;

  for (const mock of Object.values(firebaseAuthMocks)) mock.mockReset();

  firebaseAuthMocks.onIdTokenChanged.mockImplementation(
    (
      _auth: Auth,
      next: (user: User | null) => void,
      error: (failure: unknown) => void = () => undefined,
    ) => {
      const observer: IdTokenObserver = { next, error };
      observers.push(observer);
      return () => {
        const index = observers.indexOf(observer);
        if (index >= 0) observers.splice(index, 1);
      };
    },
  );
  firebaseAuthMocks.getRedirectResult.mockResolvedValue(null);
  firebaseAuthMocks.signOut.mockImplementation(() => {
    emitUser(null);
    return Promise.resolve();
  });
  firebaseAuthMocks.sendEmailVerification.mockResolvedValue(undefined);
  firebaseAuthMocks.sendPasswordResetEmail.mockResolvedValue(undefined);
  firebaseAuthMocks.validatePassword.mockImplementation((_auth: Auth, password: string) =>
    Promise.resolve(passwordPolicy(password)),
  );
  firebaseAuthMocks.initializeAuth.mockReturnValue(authStub);
  firebaseAuthMocks.getAuth.mockReturnValue(authStub);
}
