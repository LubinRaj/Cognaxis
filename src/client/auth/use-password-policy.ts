import { useEffect, useRef, useState } from "react";
import { validatePassword, type Auth, type PasswordValidationStatus } from "firebase/auth";

const VALIDATION_DEBOUNCE_MS = 150;

export type PasswordPolicyState = {
  status: PasswordValidationStatus | null;
  unavailable: boolean;
  /** The exact value the status describes, so a stale result is never treated as current. */
  validatedPassword: string | null;
};

// Firebase's project password policy is authoritative. This hook only mirrors it so the form can
// explain the requirements; it never decides whether an account may be created.
export function usePasswordPolicy(auth: Auth | null, password: string): PasswordPolicyState {
  const [result, setResult] = useState<{
    status: PasswordValidationStatus;
    validatedPassword: string;
  } | null>(null);
  const [lookupFailed, setLookupFailed] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    if (!auth) return;

    const requestId = latest.current + 1;
    latest.current = requestId;

    const timer = window.setTimeout(() => {
      void validatePassword(auth, password)
        .then((status) => {
          if (latest.current !== requestId) return;
          setResult({ status, validatedPassword: password });
          setLookupFailed(false);
        })
        .catch(() => {
          if (latest.current !== requestId) return;
          setResult(null);
          setLookupFailed(true);
        });
    }, VALIDATION_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [auth, password]);

  return {
    status: result?.status ?? null,
    unavailable: !auth || lookupFailed,
    validatedPassword: result?.validatedPassword ?? null,
  };
}
