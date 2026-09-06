import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import type { PersonalCheckIn, PersonalSignal, UpsertSignalInput } from "../../shared/schemas";
import { useAuth } from "../auth/AuthProvider";
import { ApiClient, ApiError } from "../lib/api-client";

export type SignalLoadStatus = "idle" | "loading" | "ready" | "error";

export type SessionSignalController = {
  signal: PersonalSignal | PersonalCheckIn | null;
  checkIns: PersonalCheckIn[];
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

  const [signal, setSignal] = useState<PersonalSignal | PersonalCheckIn | null>(null);
  const [checkIns, setCheckIns] = useState<PersonalCheckIn[]>([]);
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
    setCheckIns([]);
    setStatus(sessionId ? "loading" : "idle");
    setSaveError(null);
  }

  useEffect(() => {
    if (!sessionId) return;
    const requestId = ++requestRef.current;
    Promise.all([api.getSignal(sessionId), api.listCheckIns(sessionId)])
      .then(([legacyOrLatest, events]) => {
        if (requestRef.current !== requestId) return;
        setCheckIns(events);
        const latest = events[0] ?? null;
        setSignal(!latest || (legacyOrLatest && legacyOrLatest.updatedAt > latest.capturedAt) ? legacyOrLatest : latest);
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
        const checkIn = await api.createCheckIn(sessionId, input);
        setCheckIns((current) => [checkIn, ...current]);
        setSignal(checkIn);
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
      if (signal && "id" in signal && signal.schemaVersion === 2) {
        await api.deleteCheckIn(sessionId, signal.id);
        setCheckIns((current) => current.filter((checkIn) => checkIn.id !== signal.id));
      } else {
        await api.deleteSignal(sessionId);
      }
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
  }, [api, sessionId, signal]);

  const dismissSaveError = useCallback(() => setSaveError(null), []);
  const reload = useCallback(() => {
    setStatus("loading");
    setReloadToken((token) => token + 1);
  }, []);

  return { signal, checkIns, status, saving, saveError, save, remove, dismissSaveError, reload };
}
