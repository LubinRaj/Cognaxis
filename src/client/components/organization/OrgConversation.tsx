/* eslint-disable @typescript-eslint/no-unused-vars -- retained request helpers are shared with the Home workspace transition. */
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type {
  AttachmentReference,
  OrganizationPermissions,
  OrganizationSession,
  OrganizationSessionDetail,
} from "../../../shared/schemas";
import type { ApiClient } from "../../lib/api-client";
import { ApiError } from "../../lib/api-client";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { EmptyState } from "../ui/EmptyState";
import { InlineAlert } from "../ui/InlineAlert";
import { Skeleton } from "../ui/Skeleton";
import { MaterialIcon } from "../MaterialIcon";
import { FormattedMessage } from "../ui/FormattedMessage";
import { PrivateMessageAttachments } from "../workspace/ConversationThread";
import { ReflectionFilterPopover } from "../workspace/ReflectionFilterPopover";
import { sanitizeReflectionTags } from "../../../shared/reflection-tags";

type Props = {
  api: ApiClient;
  orgId: string;
  currentUid: string;
  permissions: OrganizationPermissions;
  memberNames: Map<string, string>;
};

type ListStatus = "loading" | "ready" | "error";
const MAX_RECORDING_MS = 5 * 60 * 1_000;

function authorLabel(
  authorUid: string | null,
  currentUid: string,
  memberNames: Map<string, string>,
): string {
  if (authorUid === null) return "Cognaxis";
  if (authorUid === currentUid) return "You";
  return memberNames.get(authorUid) ?? "A member";
}

export function OrgConversation({ api, orgId, currentUid, permissions, memberNames }: Props) {
  const [sessions, setSessions] = useState<OrganizationSession[]>([]);
  const [listStatus, setListStatus] = useState<ListStatus>("loading");
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrganizationSessionDetail | null>(null);
  const [catalogTags, setCatalogTags] = useState<string[]>([]);
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [detailPending, setDetailPending] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [attachments, setAttachments] = useState<AttachmentReference[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [pendingUploadName, setPendingUploadName] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>({});
  const [transcribedAttachmentIds, setTranscribedAttachmentIds] = useState<Set<string>>(() => new Set());
  const imagePreviewsRef = useRef<Record<string, string>>({});
  const recorderRef = useRef<MediaRecorder | null>(null);
  const sendAbortControllerRef = useRef<AbortController | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const discardRecordingRef = useRef(false);

  useEffect(() => {
    imagePreviewsRef.current = imagePreviews;
  }, [imagePreviews]);
  const [reloadToken, setReloadToken] = useState(0);
  const requestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const loadSelectedAttachment = useCallback(
    (attachmentId: string) => {
      if (!selectedId) return Promise.reject(new Error("No selected team capture"));
      return api.getOrganizationAttachment(orgId, selectedId, attachmentId);
    },
    [api, orgId, selectedId],
  );

  useEffect(() => () => {
    sendAbortControllerRef.current?.abort();
    recorderRef.current?.stop();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    Object.values(imagePreviewsRef.current).forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      const startedAt = recordingStartedAtRef.current;
      if (startedAt === null) return;
      const elapsed = Date.now() - startedAt;
      setRecordingElapsedMs(Math.min(elapsed, MAX_RECORDING_MS));
      if (elapsed >= MAX_RECORDING_MS) {
        setAttachmentError("The 5-minute recording limit was reached.");
        recorderRef.current?.stop();
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  const open = useCallback(async (sessionId: string) => {
    const detailRequestId = ++detailRequestRef.current;
    setSelectedId(sessionId);
    setDetailPending(true);
    setActionError(null);
    setAttachmentError(null);
    setAttachments([]);
    setTranscribedAttachmentIds(new Set());
    try {
        const loaded = await api.getOrganizationSession(orgId, sessionId);
        if (detailRequestRef.current !== detailRequestId) return;
        setDetail(loaded);
        setSummaryExpanded(false);
        setSessions((current) => [loaded, ...current.filter((session) => session.id !== loaded.id)]);
    } catch (error) {
      if (detailRequestRef.current !== detailRequestId) return;
      setActionError(
        error instanceof ApiError ? error.message : "This shared reflection could not be opened.",
      );
      setSelectedId(null);
      setDetail(null);
    } finally {
      if (detailRequestRef.current === detailRequestId) setDetailPending(false);
    }
  }, [api, orgId]);

  useEffect(() => {
    const requestId = ++requestRef.current;
    api
      .listOrganizationSessions(orgId)
      .then((loaded) => {
        if (requestRef.current !== requestId) return;
        setSessions(loaded);
        setListStatus("ready");
      })
      .catch((error: unknown) => {
        if (requestRef.current !== requestId) return;
        setListStatus("error");
        setListError(
          error instanceof ApiError ? error.message : "Shared reflections could not be loaded.",
        );
      });
    return () => {
      requestRef.current += 1;
    };
  }, [api, orgId, reloadToken, open]);

  useEffect(() => {
    let active = true;
    void api.listOrganizationTags(orgId).then((tags) => {
      if (active) setCatalogTags(sanitizeReflectionTags(tags, 100));
    }).catch(() => {
      // Session tags are still available as a fallback while the optional catalog is loading.
    });
    return () => {
      active = false;
    };
  }, [api, orgId]);

  async function send() {
    const content = draft.trim();
    if (!detail || content === "" || sending) return;
    const targetSessionId = detail.id;
    const requestId = crypto.randomUUID();
    const pendingUserId = `pending-${requestId}`;
    const pendingAssistantId = `pending-assistant-${requestId}`;
    const pendingAttachments = [...attachments];
    const attachmentIds = pendingAttachments.map((attachment) => attachment.id);
    const abortController = new AbortController();
    sendAbortControllerRef.current = abortController;
    setSending(true);
    setActionError(null);
    setDraft("");
    setAttachments([]);
    setDetail((current) => current && current.id === targetSessionId ? {
      ...current,
      messages: [
        ...current.messages,
        {
          id: pendingUserId,
          role: "user",
          content,
          ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
          authorUid: currentUid,
          createdAt: new Date().toISOString(),
        },
        {
          id: pendingAssistantId,
          role: "model",
          content: "",
          authorUid: null,
          createdAt: new Date().toISOString(),
        },
      ],
    } : current);
    try {
      const exchange = await api.addOrganizationMessageStream(orgId, targetSessionId, {
        requestId,
        content,
        attachmentIds,
      }, (chunk) => {
        setDetail((current) => current && current.id === targetSessionId ? {
          ...current,
          messages: current.messages.map((message) =>
            message.id === pendingAssistantId ? { ...message, content: message.content + chunk } : message,
          ),
        } : current);
      }, abortController.signal);
      setAttachmentError(null);
      Object.values(imagePreviewsRef.current).forEach((url) => URL.revokeObjectURL(url));
      setImagePreviews({});
      setTranscribedAttachmentIds(new Set());
      setDetail((current) =>
        current && current.id === targetSessionId
          ? {
              ...current,
              ...(exchange.session ? { title: exchange.session.title, tags: exchange.session.tags } : {}),
              messages: [
                ...current.messages.filter((message) => message.id !== pendingUserId && message.id !== pendingAssistantId),
                exchange.userMessage,
                exchange.assistantMessage,
              ],
              messageCount: exchange.messageCount,
            }
          : current,
      );
      setSessions((current) => current.map((session) => session.id === targetSessionId ? {
        ...session,
        ...(exchange.session ? { title: exchange.session.title, tags: exchange.session.tags } : {}),
        messageCount: exchange.messageCount,
        updatedAt: exchange.assistantMessage.createdAt,
      } : session));
      setAnnouncement("Cognaxis replied.");
    } catch (error) {
      setDetail((current) => current && current.id === targetSessionId ? {
        ...current,
        messages: current.messages.filter((message) => message.id !== pendingUserId && message.id !== pendingAssistantId),
      } : current);
      setDraft(content);
      setAttachments((current) => current.length === 0 ? pendingAttachments : current);
      if (!abortController.signal.aborted) {
        setActionError(error instanceof ApiError ? error.message : "Your message could not be sent.");
      }
    } finally {
      if (sendAbortControllerRef.current === abortController) sendAbortControllerRef.current = null;
      setSending(false);
    }
  }

  async function uploadAttachment(file: File): Promise<AttachmentReference | null> {
    if (!detail || uploading || attachments.length >= 3) return null;
    setUploadingAttachment(true);
    setPendingUploadName(file.name);
    setUploading(true);
    setAttachmentError(null);
    try {
      const attachment = await api.uploadOrganizationAttachment(orgId, detail.id, file);
      setAttachments((current) => [...current, attachment]);
      if (attachment.kind === "image") {
        setImagePreviews((current) => ({ ...current, [attachment.id]: URL.createObjectURL(file) }));
      }
      return attachment;
    } catch (error) {
      setAttachmentError(error instanceof ApiError ? error.message : "The attachment could not be added.");
      return null;
    } finally {
      setUploading(false);
      setUploadingAttachment(false);
      setPendingUploadName(null);
    }
  }

  async function transcribeAttachment(attachment: AttachmentReference): Promise<boolean> {
    if (!detail || attachment.kind !== "audio") return false;
    setUploading(true);
    try {
      const transcript = await api.transcribeOrganizationAttachment(orgId, detail.id, attachment.id);
      if (transcript.trim()) {
        setDraft((current) => `${current.trim()}${current.trim() ? "\n" : ""}${transcript.trim()}`.slice(0, 8_000));
        setTranscribedAttachmentIds((current) => new Set(current).add(attachment.id));
        return true;
      }
      return false;
    } catch (error) {
      setAttachmentError(error instanceof ApiError ? error.message : "The voice note could not be transcribed.");
      return false;
    } finally {
      setUploading(false);
    }
  }

  async function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await uploadAttachment(file);
    // File uploads are limited to images and documents. Voice input uses the transient
    // transcription endpoint below and is never added to the team's attachment list.
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setAttachmentError("Voice recording is not supported in this browser.");
      return;
    }
    const targetSessionId = detail?.id;
    if (!targetSessionId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg"]
        .find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      mediaStreamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        setRecording(false);
        setAttachmentError("Voice recording could not be completed.");
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.onstop = () => {
        setRecording(false);
        recordingStartedAtRef.current = null;
        recorderRef.current = null;
        mediaStreamRef.current = null;
        stream.getTracks().forEach((track) => track.stop());
        if (discardRecordingRef.current) {
          discardRecordingRef.current = false;
          setRecordingElapsedMs(0);
          setAttachmentError(null);
          return;
        }
        void (async () => {
          setUploading(true);
          try {
            const transcript = await api.transcribeOrganizationVoice(
              orgId,
              targetSessionId,
              new File(chunks, "voice-note.webm", { type: recorder.mimeType || "audio/webm" }),
            );
            if (transcript.trim()) {
              setDraft((current) => `${current.trim()}${current.trim() ? "\n" : ""}${transcript.trim()}`.slice(0, 8_000));
            }
          } catch (error) {
            setAttachmentError(error instanceof ApiError ? error.message : "The voice note could not be transcribed.");
          } finally {
            setUploading(false);
            setRecordingElapsedMs(0);
          }
        })();
      };
      setAttachmentError(null);
      discardRecordingRef.current = false;
      setRecordingElapsedMs(0);
      recordingStartedAtRef.current = Date.now();
      setRecording(true);
      recorder.start();
    } catch {
      setAttachmentError("Microphone access was unavailable.");
    }
  }

  async function removeAttachment(attachmentId: string) {
    if (!detail || sending) return;
    try {
      await api.deleteOrganizationAttachment(orgId, detail.id, attachmentId);
      setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
      const previewUrl = imagePreviews[attachmentId];
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setImagePreviews((current) => {
        const next = { ...current };
        delete next[attachmentId];
        return next;
      });
      setTranscribedAttachmentIds((current) => {
        const next = new Set(current);
        next.delete(attachmentId);
        return next;
      });
    } catch (error) {
      setAttachmentError(error instanceof ApiError ? error.message : "The attachment could not be removed.");
    }
  }

  function discardRecording() {
    if (!recording) return;
    discardRecordingRef.current = true;
    recorderRef.current?.stop();
  }

  const recordingSeconds = Math.floor(recordingElapsedMs / 1_000);
  const formattedRecordingTime = `${String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:${String(recordingSeconds % 60).padStart(2, "0")}`;

  async function summarize() {
    if (!detail || detail.status !== "active" || summarizing) return;
    setSummarizing(true);
    setActionError(null);
    try {
      const summary = await api.summarizeOrganizationSession(orgId, detail.id);
      setDetail((current) => (current ? { ...current, summary } : current));
      setSummaryExpanded(true);
      setAnnouncement("Shared summary ready.");
    } catch (error) {
      setActionError(
        error instanceof ApiError ? error.message : "The summary could not be created.",
      );
    } finally {
      setSummarizing(false);
    }
  }

  const availableTags = useMemo(
    () => sanitizeReflectionTags([
      ...catalogTags,
      ...sessions.flatMap((session) => session.tags ?? []),
    ], 100).sort((left, right) => left.localeCompare(right)),
    [catalogTags, sessions],
  );
  const filteredSessions = sessions.filter((session) =>
    tagFilters.length === 0 || tagFilters.some((tag) => (session.tags ?? []).includes(tag)),
  );

  if (listStatus === "loading") {
    return (
      <div className="space-y-3" role="status" aria-label="Loading shared reflections">
        <Skeleton className="h-16 rounded-card" />
        <Skeleton className="h-16 rounded-card" />
      </div>
    );
  }

  if (listStatus === "error") {
    return (
      <EmptyState
        icon="refresh"
        title="Shared reflections could not be loaded"
        description={listError ?? "Check your connection and try again."}
        actions={
          <Button icon="refresh" onClick={() => setReloadToken((token) => token + 1)}>
            Try again
          </Button>
        }
      />
    );
  }

  if (detailPending) {
    return (
      <div className="space-y-4" role="status" aria-live="polite" aria-label="Opening shared reflection">
        <div className="flex items-center gap-2">
          <span className="bg-primary h-2 w-2 animate-pulse rounded-full" aria-hidden="true" />
          <p className="text-on-surface-variant text-sm">Opening reflection...</p>
        </div>
        <Skeleton className="h-8 w-2/5 rounded-control" />
        <Skeleton className="h-28 rounded-card" />
        <Skeleton className="h-20 rounded-card" />
      </div>
    );
  }

  if (selectedId === null) {
    return (
      <div>
        <div aria-live="polite" className="sr-only">
          {announcement}
        </div>
        {actionError && (
          <div className="mb-3">
            <InlineAlert tone="error" onDismiss={() => setActionError(null)}>
              {actionError}
            </InlineAlert>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2" aria-label="Reflection filters">
          <ReflectionFilterPopover
            availableTags={availableTags}
            selectedTags={tagFilters}
            onSelectedTagsChange={setTagFilters}
            label="Shared reflection filters"
          />
        </div>
        {filteredSessions.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              icon="forum"
              title="No shared reflections yet"
              description={
                "Shared reflections will appear here."
              }
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {filteredSessions.map((session) => (
              <li key={session.id}>
                <button
                  type="button"
                  onClick={() => void open(session.id)}
                  className="border-outline-variant bg-surface-container-low hover:bg-surface-container focus-visible:outline-focus-ring block w-full rounded-card border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <span className="text-on-surface block truncate text-sm font-medium">
                    {session.title}
                  </span>
                  {(session.tags ?? []).length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {(session.tags ?? []).slice(0, 3).map((tag) => <Chip key={tag} className="px-2 py-0.5 text-[10px]">{tag}</Chip>)}
                    </span>
                  )}
                  <span className="text-on-surface-variant mt-0.5 block text-xs">
                    Started by {authorLabel(session.createdBy, currentUid, memberNames)} · Updated{" "}
                    {new Date(session.updatedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

      </div>
    );
  }

  if (detail === null) return null;

  return (
    <div>
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="compact" variant="text" icon="arrow_back" onClick={() => setSelectedId(null)}>
          All shared reflections
        </Button>
        <div className="flex flex-wrap gap-2">
          {permissions.canWrite && detail.status === "active" && (
            <Button
              size="compact"
              variant="tonal"
              icon="auto_awesome"
              onClick={() => void summarize()}
              loading={summarizing}
              loadingLabel="Summarizing…"
              disabled={detail.messages.length < 2}
            >
              {detail.summary ? "Update summary" : "Create summary"}
            </Button>
          )}
        </div>
      </div>

      <h3 className="text-on-surface mt-3 text-base font-medium">{detail.title}</h3>
      {(detail.tags ?? []).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1" aria-label="Reflection tags">
          {(detail.tags ?? []).map((tag) => <Chip key={tag} className="px-2 py-0.5 text-[10px]">{tag}</Chip>)}
        </div>
      )}

      {detail.status === "archived" && (
        <div className="border-outline-variant bg-surface-container-low mt-3 rounded-card border p-3 text-sm">
          <p className="text-on-surface font-medium">This shared reflection is archived.</p>
          <p className="text-on-surface-variant mt-1">It is read-only and excluded from team memory until it is restored.</p>
        </div>
      )}

      {actionError && (
        <div className="mt-3">
          <InlineAlert tone="error" onDismiss={() => setActionError(null)}>
            {actionError}
          </InlineAlert>
        </div>
      )}

      {detail.summary && (
        <section
          aria-label="Shared summary"
          className="border-outline-variant bg-surface-container-low mt-3 rounded-card border p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-on-surface text-sm font-medium">{detail.summary.title}</h4>
            <Button
              size="compact"
              variant="text"
              icon={summaryExpanded ? "expand_less" : "expand_more"}
              onClick={() => setSummaryExpanded((expanded) => !expanded)}
              aria-expanded={summaryExpanded}
            >
              {summaryExpanded ? "Hide summary" : "View summary"}
            </Button>
          </div>
          {summaryExpanded && <p className="text-on-surface mt-2 text-sm">{detail.summary.summary}</p>}
        </section>
      )}

      {detail.messages.length > 0 && (
        <ol className="mt-4 space-y-3">
          {detail.messages.map((message) => (
            <li
              key={message.id}
              className={`rounded-card border p-3 ${
                message.role === "user"
                  ? "border-outline-variant bg-surface-container-low"
                  : "border-primary/20 bg-primary-container/20"
              }`}
            >
              <p className="text-on-surface-variant text-xs font-medium">
                {authorLabel(message.authorUid, currentUid, memberNames)}
              </p>
              {message.role === "model" ? (
                <FormattedMessage content={message.content} className="text-on-surface mt-1 text-sm" />
              ) : (
                <p className="text-on-surface mt-1 text-sm whitespace-pre-wrap">{message.content}</p>
              )}
              {message.role === "user" && message.attachmentIds && message.attachmentIds.length > 0 && (
                <div className="mt-2">
                  <PrivateMessageAttachments
                    attachmentIds={message.attachmentIds}
                    loadAttachment={loadSelectedAttachment}
                  />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      <p className="text-on-surface-variant mt-4 text-sm">
        Team reflections are read-only here. Continue your own reflection from Home.
      </p>

    </div>
  );
}
