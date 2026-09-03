import { useEffect, useRef, useState } from "react";
import type {
  OrganizationPermissions,
  OrganizationSession,
  OrganizationSessionDetail,
} from "../../../shared/schemas";
import type { ApiClient } from "../../lib/api-client";
import { ApiError } from "../../lib/api-client";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { InlineAlert } from "../ui/InlineAlert";
import { Skeleton } from "../ui/Skeleton";

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
  const [detailPending, setDetailPending] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const requestRef = useRef(0);

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
  }, [api, orgId, reloadToken]);

  async function open(sessionId: string) {
    setSelectedId(sessionId);
    setDetailPending(true);
    setActionError(null);
    try {
      const loaded = await api.getOrganizationSession(orgId, sessionId);
      setDetail(loaded);
    } catch (error) {
      setActionError(
        error instanceof ApiError ? error.message : "This shared reflection could not be opened.",
      );
      setSelectedId(null);
      setDetail(null);
    } finally {
      setDetailPending(false);
    }
  }

  async function createSession() {
    setCreating(true);
    setActionError(null);
    try {
      const session = await api.createOrganizationSession(orgId);
      setSessions((current) => [session, ...current]);
      await open(session.id);
    } catch (error) {
      setActionError(
        error instanceof ApiError
          ? error.message
          : "A shared reflection could not be started right now.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function send() {
    const content = draft.trim();
    if (!detail || content === "" || sending) return;
    setSending(true);
    setActionError(null);
    try {
      const exchange = await api.addOrganizationMessage(orgId, detail.id, {
        requestId: crypto.randomUUID(),
        content,
      });
      setDraft("");
      setDetail((current) =>
        current
          ? {
              ...current,
              messages: [...current.messages, exchange.userMessage, exchange.assistantMessage],
              messageCount: exchange.messageCount,
            }
          : current,
      );
      setAnnouncement("Cognaxis replied.");
    } catch (error) {
      setActionError(
        error instanceof ApiError ? error.message : "Your message could not be sent.",
      );
    } finally {
      setSending(false);
    }
  }

  async function summarize() {
    if (!detail || summarizing) return;
    setSummarizing(true);
    setActionError(null);
    try {
      const summary = await api.summarizeOrganizationSession(orgId, detail.id);
      setDetail((current) => (current ? { ...current, summary } : current));
      setAnnouncement("Shared summary ready.");
    } catch (error) {
      setActionError(
        error instanceof ApiError ? error.message : "The summary could not be created.",
      );
    } finally {
      setSummarizing(false);
    }
  }

  async function removeSession() {
    if (!detail || deleting) return;
    setDeleting(true);
    setActionError(null);
    try {
      await api.deleteOrganizationSession(orgId, detail.id);
      setSessions((current) => current.filter((session) => session.id !== detail.id));
      setSelectedId(null);
      setDetail(null);
      setAnnouncement("Shared reflection deleted.");
    } catch (error) {
      setActionError(
        error instanceof ApiError ? error.message : "The reflection could not be deleted.",
      );
    } finally {
      setDeleting(false);
    }
  }

  const canDeleteSelected =
    detail !== null &&
    permissions.canWrite &&
    (detail.createdBy === currentUid || permissions.canManageMembers);

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

  if (selectedId === null || (detail === null && detailPending)) {
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
        <div className="flex items-center justify-between gap-3">
          <p className="text-on-surface-variant text-sm">
            Conversations here are shared with every active member of this organization.
          </p>
          {permissions.canWrite && (
            <Button
              size="compact"
              icon="add"
              onClick={() => void createSession()}
              loading={creating}
              loadingLabel="Starting…"
            >
              New shared reflection
            </Button>
          )}
        </div>

        {detailPending ? (
          <div className="mt-4" role="status" aria-label="Opening shared reflection">
            <Skeleton className="h-40 rounded-card" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              icon="forum"
              title="No shared reflections yet"
              description={
                permissions.canWrite
                  ? "Start the first shared reflection for this organization."
                  : "You have view-only access. Shared reflections will appear here."
              }
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {sessions.map((session) => (
              <li key={session.id}>
                <button
                  type="button"
                  onClick={() => void open(session.id)}
                  className="border-outline-variant bg-surface-container-low hover:bg-surface-container focus-visible:outline-focus-ring block w-full rounded-card border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <span className="text-on-surface block truncate text-sm font-medium">
                    {session.title}
                  </span>
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
          {permissions.canWrite && (
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
          {canDeleteSelected && (
            <Button
              size="compact"
              variant="text"
              className="text-error hover:bg-error-container/40"
              onClick={() => void removeSession()}
              loading={deleting}
              loadingLabel="Deleting…"
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      <h3 className="text-on-surface mt-3 text-base font-medium">{detail.title}</h3>

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
          <h4 className="text-on-surface text-sm font-medium">{detail.summary.title}</h4>
          <p className="text-on-surface mt-1 text-sm">{detail.summary.summary}</p>
        </section>
      )}

      {detail.messages.length === 0 ? (
        <p className="text-on-surface-variant mt-6 text-sm">
          Before you write: everything in this conversation can be read by every active member of
          this organization.
        </p>
      ) : (
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
              <p className="text-on-surface mt-1 text-sm whitespace-pre-wrap">{message.content}</p>
            </li>
          ))}
        </ol>
      )}

      {permissions.canWrite ? (
        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <label htmlFor="org-composer" className="sr-only">
            Message to the organization
          </label>
          <textarea
            id="org-composer"
            value={draft}
            rows={3}
            maxLength={8_000}
            disabled={sending}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Share a thought with this organization…"
            className="border-outline-variant bg-surface text-on-surface placeholder:text-on-surface-variant focus-visible:outline-focus-ring w-full resize-none rounded-field border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          <div className="mt-2 flex justify-end">
            <Button
              type="submit"
              size="compact"
              loading={sending}
              loadingLabel="Sending…"
              disabled={draft.trim() === "" || sending}
            >
              Send
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-on-surface-variant mt-4 text-sm">
          You have view-only access to this organization.
        </p>
      )}
    </div>
  );
}
