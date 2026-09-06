import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getRedirectResult,
  onIdTokenChanged,
  sendEmailVerification,
  signOut,
  type User,
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "../lib/firebase";
import {
  authMessages,
  getFirebaseAuthErrorMessage,
  isTerminalSessionFailure,
  maskEmail,
} from "./auth-errors";
import {
  initialAuthState,
  reduceAuthState,
  type AuthEvent,
  type AuthState,
} from "./auth-state";

export const BOOTSTRAP_TIMEOUT_MS = 12_000;

export type AuthContextValue = {
  state: AuthState;
  user: User | null;
  maskedEmail: string;
  bootstrapStalled: boolean;
  globalError: string | null;
  isSigningOut: boolean;
  send: (event: AuthEvent) => void;
  clearGlobalError: () => void;
  retryBootstrap: () => void;
  signOutAndReset: () => Promise<void>;
  reportSessionExpired: () => void;
  reportEmailVerificationRequired: () => void;
  confirmEmailVerified: () => Promise<boolean>;
  sendVerificationEmail: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduceAuthState, initialAuthState);
  const [user, setUser] = useState<User | null>(null);
  const [bootstrapStalled, setBootstrapStalled] = useState(false);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const redirectFailed = useRef(false);

  useEffect(() => {
    const firebaseAuth = auth;
    if (!isFirebaseConfigured || !firebaseAuth) {
      dispatch({ type: "CONFIGURATION_MISSING" });
      return;
    }

    let active = true;
    let unsubscribe: (() => void) | undefined;

    const stallTimer = window.setTimeout(() => {
      if (active) setBootstrapStalled(true);
    }, BOOTSTRAP_TIMEOUT_MS);

    const observe = () => {
      if (!active) return;
      unsubscribe = onIdTokenChanged(
        firebaseAuth,
        (currentUser) => {
          if (!active) return;
          window.clearTimeout(stallTimer);
          setBootstrapStalled(false);
          setUser(currentUser);

          if (!currentUser) {
            dispatch({ type: "NO_USER" });
            if (redirectFailed.current) {
              redirectFailed.current = false;
              dispatch({ type: "OPEN_SIGN_IN" });
            }
            return;
          }

          dispatch({ type: currentUser.emailVerified ? "VERIFIED_USER" : "UNVERIFIED_USER" });
        },
        () => {
          if (!active) return;
          window.clearTimeout(stallTimer);
          setBootstrapStalled(false);
          setUser(null);
          setGlobalError(authMessages.sessionInvalid);
          dispatch({ type: "SESSION_EXPIRED" });
        },
      );
    };

    // Listening for normal auth state must never wait on the optional redirect-result lookup.
    // Browsers can delay that lookup (for example when an identity provider is unavailable or
    // third-party storage is restricted); delaying the listener would leave every user on the
    // bootstrap screen even though their ordinary sign-in state is already known.
    observe();

    void getRedirectResult(firebaseAuth)
      .catch((error: unknown) => {
        if (!active) return;
        redirectFailed.current = true;
        setGlobalError(getFirebaseAuthErrorMessage(error));
      });

    return () => {
      active = false;
      window.clearTimeout(stallTimer);
      unsubscribe?.();
    };
  }, [bootstrapAttempt]);

  const send = useCallback((event: AuthEvent) => {
    setGlobalError(null);
    dispatch(event);
  }, []);

  const clearGlobalError = useCallback(() => setGlobalError(null), []);

  const retryBootstrap = useCallback(() => {
    setBootstrapStalled(false);
    setGlobalError(null);
    dispatch({ type: "BOOTSTRAP_RETRY" });
    setBootstrapAttempt((attempt) => attempt + 1);
  }, []);

  const signOutAndReset = useCallback(async () => {
    const firebaseAuth = auth;
    if (!firebaseAuth || isSigningOut) return;
    setIsSigningOut(true);
    setGlobalError(null);
    try {
      await signOut(firebaseAuth);
    } catch {
      // The observer remains the single source of truth. A failed sign-out leaves the session
      // in place rather than showing a signed-out screen over live private state.
      setGlobalError("Sign-out could not be completed. Please try again.");
    } finally {
      setIsSigningOut(false);
    }
  }, [isSigningOut]);

  const reportSessionExpired = useCallback(() => {
    // A failed API token refresh is an operation-level failure, not proof that Firebase has
    // signed the user out. Keep the authenticated workspace mounted so a transient backend
    // rejection cannot unexpectedly destroy the user's current flow. The Firebase auth observer
    // remains the authority for real sign-outs and invalidated sessions.
    setGlobalError("Your session could not be refreshed. Please refresh the page and try again.");
  }, []);

  const reportEmailVerificationRequired = useCallback(() => {
    setGlobalError(authMessages.emailNotVerified);
    dispatch({ type: "UNVERIFIED_USER" });
  }, []);

  const confirmEmailVerified = useCallback(async () => {
    const current = auth?.currentUser;
    if (!current) {
      dispatch({ type: "NO_USER" });
      return false;
    }

    try {
      await current.reload();
      const result = await current.getIdTokenResult(true);
      const verified = result.claims.email_verified === true;
      if (verified) {
        setUser(auth?.currentUser ?? current);
        setGlobalError(null);
        dispatch({ type: "VERIFIED_USER" });
      }
      return verified;
    } catch (error: unknown) {
      if (isTerminalSessionFailure(error)) {
        setGlobalError(authMessages.sessionInvalid);
        dispatch({ type: "SESSION_EXPIRED" });
        return false;
      }
      setGlobalError(getFirebaseAuthErrorMessage(error));
      return false;
    }
  }, []);

  const sendVerificationEmail = useCallback(async () => {
    const current = auth?.currentUser;
    if (!current) {
      dispatch({ type: "NO_USER" });
      throw new Error(authMessages.sessionInvalid);
    }
    // No continue URL is supplied, so Firebase returns the user to its own authorised action
    // page. Passing an application URL here would create an operator-controlled redirect target.
    await sendEmailVerification(current);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      user: state === "AUTHENTICATED" ? user : null,
      maskedEmail: maskEmail(user?.email),
      bootstrapStalled,
      globalError,
      isSigningOut,
      send,
      clearGlobalError,
      retryBootstrap,
      signOutAndReset,
      reportSessionExpired,
      reportEmailVerificationRequired,
      confirmEmailVerified,
      sendVerificationEmail,
    }),
    [
      state,
      user,
      bootstrapStalled,
      globalError,
      isSigningOut,
      send,
      clearGlobalError,
      retryBootstrap,
      signOutAndReset,
      reportSessionExpired,
      reportEmailVerificationRequired,
      confirmEmailVerified,
      sendVerificationEmail,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
