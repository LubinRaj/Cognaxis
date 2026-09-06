import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { User } from "firebase/auth";
import type {
  AdminOverview,
  AuditEvent,
  Organization,
  PlatformUser,
} from "../../shared/schemas";
import { ApiError, type ApiClient } from "../lib/api-client";
import { useApiClient } from "../lib/use-api-client";
import { AccessibleLineChart } from "../components/ui/AccessibleLineChart";
import { Avatar } from "../components/ui/Avatar";
import { Button } from "../components/ui/Button";
import { Chip } from "../components/ui/Chip";
import { Dialog } from "../components/ui/Dialog";
import { EmptyState } from "../components/ui/EmptyState";
import { InlineAlert } from "../components/ui/InlineAlert";
import { Menu } from "../components/ui/Menu";
import { Skeleton } from "../components/ui/Skeleton";
import { Tabs } from "../components/ui/Tabs";
import { TextField } from "../components/ui/TextField";
import { useCapabilities } from "../shell/capabilities-context";
import { usePageTitle } from "../shell/use-page-title";

const REASON_HINT = "An operational reason between 10 and 240 characters is recorded in the audit trail.";

type PendingAction = {
  title: string;
  description: string;
  confirmLabel: string;
  destructive: boolean;
  execute: (reason: string) => Promise<void>;
};

function metric(value: number | null): string {
  return value === null ? "Unavailable" : String(value);
}

function formatInstant(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function OverviewTab({ api }: { api: ApiClient }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .adminOverview()
      .then((loaded) => {
        if (!cancelled) setOverview(loaded);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  if (failed) {
    return <InlineAlert tone="error">The overview could not be loaded.</InlineAlert>;
  }
  if (!overview) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading overview">
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-48 rounded-card" />
      </div>
    );
  }

  const usageMax = Math.max(
    5,
    ...overview.usage.flatMap((day) => [day.sessionsCreated, day.messageExchangesCompleted]),
  );

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="border-outline-variant bg-surface-container-low rounded-card border p-4">
          <p className="text-on-surface-variant text-xs font-medium">Application users</p>
          <p className="text-on-surface mt-1 text-2xl font-semibold">
            {metric(overview.totalUsers)}
          </p>
        </div>
        <div className="border-outline-variant bg-surface-container-low rounded-card border p-4">
          <p className="text-on-surface-variant text-xs font-medium">Active in the last 7 days</p>
          <p className="text-on-surface mt-1 text-2xl font-semibold">
            {metric(overview.activeUsersLast7Days)}
          </p>
        </div>
        <div className="border-outline-variant bg-surface-container-low rounded-card border p-4">
          <p className="text-on-surface-variant text-xs font-medium">Active organizations</p>
          <p className="text-on-surface mt-1 text-2xl font-semibold">
            {metric(overview.activeOrganizations)}
          </p>
        </div>
      </div>

      <section className="border-outline-variant bg-surface-container-low mt-4 rounded-card border p-4">
        <h3 className="text-on-surface text-sm font-medium">Product usage, last 7 days</h3>
        {overview.usage.length === 0 ? (
          <p className="text-on-surface-variant mt-2 text-sm">
            No usage has been recorded for this period.
          </p>
        ) : (
          <div className="mt-3">
            <AccessibleLineChart
              title="Product usage over the last seven days"
              description="Event counts only; no content or wellbeing data is aggregated."
              xLabels={overview.usage.map((day) => day.date)}
              min={0}
              max={usageMax}
              formatLabel={(date) =>
                new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                })
              }
              tableCaption="Daily counts of created reflections and completed AI exchanges."
              series={[
                {
                  id: "sessions",
                  label: "Reflections created",
                  color: "var(--sys-primary)",
                  points: overview.usage.map((day) => day.sessionsCreated),
                },
                {
                  id: "exchanges",
                  label: "AI exchanges",
                  color: "var(--sys-success)",
                  dash: "6 4",
                  points: overview.usage.map((day) => day.messageExchangesCompleted),
                },
              ]}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function UsersTab({
  api,
  currentUid,
  onAction,
}: {
  api: ApiClient;
  currentUid: string;
  onAction: (action: PendingAction) => void;
}) {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestRef = useRef(0);

  function fetchUsers(cursor: string | null, append: boolean, searchQuery: string) {
    const requestId = ++requestRef.current;
    api
      .adminListUsers({ query: searchQuery.trim() || undefined, cursor, limit: 25 })
      .then((page) => {
        if (requestRef.current !== requestId) return;
        setUsers((current) => (append ? [...current, ...page.users] : page.users));
        setNextCursor(page.nextCursor);
      })
      .catch((error: unknown) => {
        if (requestRef.current !== requestId) return;
        setErrorMessage(
          error instanceof ApiError ? error.message : "The user directory could not be loaded.",
        );
      })
      .finally(() => {
        if (requestRef.current === requestId) setLoading(false);
      });
  }

  function load(cursor: string | null, append: boolean, searchQuery: string) {
    setLoading(true);
    setErrorMessage(null);
    fetchUsers(cursor, append, searchQuery);
  }

  // The initial state is already loading, so the mount effect only starts the request.
  useEffect(() => {
    fetchUsers(null, false, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  function refreshUser(updated: PlatformUser) {
    setUsers((current) => current.map((user) => (user.uid === updated.uid ? updated : user)));
  }

  return (
    <div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          load(null, false, query);
        }}
      >
        <div className="min-w-64 flex-1">
          <TextField
            label="Find by exact email or user ID"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onClear={() => {
              setQuery("");
              load(null, false, "");
            }}
          />
        </div>
        <Button type="submit" size="compact" variant="tonal" icon="search">
          Search
        </Button>
      </form>

      {errorMessage && (
        <div className="mt-3">
          <InlineAlert tone="error" onDismiss={() => setErrorMessage(null)}>
            {errorMessage}
          </InlineAlert>
        </div>
      )}

      {loading && users.length === 0 ? (
        <div className="mt-4 space-y-2" role="status" aria-label="Loading users">
          <Skeleton className="h-16 rounded-card" />
          <Skeleton className="h-16 rounded-card" />
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {users.map((platformUser) => {
            const isSelf = platformUser.uid === currentUid;
            const name = platformUser.displayName ?? platformUser.email ?? platformUser.uid;
            return (
              <li
                key={platformUser.uid}
                className="border-outline-variant bg-surface-container-low flex flex-wrap items-center gap-3 rounded-card border p-3"
              >
                <Avatar displayName={platformUser.displayName} email={platformUser.email} />
                <div className="min-w-0 flex-1">
                  <p className="text-on-surface truncate text-sm font-medium">
                    {name}
                    {isSelf ? " (you)" : ""}
                  </p>
                  <p className="text-on-surface-variant truncate text-xs">
                    {platformUser.email ?? "No email"} · First seen{" "}
                    {formatInstant(platformUser.firstSeenAt)} · Last active{" "}
                    {formatInstant(platformUser.lastSeenAt)}
                  </p>
                </div>
                <Chip tone={platformUser.platformRole === "super_admin" ? "primary" : "neutral"}>
                  {platformUser.platformRole === "super_admin" ? "Super admin" : "User"}
                </Chip>
                <Chip tone={platformUser.status === "active" ? "success" : "warning"}>
                  {platformUser.status}
                </Chip>
                {!isSelf && (
                  <Menu
                    label={`Manage ${name}`}
                    items={[
                      platformUser.platformRole === "user"
                        ? {
                            id: "promote",
                            label: "Promote to super admin",
                            onSelect: () =>
                              onAction({
                                title: "Promote to super admin?",
                                description: `${name} will be able to manage every platform user and organization. They still cannot read anyone's private journal.`,
                                confirmLabel: "Promote",
                                destructive: false,
                                execute: async (reason) =>
                                  refreshUser(
                                    await api.adminSetUserRole(platformUser.uid, {
                                      role: "super_admin",
                                      reason,
                                    }),
                                  ),
                              }),
                          }
                        : {
                            id: "demote",
                            label: "Demote to user",
                            onSelect: () =>
                              onAction({
                                title: "Demote this super admin?",
                                description: `${name} will lose platform administration access immediately.`,
                                confirmLabel: "Demote",
                                destructive: true,
                                execute: async (reason) =>
                                  refreshUser(
                                    await api.adminSetUserRole(platformUser.uid, {
                                      role: "user",
                                      reason,
                                    }),
                                  ),
                              }),
                          },
                      platformUser.status === "active"
                        ? {
                            id: "suspend",
                            label: "Suspend application access",
                            tone: "destructive" as const,
                            separated: true,
                            onSelect: () =>
                              onAction({
                                title: "Suspend this account?",
                                description: `${name} will immediately lose access to Cognaxis. Nothing is deleted, and access can be restored later.`,
                                confirmLabel: "Suspend",
                                destructive: true,
                                execute: async (reason) =>
                                  refreshUser(
                                    await api.adminSetUserStatus(platformUser.uid, {
                                      status: "suspended",
                                      reason,
                                    }),
                                  ),
                              }),
                          }
                        : {
                            id: "restore",
                            label: "Restore application access",
                            separated: true,
                            onSelect: () =>
                              onAction({
                                title: "Restore this account?",
                                description: `${name} will regain access to Cognaxis immediately.`,
                                confirmLabel: "Restore",
                                destructive: false,
                                execute: async (reason) =>
                                  refreshUser(
                                    await api.adminSetUserStatus(platformUser.uid, {
                                      status: "active",
                                      reason,
                                    }),
                                  ),
                              }),
                          },
                    ]}
                    trigger={(props) => (
                      <Button {...props} aria-label={`Manage ${name}`} size="compact" variant="outlined">
                        Manage
                      </Button>
                    )}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {nextCursor && (
        <div className="mt-3 flex justify-center">
          <Button
            size="compact"
            variant="outlined"
            loading={loading}
            loadingLabel="Loading…"
            onClick={() => load(nextCursor, true, query)}
          >
            Load more users
          </Button>
        </div>
      )}
    </div>
  );
}

function OrganizationsTab({
  api,
  onAction,
}: {
  api: ApiClient;
  onAction: (action: PendingAction) => void;
}) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Loading starts true and is re-armed by the reload button, so the effect only fetches.
  useEffect(() => {
    let cancelled = false;
    api
      .adminListOrganizations()
      .then((loaded) => {
        if (!cancelled) setOrganizations(loaded);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setErrorMessage(
            error instanceof ApiError ? error.message : "Organizations could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, reloadToken]);

  if (loading) {
    return (
      <div className="space-y-2" role="status" aria-label="Loading organizations">
        <Skeleton className="h-16 rounded-card" />
      </div>
    );
  }

  return (
    <div>
      {errorMessage && (
        <div className="mb-3">
          <InlineAlert tone="error" onDismiss={() => setErrorMessage(null)}>
            {errorMessage}
          </InlineAlert>
        </div>
      )}
      {organizations.length === 0 ? (
        <p className="text-on-surface-variant text-sm">No organizations exist yet.</p>
      ) : (
        <ul className="space-y-2">
          {organizations.map((organization) => (
            <li
              key={organization.id}
              className="border-outline-variant bg-surface-container-low flex flex-wrap items-center gap-3 rounded-card border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-on-surface truncate text-sm font-medium">{organization.name}</p>
                <p className="text-on-surface-variant truncate text-xs">
                  {organization.memberCount}{" "}
                  {organization.memberCount === 1 ? "member" : "members"} · Created{" "}
                  {formatInstant(organization.createdAt)} ·{" "}
                  <span className="font-mono">{organization.id}</span>
                </p>
              </div>
              <Chip tone={organization.status === "active" ? "success" : "warning"}>
                {organization.status}
              </Chip>
              <Button
                size="compact"
                variant="outlined"
                onClick={() =>
                  onAction({
                    title:
                      organization.status === "active"
                        ? "Suspend this organization?"
                        : "Restore this organization?",
                    description:
                      organization.status === "active"
                        ? `Members of “${organization.name}” will lose access to its shared workspace. Personal journals are not affected and nothing is deleted.`
                        : `Members of “${organization.name}” will regain access to its shared workspace.`,
                    confirmLabel: organization.status === "active" ? "Suspend" : "Restore",
                    destructive: organization.status === "active",
                    execute: async (reason) => {
                      await api.adminSetOrganizationStatus(organization.id, {
                        status: organization.status === "active" ? "suspended" : "active",
                        reason,
                      });
                      setLoading(true);
                      setReloadToken((token) => token + 1);
                    },
                  })
                }
              >
                {organization.status === "active" ? "Suspend" : "Restore"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AuditTab({ api }: { api: ApiClient }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  function fetchAudit(cursor: string | null, append: boolean) {
    api
      .adminListAudit(cursor)
      .then((page) => {
        setEvents((current) => (append ? [...current, ...page.events] : page.events));
        setNextCursor(page.nextCursor);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }

  function load(cursor: string | null, append: boolean) {
    setLoading(true);
    fetchAudit(cursor, append);
  }

  // The initial state is already loading, so the mount effect only starts the request.
  useEffect(() => {
    fetchAudit(null, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  if (failed) return <InlineAlert tone="error">The audit trail could not be loaded.</InlineAlert>;
  if (loading && events.length === 0) {
    return (
      <div className="space-y-2" role="status" aria-label="Loading audit events">
        <Skeleton className="h-16 rounded-card" />
      </div>
    );
  }

  return (
    <div>
      {events.length === 0 ? (
        <p className="text-on-surface-variant text-sm">No administrative events yet.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((event) => (
            <li
              key={event.id}
              className="border-outline-variant bg-surface-container-low rounded-card border p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-on-surface text-sm font-medium">{event.eventType}</p>
                <p className="text-on-surface-variant text-xs">
                  {new Date(event.createdAt).toLocaleString()}
                </p>
              </div>
              <p className="text-on-surface-variant mt-1 text-xs">
                Actor <span className="font-mono">{event.actorUid}</span> · Target{" "}
                {event.targetType} <span className="font-mono">{event.targetId}</span>
              </p>
              {event.changes.length > 0 && (
                <p className="text-on-surface mt-1 text-xs">
                  {event.changes
                    .map((change) => `${change.field}: ${change.from ?? "-"} to ${change.to ?? "-"}`)
                    .join("; ")}
                </p>
              )}
              {event.reason && (
                <p className="text-on-surface-variant mt-1 text-xs">Reason: {event.reason}</p>
              )}
              <p className="text-on-surface-variant mt-1 text-xs">
                Request <span className="font-mono">{event.requestId}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
      {nextCursor && (
        <div className="mt-3 flex justify-center">
          <Button
            size="compact"
            variant="outlined"
            loading={loading}
            loadingLabel="Loading…"
            onClick={() => load(nextCursor, true)}
          >
            Load more events
          </Button>
        </div>
      )}
    </div>
  );
}

export function AdminPage() {
  const user = useOutletContext<User>();
  const api = useApiClient(user);
  const { state: capabilitiesState } = useCapabilities();
  usePageTitle("Platform administration · Cognaxis");

  const [activeTab, setActiveTab] = useState("overview");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const isAdmin =
    capabilitiesState.status === "ready" && capabilitiesState.capabilities.features.admin;

  if (capabilitiesState.status === "ready" && !isAdmin) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <EmptyState
          icon="lock"
          title="Platform administration is not available"
          description="This account does not have platform administration access."
        />
      </div>
    );
  }

  async function confirmAction() {
    if (!pendingAction) return;
    const trimmed = reason.trim();
    if (trimmed.length < 10 || trimmed.length > 240) {
      setActionError(REASON_HINT);
      return;
    }
    setActionBusy(true);
    setActionError(null);
    try {
      await pendingAction.execute(trimmed);
      setAnnouncement("Change applied and recorded in the audit trail.");
      setPendingAction(null);
      setReason("");
    } catch (error) {
      setActionError(
        error instanceof ApiError ? error.message : "The change could not be applied.",
      );
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[980px] px-4 py-6 sm:px-6">
        <div aria-live="polite" className="sr-only">
          {announcement}
        </div>

        <header className="border-outline-variant border-b pb-4">
          <p className="text-on-surface-variant text-xs font-medium tracking-wide uppercase">
            Platform administration
          </p>
          <h1 className="font-display text-on-surface mt-1 text-2xl font-medium">
            Operations
          </h1>
        </header>

        <div className="mt-5">
          <Tabs
            label="Administration sections"
            tabs={[
              { id: "overview", label: "Overview" },
              { id: "users", label: "Users" },
              { id: "organizations", label: "Organizations" },
              { id: "audit", label: "Audit" },
            ]}
            activeId={activeTab}
            onChange={setActiveTab}
          >
            {activeTab === "users" ? (
              <UsersTab api={api} currentUid={user.uid} onAction={setPendingAction} />
            ) : activeTab === "organizations" ? (
              <OrganizationsTab api={api} onAction={setPendingAction} />
            ) : activeTab === "audit" ? (
              <AuditTab api={api} />
            ) : (
              <OverviewTab api={api} />
            )}
          </Tabs>
        </div>
      </div>

      {pendingAction && (
        <Dialog
          open
          title={pendingAction.title}
          description={pendingAction.description}
          tone={pendingAction.destructive ? "destructive" : "default"}
          busy={actionBusy}
          onClose={() => {
            setPendingAction(null);
            setReason("");
            setActionError(null);
          }}
          actions={
            <>
              <Button
                variant="text"
                disabled={actionBusy}
                onClick={() => {
                  setPendingAction(null);
                  setReason("");
                  setActionError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant={pendingAction.destructive ? "destructive" : "filled"}
                loading={actionBusy}
                loadingLabel="Applying…"
                disabled={actionBusy || reason.trim().length < 10}
                onClick={() => void confirmAction()}
              >
                {pendingAction.confirmLabel}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            {actionError && (
              <InlineAlert tone="error" urgent onDismiss={() => setActionError(null)}>
                {actionError}
              </InlineAlert>
            )}
            <TextField
              label="Operational reason"
              value={reason}
              maxLength={240}
              hint={REASON_HINT}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </Dialog>
      )}
    </div>
  );
}

export default AdminPage;
