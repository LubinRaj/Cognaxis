import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { useOutletContext } from "react-router-dom";
import type {
  JournalSession,
  OrganizationSession,
  UserOrganizationEdge,
} from "../../shared/schemas";
import { MaterialIcon } from "../components/MaterialIcon";
import { Button } from "../components/ui/Button";
import { Chip } from "../components/ui/Chip";
import { Dialog } from "../components/ui/Dialog";
import { EmptyState } from "../components/ui/EmptyState";
import { InlineAlert } from "../components/ui/InlineAlert";
import { Skeleton } from "../components/ui/Skeleton";
import { ApiError } from "../lib/api-client";
import { useApiClient } from "../lib/use-api-client";
import { usePageTitle } from "../shell/use-page-title";

type LoadStatus = "loading" | "ready" | "error";

type TeamArchiveState = {
  status: LoadStatus;
  sessions: OrganizationSession[];
  error: string | null;
};

type ArchiveTarget =
  | { scope: "personal"; session: JournalSession }
  | { scope: "team"; orgId: string; organizationName: string; session: OrganizationSession };

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function canManageTeamArchive(
  edge: UserOrganizationEdge,
  session: OrganizationSession,
  currentUid: string,
): boolean {
  return (
    edge.role === "owner" ||
    edge.role === "admin" ||
    (edge.role === "member" && session.createdBy === currentUid)
  );
}

function ArchiveRow({
  title,
  tags,
  updatedAt,
  supportingText,
  pending,
  canManage,
  onRestore,
  onDelete,
}: {
  title: string;
  tags: string[];
  updatedAt: string;
  supportingText?: string;
  pending: boolean;
  canManage: boolean;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="border-outline-variant bg-surface-container-low flex flex-col gap-3 rounded-card border p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-on-surface truncate text-sm font-medium">{title}</p>
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.slice(0, 5).map((tag) => (
              <Chip key={tag} className="px-2 py-0.5 text-[10px]">
                {tag}
              </Chip>
            ))}
          </div>
        )}
        <p className="text-on-surface-variant mt-1 text-xs">
          Archived {formatDate(updatedAt)}{supportingText ? ` · ${supportingText}` : ""}
        </p>
      </div>
      {canManage ? (
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            size="compact"
            variant="outlined"
            icon="refresh"
            disabled={pending}
            onClick={onRestore}
          >
            Restore
          </Button>
          <Button
            size="compact"
            variant="text"
            icon="delete"
            disabled={pending}
            onClick={onDelete}
            className="text-error"
          >
            Delete
          </Button>
        </div>
      ) : (
        <Chip icon="visibility">View only</Chip>
      )}
    </li>
  );
}

export function ArchivesPage() {
  const user = useOutletContext<User>();
  const api = useApiClient(user);
  usePageTitle("Archives · Cognaxis");

  const [personal, setPersonal] = useState<JournalSession[]>([]);
  const [organizations, setOrganizations] = useState<UserOrganizationEdge[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [teamArchives, setTeamArchives] = useState<Record<string, TeamArchiveState>>({});
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ArchiveTarget | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestRef.current;
    setStatus("loading");
    setLoadError(null);
    void Promise.all([api.listSessions("archived"), api.listOrganizations()])
      .then(([personalSessions, teamEdges]) => {
        if (requestRef.current !== requestId) return;
        setPersonal(personalSessions);
        setOrganizations(teamEdges.filter((edge) => edge.status === "active"));
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (requestRef.current !== requestId) return;
        setStatus("error");
        setLoadError(messageOf(error, "Your archives could not be loaded."));
      });
    return () => {
      requestRef.current += 1;
    };
  }, [api, reloadToken]);

  async function loadTeamArchives(edge: UserOrganizationEdge) {
    setTeamArchives((states) => ({
      ...states,
      [edge.orgId]: { status: "loading", sessions: [], error: null },
    }));
    try {
      const sessions = await api.listOrganizationSessions(edge.orgId, "archived");
      setTeamArchives((states) => ({
        ...states,
        [edge.orgId]: { status: "ready", sessions, error: null },
      }));
    } catch (error) {
      setTeamArchives((states) => ({
        ...states,
        [edge.orgId]: {
          status: "error",
          sessions: [],
          error: messageOf(error, `${edge.organizationName} archives could not be loaded.`),
        },
      }));
    }
  }

  function toggleTeam(edge: UserOrganizationEdge) {
    if (expandedTeamId === edge.orgId) {
      setExpandedTeamId(null);
      return;
    }
    setExpandedTeamId(edge.orgId);
    const current = teamArchives[edge.orgId];
    if (!current || current.status === "error") void loadTeamArchives(edge);
  }

  async function restore(target: ArchiveTarget) {
    const key = `${target.scope}:${target.session.id}`;
    if (pendingKey) return;
    setPendingKey(key);
    setActionError(null);
    try {
      if (target.scope === "personal") {
        await api.restoreSession(target.session.id);
        setPersonal((sessions) => sessions.filter((session) => session.id !== target.session.id));
      } else {
        await api.restoreOrganizationSession(target.orgId, target.session.id);
        setTeamArchives((states) => ({
          ...states,
          [target.orgId]: {
            ...(states[target.orgId] ?? { status: "ready", error: null }),
            sessions: (states[target.orgId]?.sessions ?? []).filter(
              (session) => session.id !== target.session.id,
            ),
          },
        }));
      }
      setAnnouncement(`${target.session.title} restored.`);
    } catch (error) {
      setActionError(messageOf(error, "This reflection could not be restored."));
    } finally {
      setPendingKey(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || pendingKey) return;
    const target = deleteTarget;
    const key = `${target.scope}:${target.session.id}`;
    setPendingKey(key);
    setActionError(null);
    try {
      if (target.scope === "personal") {
        await api.deleteSession(target.session.id);
        setPersonal((sessions) => sessions.filter((session) => session.id !== target.session.id));
      } else {
        await api.deleteOrganizationSession(target.orgId, target.session.id);
        setTeamArchives((states) => ({
          ...states,
          [target.orgId]: {
            ...(states[target.orgId] ?? { status: "ready", error: null }),
            sessions: (states[target.orgId]?.sessions ?? []).filter(
              (session) => session.id !== target.session.id,
            ),
          },
        }));
      }
      setDeleteTarget(null);
      setAnnouncement(`${target.session.title} permanently deleted.`);
    } catch (error) {
      setActionError(messageOf(error, "This reflection could not be permanently deleted."));
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6 sm:py-8">
        <div aria-live="polite" className="sr-only">{announcement}</div>
        <header>
          <div className="flex items-center gap-3">
            <span className="bg-primary-container text-on-primary-container flex h-11 w-11 items-center justify-center rounded-2xl" aria-hidden="true">
              <MaterialIcon name="archive" size={24} />
            </span>
            <div>
              <h1 className="font-display text-on-surface text-2xl font-medium">Archives</h1>
              <p className="text-on-surface-variant mt-1 text-sm">
                Archived reflections stay out of active lists, Ask me, and insights until restored.
              </p>
            </div>
          </div>
        </header>

        {actionError && (
          <InlineAlert tone="error" className="mt-5" onDismiss={() => setActionError(null)}>
            {actionError}
          </InlineAlert>
        )}

        {status === "loading" ? (
          <div className="mt-8 space-y-4" role="status" aria-label="Loading archives">
            <Skeleton className="h-28 rounded-card" />
            <Skeleton className="h-28 rounded-card" />
          </div>
        ) : status === "error" ? (
          <div className="mt-8">
            <EmptyState
              icon="refresh"
              title="Your archives could not be loaded"
              description={loadError ?? "Please try again."}
              actions={<Button icon="refresh" onClick={() => setReloadToken((token) => token + 1)}>Try again</Button>}
            />
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            <section aria-labelledby="personal-archives-heading">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 id="personal-archives-heading" className="font-display text-on-surface text-lg font-medium">Personal</h2>
                  <p className="text-on-surface-variant mt-1 text-xs">Visible only to you.</p>
                </div>
                <Chip>{personal.length}</Chip>
              </div>
              {personal.length === 0 ? (
                <div className="border-outline-variant mt-3 rounded-card border border-dashed">
                  <EmptyState
                    icon="archive"
                    size="compact"
                    headingLevel={3}
                    title="No personal archives"
                    description="Personal reflections you archive will appear here."
                  />
                </div>
              ) : (
                <ul className="mt-3 space-y-3">
                  {personal.map((session) => {
                    const target: ArchiveTarget = { scope: "personal", session };
                    return (
                      <ArchiveRow
                        key={session.id}
                        title={session.title}
                        tags={session.tags ?? []}
                        updatedAt={session.updatedAt}
                        pending={pendingKey === `personal:${session.id}`}
                        canManage
                        onRestore={() => void restore(target)}
                        onDelete={() => setDeleteTarget(target)}
                      />
                    );
                  })}
                </ul>
              )}
            </section>

            <section aria-labelledby="team-archives-heading">
              <h2 id="team-archives-heading" className="font-display text-on-surface text-lg font-medium">Teams</h2>
              <p className="text-on-surface-variant mt-1 text-xs">
                Open a team to load its archived reflections without mixing team data.
              </p>
              {organizations.length === 0 ? (
                <div className="border-outline-variant mt-3 rounded-card border border-dashed">
                  <EmptyState
                    icon="groups"
                    size="compact"
                    headingLevel={3}
                    title="No teams"
                    description="Teams you belong to will appear here."
                  />
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {organizations.map((edge) => {
                    const expanded = expandedTeamId === edge.orgId;
                    const teamState = teamArchives[edge.orgId];
                    return (
                      <div key={edge.orgId} className="border-outline-variant bg-surface-container-low overflow-hidden rounded-card border">
                        <button
                          type="button"
                          aria-expanded={expanded}
                          onClick={() => void toggleTeam(edge)}
                          className="hover:bg-surface-container focus-visible:outline-focus-ring flex min-h-16 w-full items-center justify-between gap-3 p-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2"
                        >
                          <span className="min-w-0">
                            <span className="text-on-surface block truncate text-sm font-medium">{edge.organizationName}</span>
                            <span className="text-on-surface-variant mt-0.5 block text-xs capitalize">{edge.role}</span>
                          </span>
                          <span className="flex items-center gap-2">
                            {teamState?.status === "ready" && <Chip>{teamState.sessions.length}</Chip>}
                            <MaterialIcon name={expanded ? "expand_less" : "expand_more"} size={20} />
                          </span>
                        </button>
                        {expanded && (
                          <div className="border-outline-variant border-t p-4">
                            {!teamState || teamState.status === "loading" ? (
                              <div role="status" aria-label={`Loading ${edge.organizationName} archives`} className="space-y-2">
                                <Skeleton className="h-20 rounded-card" />
                                <Skeleton className="h-20 rounded-card" />
                              </div>
                            ) : teamState.status === "error" ? (
                              <InlineAlert
                                tone="error"
                                action={
                                  <Button
                                    size="compact"
                                    variant="outlined"
                                    icon="refresh"
                                    onClick={() => {
                                      void loadTeamArchives(edge);
                                    }}
                                  >
                                    Try again
                                  </Button>
                                }
                              >
                                {teamState.error}
                              </InlineAlert>
                            ) : teamState.sessions.length === 0 ? (
                              <p className="text-on-surface-variant py-3 text-center text-sm">No archived reflections in this team.</p>
                            ) : (
                              <ul className="space-y-3">
                                {teamState.sessions.map((session) => {
                                  const target: ArchiveTarget = {
                                    scope: "team",
                                    orgId: edge.orgId,
                                    organizationName: edge.organizationName,
                                    session,
                                  };
                                  return (
                                    <ArchiveRow
                                      key={session.id}
                                      title={session.title}
                                      tags={session.tags ?? []}
                                      updatedAt={session.updatedAt}
                                      supportingText={edge.organizationName}
                                      pending={pendingKey === `team:${session.id}`}
                                      canManage={canManageTeamArchive(edge, session, user.uid)}
                                      onRestore={() => void restore(target)}
                                      onDelete={() => setDeleteTarget(target)}
                                    />
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      <Dialog
        open={deleteTarget !== null}
        title="Delete this reflection permanently?"
        description={
          deleteTarget
            ? `“${deleteTarget.session.title}” and its messages, summary, attachments, and memory index will be permanently removed${deleteTarget.scope === "team" ? ` from ${deleteTarget.organizationName}` : ""}. This cannot be undone.`
            : undefined
        }
        tone="destructive"
        busy={pendingKey !== null}
        onClose={() => setDeleteTarget(null)}
        actions={
          <>
            <Button variant="text" disabled={pendingKey !== null} onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" loading={pendingKey !== null} onClick={() => void confirmDelete()}>
              Delete permanently
            </Button>
          </>
        }
      />
    </div>
  );
}

export default ArchivesPage;
