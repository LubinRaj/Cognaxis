import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import type {
  AttachmentReference,
  JournalSession,
  OrganizationSession,
  OrganizationSessionDetail,
  OrganizationSummary,
  SessionDetail,
} from "../../shared/schemas";
import { useAuth } from "../auth/AuthProvider";
import { ApiClient, ApiError } from "../lib/api-client";
import {
  applyExchange,
  applySummary,
  deriveSummaryState,
  filterSessions,
  isSessionFull,
  nextSelectionAfterDelete,
  removeSession,
  syncSessionFromDetail,
  upsertSession,
  type SummaryActionState,
} from "./session-sync";

export type LoadStatus = "loading" | "ready" | "error";
export type OperationStatus = "idle" | "pending" | "error";

export type WorkspaceController = {
  sessions: JournalSession[];
  archivedSessions: JournalSession[];
  visibleSessions: JournalSession[];
  activeSession: SessionDetail | null;
  activeSessionId: string | null;

  workspaceStatus: LoadStatus;
  archivedStatus: LoadStatus;
  sessionStatus: OperationStatus;
  createStatus: OperationStatus;
  sendStatus: OperationStatus;
  sendTargetId: string | null;
  summaryStatus: OperationStatus;
  summaryTargetId: string | null;
  deleteStatus: OperationStatus;
  archiveStatus: OperationStatus;

  workspaceError: string | null;
  archivedError: string | null;
  sessionError: string | null;
  sendError: string | null;
  attachmentError: string | null;
  attachments: AttachmentReference[];
  summaryError: string | null;
  deleteError: string | null;
  archiveError: string | null;

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
  renameSession: (sessionId: string, title: string) => Promise<boolean>;
  updateSessionTags: (sessionId: string, tags: string[]) => Promise<boolean>;
  sendMessage: () => Promise<boolean>;
  createSummary: () => Promise<void>;
  deleteActiveSession: () => Promise<boolean>;
  archiveSession: (sessionId: string) => Promise<boolean>;
  archiveActiveSession: () => Promise<boolean>;
  restoreArchivedSession: (sessionId: string) => Promise<boolean>;
  deleteArchivedSession: (sessionId: string) => Promise<boolean>;
  dismissSendError: () => void;
  dismissSummaryError: () => void;
  dismissDeleteError: () => void;
  dismissArchiveError: () => void;
  cancelSend: () => void;
  uploadAttachment: (file: File) => Promise<AttachmentReference | null>;
  removeAttachment: (attachmentId: string) => Promise<boolean>;
  transcribeAttachment: (attachmentId: string) => Promise<string | null>;
  transcribeVoice: (file: File) => Promise<string | null>;
};

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  return fallback;
}

function asJournalSession(session: OrganizationSession): JournalSession {
  return session;
}

function asSessionDetail(session: OrganizationSessionDetail): SessionDetail {
  return {
    ...session,
    summary: session.summary ? { ...session.summary, sourceMessageIds: [] } : null,
  };
}

function asPersonalSummary(summary: OrganizationSummary) {
  return { ...summary, sourceMessageIds: [] };
}

export function useWorkspaceController(
  user: User,
  initialSessionId?: string,
  organizationId?: string | null,
): WorkspaceController {
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
  const [archivedSessions, setArchivedSessions] = useState<JournalSession[]>([]);
  const [activeSession, setActiveSession] = useState<SessionDetail | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const [workspaceStatus, setWorkspaceStatus] = useState<LoadStatus>("loading");
  const [archivedStatus] = useState<LoadStatus>("ready");
  const [sessionStatus, setSessionStatus] = useState<OperationStatus>("idle");
  const [createStatus, setCreateStatus] = useState<OperationStatus>("idle");
  const [sendStatus, setSendStatus] = useState<OperationStatus>("idle");
  const [sendTargetId, setSendTargetId] = useState<string | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<OperationStatus>("idle");
  const [summaryTargetId, setSummaryTargetId] = useState<string | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<OperationStatus>("idle");
  const [archiveStatus, setArchiveStatus] = useState<OperationStatus>("idle");

  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [archivedError] = useState<string | null>(null);
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
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [attachmentFailure, setAttachmentFailure] = useState<{ sessionId: string; message: string } | null>(null);
  const [attachmentsBySession, setAttachmentsBySession] = useState<Record<string, AttachmentReference[]>>({});

  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reloadToken, setReloadToken] = useState(0);
  const messageRetries = useRef(
    new Map<string, { content: string; requestId: string }>(),
  );
  const sendAbortController = useRef<AbortController | null>(null);

  const draft = activeSessionId ? (drafts[activeSessionId] ?? "") : "";
  const attachments = useMemo(
    () => activeSessionId ? (attachmentsBySession[activeSessionId] ?? []) : [],
    [activeSessionId, attachmentsBySession],
  );
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
  // A deep-linked reflection is honored exactly once; afterwards the newest reflection wins.
  const initialSelection = useRef<string | null>(initialSessionId ?? null);

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
        const detail = organizationId
          ? asSessionDetail(await api.getOrganizationSession(organizationId, sessionId))
          : await api.getSession(sessionId);
        if (!mounted.current || sessionRequestId.current !== requestId) return;
        setActiveSession(detail);
        if (detail.status === "archived") {
          setArchivedSessions((current) => upsertSession(current, detail));
          setSessions((current) => removeSession(current, detail.id));
        } else {
          setSessions((current) => syncSessionFromDetail(current, detail));
          setArchivedSessions((current) => removeSession(current, detail.id));
        }
        setSessionStatus("idle");
      } catch (error) {
        if (!mounted.current || sessionRequestId.current !== requestId) return;
        setSessionStatus("error");
        setSessionError(
          messageOf(error, "This reflection could not be opened. Try again in a moment."),
        );
      }
    },
    [api, organizationId],
  );

  useEffect(() => {
    let active = true;

    async function initialise() {
      setWorkspaceStatus("loading");
      setWorkspaceError(null);
      try {
        const list = organizationId
          ? (await api.listOrganizationSessions(organizationId))
              .filter((session) => session.createdBy === user.uid)
              .map(asJournalSession)
          : await api.listSessions();
        if (!active || !mounted.current) return;
        setSessions(list);
        setWorkspaceStatus("ready");
        const preferred = initialSelection.current;
        initialSelection.current = null;
        const target =
          preferred && list.some((session) => session.id === preferred)
            ? preferred
            : list[0]?.id;
        if (target) await loadSessionDetail(target);
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
  }, [api, loadSessionDetail, organizationId, reloadToken, user.uid]);

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
      const created = organizationId
        ? asJournalSession(await api.createOrganizationSession(organizationId, { title: "New team reflection" }))
        : await api.createSession({ title: "New personal reflection" });
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
  }, [api, createStatus, organizationId]);

  const renameSession = useCallback(async (sessionId: string, title: string): Promise<boolean> => {
    try {
      const renamed = organizationId
        ? asJournalSession(await api.renameOrganizationSession(organizationId, sessionId, title))
        : await api.renameSession(sessionId, title);
      if (!mounted.current) return false;
      if (renamed.status === "active") {
        setSessions((current) => upsertSession(current, renamed));
      } else {
        setSessions((current) => removeSession(current, renamed.id));
      }
      if (renamed.status === "archived") {
        setArchivedSessions((current) => upsertSession(current, renamed));
      } else {
        setArchivedSessions((current) => removeSession(current, renamed.id));
      }
      setActiveSession((current) =>
        current && current.id === sessionId ? { ...current, title: renamed.title } : current,
      );
      return true;
    } catch {
      // The shell owns the visible rename dialog error; do not turn a failed rename into a
      // misleading session-load error state.
      return false;
    }
  }, [api, organizationId]);

  const updateSessionTags = useCallback(async (sessionId: string, tags: string[]): Promise<boolean> => {
    try {
      const updated = organizationId
        ? asJournalSession(await api.updateOrganizationSessionTags(organizationId, sessionId, tags))
        : await api.updateSessionTags(sessionId, tags);
      if (!mounted.current) return false;
      setSessions((current) => updated.status === "active" ? upsertSession(current, updated) : removeSession(current, updated.id));
      setActiveSession((current) => current && current.id === sessionId ? { ...current, tags: [...updated.tags] } : current);
      return true;
    } catch {
      return false;
    }
  }, [api, organizationId]);

  const sendMessage = useCallback(async (): Promise<boolean> => {
    const originalDraft = draft;
    const content = originalDraft.trim();
    const session = activeSession;
    if (!session || content.length === 0 || sendStatus === "pending") return false;

    const targetId = session.id;
    const pendingAttachments = [...attachments];
    const attachmentIds = pendingAttachments.map((attachment) => attachment.id);
    const previousAttempt = messageRetries.current.get(targetId);
    const requestId =
      previousAttempt?.content === content ? previousAttempt.requestId : crypto.randomUUID();
    messageRetries.current.set(targetId, { content, requestId });
    const optimisticId = `pending-${requestId}`;
    const optimisticAssistantId = `pending-assistant-${requestId}`;
    setSendStatus("pending");
    setSendTargetId(targetId);
    setSendFailure(null);
    setAttachmentFailure(null);
    setDrafts((current) => ({ ...current, [targetId]: "" }));
    setAttachmentsBySession((current) => ({ ...current, [targetId]: [] }));
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
                ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
                createdAt: new Date().toISOString(),
              },
              {
                id: optimisticAssistantId,
                role: "model",
                content: "",
                createdAt: new Date().toISOString(),
              },
            ],
          }
        : current,
    );

    const abortController = new AbortController();
    sendAbortController.current = abortController;

    try {
      const applyChunk = (chunkText: string) => {
          if (!mounted.current) return;
          setActiveSession((current) => {
            if (!current || current.id !== targetId) return current;
            return {
              ...current,
              messages: current.messages.map((m) =>
                m.id === optimisticAssistantId ? { ...m, content: m.content + chunkText } : m,
              ),
            };
          });
        };
      const exchange = organizationId
        ? (() => api.addOrganizationMessageStream(
            organizationId,
            targetId,
            { content, requestId, attachmentIds },
            applyChunk,
            abortController.signal,
          ))().then((teamExchange) => ({
            userMessage: teamExchange.userMessage,
            assistantMessage: teamExchange.assistantMessage,
            summary: null,
            session: teamExchange.session ? asJournalSession(teamExchange.session) : undefined,
          }))
        : api.addMessageStream(
            targetId,
            { content, requestId, attachmentIds },
            applyChunk,
            abortController.signal,
          );
      const resolvedExchange = await exchange;
      
      if (!mounted.current) return false;
      messageRetries.current.delete(targetId);

      setActiveSession((current) =>
        current && current.id === targetId
          ? applyExchange(current, resolvedExchange, optimisticId)
          : current,
      );
      setSessions((current) => {
        const row = current.find((item) => item.id === targetId);
        if (!row) return current;
        if (resolvedExchange.session) return upsertSession(current, resolvedExchange.session);
        return upsertSession(current, {
          ...row,
          messageCount: row.messageCount + 2,
          summarizedMessageCount: resolvedExchange.summary
            ? row.messageCount + 2
            : row.summarizedMessageCount,
          updatedAt: resolvedExchange.assistantMessage.createdAt,
        });
      });
      setSendStatus("idle");
      setSendTargetId(null);
      sendAbortController.current = null;
      return true;
    } catch (error: unknown) {
      if (!mounted.current) return false;
      
      const errorName =
        error instanceof Error
          ? error.name
          : typeof error === "object" && error !== null && "name" in error
            ? String(error.name)
            : undefined;
      if (errorName === "AbortError" || abortController.signal.aborted) {
        setActiveSession((current) =>
          current && current.id === targetId
            ? {
                ...current,
                messages: current.messages.filter(
                  (m) => m.id !== optimisticId && m.id !== optimisticAssistantId
                ),
              }
            : current,
        );
        setDrafts((current) =>
          (current[targetId] ?? "").length === 0
            ? { ...current, [targetId]: originalDraft }
            : current,
        );
        setAttachmentsBySession((current) =>
          (current[targetId] ?? []).length === 0
            ? { ...current, [targetId]: pendingAttachments }
            : current,
        );
        setSendStatus("idle");
        setSendTargetId(null);
        sendAbortController.current = null;
        return false;
      }

      setActiveSession((current) =>
        current && current.id === targetId
          ? {
              ...current,
              messages: current.messages.filter(
                (m) => m.id !== optimisticId && m.id !== optimisticAssistantId
              ),
            }
          : current,
      );
      // Drafts belong to their originating reflection. Restore the exact submitted text only when
      // that reflection has not acquired a newer draft while the request was in flight.
      setDrafts((current) =>
        (current[targetId] ?? "").length === 0
          ? { ...current, [targetId]: originalDraft }
          : current,
      );
      setAttachmentsBySession((current) =>
        (current[targetId] ?? []).length === 0
          ? { ...current, [targetId]: pendingAttachments }
          : current,
      );
      setSendStatus("error");
      setSendTargetId(null);
      sendAbortController.current = null;
      setSendFailure({
        sessionId: targetId,
        message: messageOf(error, "Your message could not be sent. Try again."),
      });
      return false;
    }
  }, [api, activeSession, attachments, draft, organizationId, sendStatus]);

  const uploadAttachment = useCallback(async (file: File): Promise<AttachmentReference | null> => {
    const session = activeSession;
    if (!session || attachments.length >= 3 || sendStatus === "pending") return null;
    setAttachmentFailure(null);
    try {
      const attachment = organizationId
        ? await api.uploadOrganizationAttachment(organizationId, session.id, file)
        : await api.uploadPersonalAttachment(session.id, file);
      if (!mounted.current) return null;
      setAttachmentsBySession((current) => ({
        ...current,
        [session.id]: [...(current[session.id] ?? []), attachment],
      }));
      return attachment;
    } catch (error) {
      if (mounted.current) {
        setAttachmentFailure({
          sessionId: session.id,
          message: messageOf(error, "This attachment could not be uploaded."),
        });
      }
      return null;
    }
  }, [api, activeSession, attachments.length, organizationId, sendStatus]);

  const transcribeAttachment = useCallback(async (attachmentId: string): Promise<string | null> => {
    const session = activeSession;
    if (!session) return null;
    try {
      return organizationId
        ? await api.transcribeOrganizationAttachment(organizationId, session.id, attachmentId)
        : await api.transcribePersonalAttachment(session.id, attachmentId);
    } catch (error) {
      if (mounted.current) {
        setAttachmentFailure({
          sessionId: session.id,
          message: messageOf(error, "The voice note could not be transcribed."),
        });
      }
      return null;
    }
  }, [api, activeSession, organizationId]);

  const transcribeVoice = useCallback(async (file: File): Promise<string | null> => {
    const session = activeSession;
    if (!session) return null;
    try {
      return organizationId
        ? await api.transcribeOrganizationVoice(organizationId, session.id, file)
        : await api.transcribePersonalVoice(session.id, file);
    } catch (error) {
      if (mounted.current) {
        setAttachmentFailure({
          sessionId: session.id,
          message: messageOf(error, "Voice input could not be transcribed."),
        });
      }
      return null;
    }
  }, [api, activeSession, organizationId]);

  const removeAttachment = useCallback(async (attachmentId: string): Promise<boolean> => {
    const session = activeSession;
    if (!session) return false;
    try {
      if (organizationId) await api.deleteOrganizationAttachment(organizationId, session.id, attachmentId);
      else await api.deletePersonalAttachment(session.id, attachmentId);
      if (!mounted.current) return false;
      setAttachmentsBySession((current) => ({
        ...current,
        [session.id]: (current[session.id] ?? []).filter((attachment) => attachment.id !== attachmentId),
      }));
      return true;
    } catch (error) {
      if (mounted.current) {
        setAttachmentFailure({
          sessionId: session.id,
          message: messageOf(error, "This attachment could not be removed."),
        });
      }
      return false;
    }
  }, [api, activeSession, organizationId]);

  const createSummary = useCallback(async () => {
    const session = activeSession;
    if (!session || summaryStatus === "pending") return;
    const targetId = session.id;

    setSummaryStatus("pending");
    setSummaryTargetId(targetId);
    setSummaryFailure(null);
    try {
      const summary = organizationId
        ? asPersonalSummary(await api.summarizeOrganizationSession(organizationId, targetId))
        : await api.summarize(targetId);
      // Summary generation can add one optional, useful tag. Refresh its compact session metadata
      // so the tag appears immediately, but never treat that best-effort read as a summary failure.
      let refreshedSession: JournalSession | null = null;
      try {
        refreshedSession = organizationId
          ? asJournalSession(await api.getOrganizationSession(organizationId, targetId))
          : await api.getSession(targetId);
      } catch {
        refreshedSession = null;
      }
      if (!mounted.current) return;
      // A late summary is attached only to the session that requested it.
      setActiveSession((current) =>
        current && current.id === targetId
          ? applySummary(refreshedSession ? {
              ...current,
              title: refreshedSession.title,
              tags: [...refreshedSession.tags],
              status: refreshedSession.status,
            } : current, summary)
          : current,
      );
      setSessions((current) => {
        const row = current.find((item) => item.id === targetId);
        if (!row) return current;
        if (refreshedSession) return upsertSession(current, refreshedSession);
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
  }, [api, activeSession, organizationId, summaryStatus]);

  const deleteActiveSession = useCallback(async (): Promise<boolean> => {
    const session = activeSession;
    if (!session || deleteStatus === "pending") return false;
    const targetId = session.id;

    setDeleteStatus("pending");
    setDeleteError(null);
    try {
      if (organizationId) await api.deleteOrganizationSession(organizationId, targetId);
      else await api.deleteSession(targetId);
      if (!mounted.current) return true;

      const nextId = nextSelectionAfterDelete(sessions, targetId);
      setSessions((current) => removeSession(current, targetId));
      setDrafts((current) => {
        const next = { ...current };
        delete next[targetId];
        return next;
      });
      setAttachmentsBySession((current) => {
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
  }, [api, activeSession, deleteStatus, sessions, loadSessionDetail, organizationId]);

  const archiveSession = useCallback(async (sessionId: string): Promise<boolean> => {
    const session = sessions.find((candidate) => candidate.id === sessionId)
      ?? (activeSession?.id === sessionId ? activeSession : null);
    if (!session || session.status !== "active" || archiveStatus === "pending") return false;
    const targetId = session.id;

    setArchiveStatus("pending");
    setArchiveError(null);
    try {
      const archived = organizationId
        ? asJournalSession(await api.archiveOrganizationSession(organizationId, targetId))
        : await api.archiveSession(targetId);
      if (!mounted.current) return true;

      const nextId = targetId === activeSessionId
        ? nextSelectionAfterDelete(sessions, targetId)
        : null;
      setSessions((current) => removeSession(current, targetId));
      setArchivedSessions((current) => upsertSession(current, archived));
      setDrafts((current) => {
        const next = { ...current };
        delete next[targetId];
        return next;
      });
      setAttachmentsBySession((current) => {
        const next = { ...current };
        delete next[targetId];
        return next;
      });
      messageRetries.current.delete(targetId);
      setArchiveStatus("idle");

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
      setArchiveStatus("error");
      setArchiveError(messageOf(error, "This reflection could not be archived. It is still active."));
      return false;
    }
  }, [api, activeSession, activeSessionId, archiveStatus, sessions, loadSessionDetail, organizationId]);

  const archiveActiveSession = useCallback(async (): Promise<boolean> => {
    if (!activeSession || activeSession.status !== "active") return false;
    return archiveSession(activeSession.id);
  }, [activeSession, archiveSession]);

  const restoreArchivedSession = useCallback(async (sessionId: string): Promise<boolean> => {
    if (archiveStatus === "pending") return false;
    setArchiveStatus("pending");
    setArchiveError(null);
    try {
      const restored = organizationId
        ? asJournalSession(await api.restoreOrganizationSession(organizationId, sessionId))
        : await api.restoreSession(sessionId);
      if (!mounted.current) return true;
      setArchivedSessions((current) => removeSession(current, sessionId));
      setSessions((current) => upsertSession(current, restored));
      setArchiveStatus("idle");
      return true;
    } catch (error) {
      if (!mounted.current) return false;
      setArchiveStatus("error");
      setArchiveError(messageOf(error, "This reflection could not be restored."));
      return false;
    }
  }, [api, archiveStatus, organizationId]);

  const deleteArchivedSession = useCallback(async (sessionId: string): Promise<boolean> => {
    if (deleteStatus === "pending") return false;
    setDeleteStatus("pending");
    setDeleteError(null);
    try {
      if (organizationId) await api.deleteOrganizationSession(organizationId, sessionId);
      else await api.deleteSession(sessionId);
      if (!mounted.current) return true;
      setArchivedSessions((current) => removeSession(current, sessionId));
      if (activeSessionId === sessionId) {
        sessionRequestId.current += 1;
        pendingSelection.current = null;
        setActiveSession(null);
        setActiveSessionId(null);
        setSessionStatus("idle");
      }
      setDeleteStatus("idle");
      return true;
    } catch (error) {
      if (!mounted.current) return false;
      setDeleteStatus("error");
      setDeleteError(messageOf(error, "This archived reflection could not be deleted."));
      return false;
    }
  }, [api, activeSessionId, deleteStatus, organizationId]);

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
  const attachmentError = attachmentFailure?.sessionId === activeSessionId ? attachmentFailure.message : null;
  const summaryError =
    summaryFailure?.sessionId === activeSessionId ? summaryFailure.message : null;

  const cancelSend = useCallback(() => {
    if (sendAbortController.current) {
      sendAbortController.current.abort();
      sendAbortController.current = null;
    }
  }, []);

  return {
    sessions,
    archivedSessions,
    visibleSessions,
    activeSession,
    activeSessionId,

    workspaceStatus,
    archivedStatus,
    sessionStatus,
    createStatus,
    sendStatus,
    sendTargetId,
    summaryStatus,
    summaryTargetId,
    deleteStatus,
    archiveStatus,

    workspaceError,
    archivedError,
    sessionError,
    sendError,
    attachmentError,
    attachments,
    summaryError,
    deleteError,
    archiveError,

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
    renameSession,
    updateSessionTags,
    sendMessage,
    createSummary,
    deleteActiveSession,
    archiveSession,
    archiveActiveSession,
    restoreArchivedSession,
    deleteArchivedSession,
    dismissSendError: () => setSendFailure(null),
    dismissSummaryError: () => setSummaryFailure(null),
    dismissDeleteError: () => setDeleteError(null),
    dismissArchiveError: () => setArchiveError(null),
    cancelSend,
    uploadAttachment,
    removeAttachment,
    transcribeAttachment,
    transcribeVoice,
  };
}
