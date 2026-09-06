import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
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
  const [summarizing, setSummarizing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
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

  const open = useCallback(async (sessionId: string) => {
    const detailRequestId = ++detailRequestRef.current;
    setSelectedId(sessionId);
    setDetailPending(true);
    setActionError(null);
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
