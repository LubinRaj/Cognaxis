import { useEffect, useRef, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import type { User } from "firebase/auth";
import type { UserOrganizationEdge } from "../../shared/schemas";
import { ApiError } from "../lib/api-client";
import { useApiClient } from "../lib/use-api-client";
import { Button } from "../components/ui/Button";
import { Chip } from "../components/ui/Chip";
import { Dialog } from "../components/ui/Dialog";
import { EmptyState } from "../components/ui/EmptyState";
import { InlineAlert } from "../components/ui/InlineAlert";
import { Skeleton } from "../components/ui/Skeleton";
import { TextField } from "../components/ui/TextField";
import { usePageTitle } from "../shell/use-page-title";

type LoadStatus = "loading" | "ready" | "error";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export function OrganizationsPage() {
  const user = useOutletContext<User>();
  const navigate = useNavigate();
  const api = useApiClient(user);
  usePageTitle("Teams · Cognaxis");

  const [organizations, setOrganizations] = useState<UserOrganizationEdge[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [reflectionCounts, setReflectionCounts] = useState<Record<string, number | null>>({});
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestRef.current;
    api
      .listOrganizations()
      .then((loaded) => {
        if (requestRef.current !== requestId) return;
        setOrganizations(loaded);
        setStatus("ready");
        void Promise.all(
          loaded.filter((edge) => edge.status === "active").map(async (edge) => {
            try {
              const sessions = await api.listOrganizationSessions(edge.orgId);
              return [edge.orgId, sessions.length] as const;
            } catch {
              return [edge.orgId, null] as const;
            }
          }),
        ).then((entries) => {
          if (requestRef.current === requestId) setReflectionCounts(Object.fromEntries(entries));
        });
      })
      .catch((error: unknown) => {
        if (requestRef.current !== requestId) return;
        setStatus("error");
        setErrorMessage(
          error instanceof ApiError ? error.message : "Your organizations could not be loaded.",
        );
      });
    return () => {
      requestRef.current += 1;
    };
  }, [api, reloadToken]);

  async function create() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setCreateError("Give the organization a name of at least two characters.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const detail = await api.createOrganization({
        name: trimmed,
        description: description.trim() === "" ? null : description.trim(),
      });
      setCreateOpen(false);
      void navigate(`/app/organizations/${encodeURIComponent(detail.organization.id)}`);
    } catch (error) {
      setCreateError(
        error instanceof ApiError
          ? error.message
          : "The organization could not be created. Please try again.",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[860px] px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-on-surface text-2xl font-medium">Teams</h1>
            <p className="text-on-surface-variant mt-1 text-sm">
              Shared intelligence spaces, kept fully separate from your personal captures.
            </p>
          </div>
          <Button icon="add" onClick={() => setCreateOpen(true)} className="max-sm:w-full">
            New team
          </Button>
        </header>

        {status === "loading" ? (
          <div className="mt-6 space-y-3" role="status" aria-label="Loading organizations">
            <Skeleton className="h-20 rounded-card" />
            <Skeleton className="h-20 rounded-card" />
          </div>
        ) : status === "error" ? (
          <div className="mt-10">
            <EmptyState
              icon="refresh"
              title="Your teams could not be loaded"
              description={errorMessage ?? "Check your connection and try again in a moment."}
              actions={
                <Button icon="refresh" onClick={() => setReloadToken((token) => token + 1)}>
                  Try again
                </Button>
              }
            />
          </div>
        ) : organizations.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              icon="groups"
              title="No teams yet"
              description="Create a shared team space, or accept an invitation link from someone who already has one."
              actions={
                <Button icon="add" onClick={() => setCreateOpen(true)}>
                  New team
                </Button>
              }
            />
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {organizations.map((edge) => {
              const reflectionCount = reflectionCounts[edge.orgId];
              return (
                <li key={edge.orgId}>
                  <button
                    type="button"
                    onClick={() => void navigate(`/app/organizations/${encodeURIComponent(edge.orgId)}`)}
                    className="border-outline-variant bg-surface-container-low hover:bg-surface-container focus-visible:outline-focus-ring block w-full rounded-card border p-4 text-left motion-safe:transition-colors motion-safe:duration-feedback focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-on-surface min-w-0 truncate text-base font-medium">
                      {edge.organizationName}
                    </span>
                    <Chip tone={edge.status === "active" ? "primary" : "warning"}>
                      {edge.status === "active"
                        ? (ROLE_LABELS[edge.role] ?? edge.role)
                        : "Suspended"}
                    </Chip>
                  </span>
                  <span className="text-on-surface-variant mt-1 block text-xs">
                    Joined{" "}
                    {new Date(edge.joinedAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  {edge.status === "active" && (
                    <span className="text-on-surface-variant mt-2 block text-xs">
                      {reflectionCount === undefined
                        ? "Loading shared reflections…"
                        : reflectionCount === null
                          ? "Shared reflections unavailable"
                          : reflectionCount > 0
                        ? `${reflectionCount} shared reflection${reflectionCount === 1 ? "" : "s"}`
                        : "No shared reflections yet"}
                    </span>
                  )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {createOpen && (
        <Dialog
          open
          title="New team"
          description="Everything captured in a team is visible to its active members. Your personal captures stay separate."
          onClose={() => {
            if (!creating) setCreateOpen(false);
          }}
          busy={creating}
          actions={
            <>
              <Button variant="text" onClick={() => setCreateOpen(false)} disabled={creating}>
                Cancel
              </Button>
              <Button
                onClick={() => void create()}
                loading={creating}
                loadingLabel="Creating…"
                disabled={creating}
              >
                Create team
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {createError && (
              <InlineAlert tone="error" urgent onDismiss={() => setCreateError(null)}>
                {createError}
              </InlineAlert>
            )}
            <TextField
              label="Name"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              placeholder="For example, Product research group"
            />
            <TextField
              label="Description (optional)"
              value={description}
              maxLength={300}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this shared space is for"
            />
          </div>
        </Dialog>
      )}
    </div>
  );
}

export default OrganizationsPage;
