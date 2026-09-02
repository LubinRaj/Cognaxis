import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import type { JournalSession, SessionDetail } from "../../shared/schemas";
import { useAuth } from "../auth/AuthProvider";
import { ApiClient, ApiError } from "../lib/api-client";
import {
  applyExchange,
  applySummary,
  deriveSummaryState,
  filterSessions,
  isSessionFull,
  nextSelectionAfterDelete,
  removeOptimisticMessage,
  removeSession,
  syncSessionFromDetail,
  upsertSession,
  type SummaryActionState,
} from "./session-sync";

export type LoadStatus = "loading" | "ready" | "error";
export type OperationStatus = "idle" | "pending" | "error";

export type WorkspaceController = {
  sessions: JournalSession[];
  visibleSessions: JournalSession[];
  activeSession: SessionDetail | null;
  activeSessionId: string | null;

  workspaceStatus: LoadStatus;
  sessionStatus: OperationStatus;
  createStatus: OperationStatus;
  sendStatus: OperationStatus;
  sendTargetId: string | null;
  summaryStatus: OperationStatus;
  summaryTargetId: string | null;
  deleteStatus: OperationStatus;

  workspaceError: string | null;
  sessionError: string | null;
  sendError: string | null;
  summaryError: string | null;
  deleteError: string | null;

  query: string;
  setQuery: (value: string) => void;
  draft: string;
  setDraft: (value: string) => void;

  summaryState: SummaryActionState;
  sessionFull: boolean;

  retryWorkspace: () => void;
  selectSession: (sessionId: string) => void;
  retrySession: () => void;
  createSession: () => Promise<void>;
  sendMessage: () => Promise<boolean>;
  createSummary: () => Promise<void>;
  deleteActiveSession: () => Promise<boolean>;
  dismissSendError: () => void;
  dismissSummaryError: () => void;
  dismissDeleteError: () => void;
};

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  return fallback;
}

export function useWorkspaceController(user: User): WorkspaceController {
  const { reportSessionExpired, reportEmailVerificationRequired } = useAuth();

  const api = useMemo(
    () =>
      new ApiClient(() => user, {
        onSessionExpired: reportSessionExpired,
        onEmailVerificationRequired: reportEmailVerificationRequired,
      }),
    [user, reportSessionExpired, reportEmailVerificationRequired],
  );

  const [sessions, setSessions] = useState<JournalSession[]>([]);
  const [activeSession, setActiveSession] = useState<SessionDetail | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const [workspaceStatus, setWorkspaceStatus] = useState<LoadStatus>("loading");
  const [sessionStatus, setSessionStatus] = useState<OperationStatus>("idle");
  const [createStatus, setCreateStatus] = useState<OperationStatus>("idle");
  const [sendStatus, setSendStatus] = useState<OperationStatus>("idle");
  const [sendTargetId, setSendTargetId] = useState<string | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<OperationStatus>("idle");
  const [summaryTargetId, setSummaryTargetId] = useState<string | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<OperationStatus>("idle");

  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sendFailure, setSendFailure] = useState<{
    sessionId: string;
    message: string;
  } | null>(null);
  const [summaryFailure, setSummaryFailure] = useState<{
    sessionId: string;
    message: string;
  } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reloadToken, setReloadToken] = useState(0);
  const messageRetries = useRef(
    new Map<string, { content: string; requestId: string }>(),
  );

  const draft = activeSessionId ? (drafts[activeSessionId] ?? "") : "";
  const setDraft = useCallback(
    (value: string) => {
      if (!activeSessionId) return;
      setDrafts((current) => ({ ...current, [activeSessionId]: value }));
    },
    [activeSessionId],
  );

  const mounted = useRef(true);
  // Only the newest session request may write to state, so rapid selection always ends on the
  // session the user chose last.
  const sessionRequestId = useRef(0);
  const pendingSelection = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadSessionDetail = useCallback(
    async (sessionId: string) => {
      const requestId = sessionRequestId.current + 1;
      sessionRequestId.current = requestId;
      pendingSelection.current = sessionId;

      setActiveSessionId(sessionId);
      setSessionStatus("pending");
      setSessionError(null);

      try {
        const detail = await api.getSession(sessionId);
        if (!mounted.current || sessionRequestId.current !== requestId) return;
        setActiveSession(detail);
        setSessions((current) => syncSessionFromDetail(current, detail));
        setSessionStatus("idle");
      } catch (error) {
        if (!mounted.current || sessionRequestId.current !== requestId) return;
        setSessionStatus("error");
        setSessionError(
          messageOf(error, "This reflection could not be opened. Try again in a moment."),
        );
      }
    },
    [api],
  );

  useEffect(() => {
    let active = true;

    async function initialise() {
      setWorkspaceStatus("loading");
      setWorkspaceError(null);
      try {
        const list = await api.listSessions();
        if (!active || !mounted.current) return;
        setSessions(list);
        setWorkspaceStatus("ready");
        if (list[0]) await loadSessionDetail(list[0].id);
      } catch (error) {
        if (!active || !mounted.current) return;
        setWorkspaceStatus("error");
        setWorkspaceError(
          messageOf(error, "Your reflections could not be loaded. Check your connection."),
        );
      }
    }

    void initialise();
    return () => {
      active = false;
    };
  }, [api, loadSessionDetail, reloadToken]);

  const retryWorkspace = useCallback(() => setReloadToken((token) => token + 1), []);

  const selectSession = useCallback(
    (sessionId: string) => {
      if (sessionId === activeSessionId && sessionStatus !== "error") return;
      void loadSessionDetail(sessionId);
    },
    [activeSessionId, sessionStatus, loadSessionDetail],
  );

  const retrySession = useCallback(() => {
    const target = pendingSelection.current ?? activeSessionId;
    if (target) void loadSessionDetail(target);
  }, [activeSessionId, loadSessionDetail]);

  const createSession = useCallback(async () => {
    if (createStatus === "pending") return;
    setCreateStatus("pending");
    setWorkspaceError(null);
    try {
      const created = await api.createSession();
      if (!mounted.current) return;
      setSessions((current) => upsertSession(current, created));
      setCreateStatus("idle");
      setDrafts((current) => ({ ...current, [created.id]: "" }));
      setQuery("");

      const requestId = sessionRequestId.current + 1;
      sessionRequestId.current = requestId;
      pendingSelection.current = created.id;
      setActiveSessionId(created.id);
      setActiveSession({ ...created, messages: [], summary: null });
      setSessionStatus("idle");
      setSessionError(null);
    } catch (error) {
      if (!mounted.current) return;
      setCreateStatus("error");
      setWorkspaceError(
        messageOf(error, "A new reflection could not be started. Try again in a moment."),
      );
    }
  }, [api, createStatus]);

  const sendMessage = useCallback(async (): Promise<boolean> => {
    const originalDraft = draft;
    const content = originalDraft.trim();
    const session = activeSession;
    if (!session || content.length === 0 || sendStatus === "pending") return false;

    const targetId = session.id;
    const previousAttempt = messageRetries.current.get(targetId);
    const requestId =
      previousAttempt?.content === content ? previousAttempt.requestId : crypto.randomUUID();
    messageRetries.current.set(targetId, { content, requestId });
    const optimisticId = `pending-${requestId}`;

    setSendStatus("pending");
    setSendTargetId(targetId);
    setSendFailure(null);
    setDrafts((current) => ({ ...current, [targetId]: "" }));
    setActiveSession((current) =>
      current && current.id === targetId
        ? {
            ...current,
            messages: [
              ...current.messages,
              {
                id: optimisticId,
                role: "user",
                content,
                createdAt: new Date().toISOString(),
              },
            ],
          }
        : current,
    );

    try {
      const exchange = await api.addMessage(targetId, { content, requestId });
      if (!mounted.current) return false;
      messageRetries.current.delete(targetId);

      setActiveSession((current) =>
        current && current.id === targetId
          ? applyExchange(current, exchange, optimisticId)
          : current,
      );
      setSessions((current) => {
        const row = current.find((item) => item.id === targetId);
        if (!row) return current;
        return upsertSession(current, {
          ...row,
          messageCount: row.messageCount + 2,
          summarizedMessageCount: exchange.summary
            ? row.messageCount + 2
            : row.summarizedMessageCount,
          updatedAt: exchange.assistantMessage.createdAt,
        });
      });
      setSendStatus("idle");
      setSendTargetId(null);
      return true;
    } catch (error) {
      if (!mounted.current) return false;
      setActiveSession((current) =>
        current && current.id === targetId
          ? removeOptimisticMessage(current, optimisticId)
          : current,
      );
      // Drafts belong to their originating reflection. Restore the exact submitted text only when
      // that reflection has not acquired a newer draft while the request was in flight.
      setDrafts((current) =>
        (current[targetId] ?? "").length === 0
          ? { ...current, [targetId]: originalDraft }
          : current,
      );
      setSendStatus("error");
      setSendTargetId(null);
      setSendFailure({
        sessionId: targetId,
        message: messageOf(error, "Your message could not be sent. Try again."),
      });
      return false;
    }
  }, [api, activeSession, draft, sendStatus]);

  const createSummary = useCallback(async () => {
    const session = activeSession;
    if (!session || summaryStatus === "pending") return;
    const targetId = session.id;

    setSummaryStatus("pending");
    setSummaryTargetId(targetId);
    setSummaryFailure(null);
    try {
      const summary = await api.summarize(targetId);
      if (!mounted.current) return;
      // A late summary is attached only to the session that requested it.
      setActiveSession((current) =>
        current && current.id === targetId ? applySummary(current, summary) : current,
      );
      setSessions((current) => {
        const row = current.find((item) => item.id === targetId);
        if (!row) return current;
        return upsertSession(current, {
          ...row,
          summarizedMessageCount: row.messageCount,
          updatedAt: summary.updatedAt,
        });
      });
      setSummaryStatus("idle");
      setSummaryTargetId(null);
    } catch (error) {
      if (!mounted.current) return;
      setSummaryStatus("error");
      setSummaryTargetId(null);
      setSummaryFailure({
        sessionId: targetId,
        message: messageOf(
          error,
          "The summary could not be created. Your reflection is unchanged.",
        ),
      });
    }
  }, [api, activeSession, summaryStatus]);

  const deleteActiveSession = useCallback(async (): Promise<boolean> => {
    const session = activeSession;
    if (!session || deleteStatus === "pending") return false;
    const targetId = session.id;

    setDeleteStatus("pending");
    setDeleteError(null);
    try {
      await api.deleteSession(targetId);
      if (!mounted.current) return true;

      const nextId = nextSelectionAfterDelete(sessions, targetId);
      setSessions((current) => removeSession(current, targetId));
      setDrafts((current) => {
        const next = { ...current };
        delete next[targetId];
        return next;
      });
      messageRetries.current.delete(targetId);
      setDeleteStatus("idle");

      if (nextId) {
        await loadSessionDetail(nextId);
      } else {
        sessionRequestId.current += 1;
        pendingSelection.current = null;
        setActiveSession(null);
        setActiveSessionId(null);
        setSessionStatus("idle");
      }
      return true;
    } catch (error) {
      if (!mounted.current) return false;
      setDeleteStatus("error");
      setDeleteError(
        messageOf(error, "This reflection could not be deleted. It is still available."),
      );
      return false;
    }
  }, [api, activeSession, deleteStatus, sessions, loadSessionDetail]);

  const visibleSessions = useMemo(() => filterSessions(sessions, query), [sessions, query]);

  const summaryState = useMemo(
    () =>
      deriveSummaryState({
        session: activeSession,
        summary: activeSession?.summary ?? null,
        summarizing: summaryStatus === "pending" && summaryTargetId === activeSession?.id,
      }),
    [activeSession, summaryStatus, summaryTargetId],
  );

  const sendError = sendFailure?.sessionId === activeSessionId ? sendFailure.message : null;
  const summaryError =
    summaryFailure?.sessionId === activeSessionId ? summaryFailure.message : null;

  return {
    sessions,
    visibleSessions,
    activeSession,
    activeSessionId,

    workspaceStatus,
    sessionStatus,
    createStatus,
    sendStatus,
    sendTargetId,
    summaryStatus,
    summaryTargetId,
    deleteStatus,

    workspaceError,
    sessionError,
    sendError,
    summaryError,
    deleteError,

    query,
    setQuery,
    draft,
    setDraft,

    summaryState,
    sessionFull: isSessionFull(activeSession),

    retryWorkspace,
    selectSession,
    retrySession,
    createSession,
    sendMessage,
    createSummary,
    deleteActiveSession,
    dismissSendError: () => setSendFailure(null),
    dismissSummaryError: () => setSummaryFailure(null),
    dismissDeleteError: () => setDeleteError(null),
  };
}
