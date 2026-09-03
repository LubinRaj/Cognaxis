import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import type { PersonalSignal, UpsertSignalInput } from "../../shared/schemas";
import { useAuth } from "../auth/AuthProvider";
import { ApiClient, ApiError } from "../lib/api-client";

export type SignalLoadStatus = "idle" | "loading" | "ready" | "error";

export type SessionSignalController = {
  signal: PersonalSignal | null;
  status: SignalLoadStatus;
  saving: boolean;
  saveError: string | null;
  save: (input: UpsertSignalInput) => Promise<boolean>;
  remove: () => Promise<boolean>;
  dismissSaveError: () => void;
  reload: () => void;
};

export function useSessionSignal(user: User, sessionId: string | null): SessionSignalController {
  const { reportSessionExpired, reportEmailVerificationRequired } = useAuth();
  const api = useMemo(
    () =>
      new ApiClient(() => user, {
        onSessionExpired: reportSessionExpired,
        onEmailVerificationRequired: reportEmailVerificationRequired,
      }),
    [user, reportSessionExpired, reportEmailVerificationRequired],
  );

  const [signal, setSignal] = useState<PersonalSignal | null>(null);
  const [status, setStatus] = useState<SignalLoadStatus>(sessionId ? "loading" : "idle");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [trackedSessionId, setTrackedSessionId] = useState(sessionId);
  const requestRef = useRef(0);

  // Selecting a different reflection resets the signal state during render, so the previous
  // session's check-in can never flash on the newly selected one.
  if (trackedSessionId !== sessionId) {
    setTrackedSessionId(sessionId);
    setSignal(null);
    setStatus(sessionId ? "loading" : "idle");
    setSaveError(null);
  }

  useEffect(() => {
    if (!sessionId) return;
    const requestId = ++requestRef.current;
    api
      .getSignal(sessionId)
      .then((loaded) => {
        if (requestRef.current !== requestId) return;
        setSignal(loaded);
        setStatus("ready");
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setSignal(null);
        setStatus("error");
      });
    return () => {
      requestRef.current += 1;
    };
  }, [api, sessionId, reloadToken]);

  const save = useCallback(
    async (input: UpsertSignalInput): Promise<boolean> => {
      if (!sessionId) return false;
      setSaving(true);
      setSaveError(null);
      try {
        const outcome = await api.saveSignal(sessionId, input);
        setSignal(outcome.signal);
        setStatus("ready");
        return true;
      } catch (error) {
        setSaveError(
          error instanceof ApiError
            ? error.message
            : "Your check-in could not be saved. Please try again.",
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [api, sessionId],
  );

  const remove = useCallback(async (): Promise<boolean> => {
    if (!sessionId) return false;
    setSaving(true);
    setSaveError(null);
    try {
      await api.deleteSignal(sessionId);
      setSignal(null);
      setStatus("ready");
      return true;
    } catch (error) {
      setSaveError(
        error instanceof ApiError
          ? error.message
          : "Your check-in could not be removed. Please try again.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }, [api, sessionId]);

  const dismissSaveError = useCallback(() => setSaveError(null), []);
  const reload = useCallback(() => {
    setStatus("loading");
    setReloadToken((token) => token + 1);
  }, []);

  return { signal, status, saving, saveError, save, remove, dismissSaveError, reload };
}
