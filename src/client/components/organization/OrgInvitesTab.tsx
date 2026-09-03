import { useEffect, useRef, useState } from "react";
import type { OrganizationInvite, OrganizationPermissions } from "../../../shared/schemas";
import type { ApiClient } from "../../lib/api-client";
import { ApiError } from "../../lib/api-client";
import { buildJoinLink } from "../../organizations/invite-links";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { InlineAlert } from "../ui/InlineAlert";
import { Skeleton } from "../ui/Skeleton";

type SafeInvite = Omit<OrganizationInvite, "tokenHash">;

type Props = {
  api: ApiClient;
  orgId: string;
  permissions: OrganizationPermissions;
};

type LoadStatus = "loading" | "ready" | "error";

const STATUS_TONES: Record<SafeInvite["status"], "neutral" | "success" | "warning"> = {
  pending: "neutral",
  accepted: "success",
  revoked: "warning",
  expired: "warning",
};

export function OrgInvitesTab({ api, orgId, permissions }: Props) {
  const [invites, setInvites] = useState<SafeInvite[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "member" | "viewer">("member");
  const [creating, setCreating] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busyInvite, setBusyInvite] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestRef.current;
    api
      .listOrganizationInvites(orgId)
      .then((loaded) => {
        if (requestRef.current !== requestId) return;
        setInvites(loaded);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (requestRef.current !== requestId) return;
        setStatus("error");
        setErrorMessage(
          error instanceof ApiError ? error.message : "Invitations could not be loaded.",
        );
      });
    return () => {
      requestRef.current += 1;
    };
  }, [api, orgId, reloadToken]);

  async function create() {
    setCreating(true);
    setErrorMessage(null);
    setCreatedLink(null);
    setCopied(false);
    try {
      const invite = await api.createOrganizationInvite(orgId, role);
      setCreatedLink(buildJoinLink(window.location.origin, orgId, invite.inviteId, invite.secret));
      setAnnouncement("Invitation link created. It is shown exactly once.");
      setReloadToken((token) => token + 1);
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : "The invitation could not be created.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function copyLink() {
    if (!createdLink) return;
    try {
      await navigator.clipboard.writeText(createdLink);
      setCopied(true);
      setAnnouncement("Invitation link copied.");
    } catch {
      setErrorMessage("The link could not be copied. Select it manually.");
    }
  }

  async function revoke(inviteId: string) {
    setBusyInvite(inviteId);
    setErrorMessage(null);
    try {
      await api.revokeOrganizationInvite(orgId, inviteId);
      setInvites((current) =>
        current.map((invite) =>
          invite.id === inviteId ? { ...invite, status: "revoked" as const } : invite,
        ),
      );
      setAnnouncement("Invitation revoked.");
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : "The invitation could not be revoked.",
      );
    } finally {
      setBusyInvite(null);
    }
  }

  if (status === "loading") {
    return (
      <div className="space-y-2" role="status" aria-label="Loading invitations">
        <Skeleton className="h-14 rounded-card" />
        <Skeleton className="h-14 rounded-card" />
      </div>
    );
  }

  return (
    <div>
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
      {errorMessage && (
        <div className="mb-3">
          <InlineAlert tone="error" urgent onDismiss={() => setErrorMessage(null)}>
            {errorMessage}
          </InlineAlert>
        </div>
      )}

      <section
        aria-label="Create invitation"
        className="border-outline-variant bg-surface-container-low rounded-card border p-4"
      >
        <h3 className="text-on-surface text-sm font-medium">Invite someone</h3>
        <p className="text-on-surface-variant mt-1 text-sm">
          An invitation is a one-time link that expires after seven days. Share it privately.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="invite-role" className="text-on-surface text-sm font-medium">
            Role
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(event) => setRole(event.target.value as "admin" | "member" | "viewer")}
            className="border-outline-variant bg-surface text-on-surface focus-visible:outline-focus-ring min-h-10 rounded-field border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <option value="member">Member — can write and reflect</option>
            <option value="viewer">Viewer — can read only</option>
            {permissions.canInviteAdmin && <option value="admin">Admin — can manage members</option>}
          </select>
          <Button
            size="compact"
            icon="person_add"
            onClick={() => void create()}
            loading={creating}
            loadingLabel="Creating…"
          >
            Create invitation link
          </Button>
        </div>

        {createdLink && (
          <div className="border-outline-variant bg-surface mt-3 rounded-field border p-3">
            <p className="text-on-surface-variant text-xs font-medium">
              Copy this link now — for safety it will not be shown again.
            </p>
            <p className="text-on-surface mt-1 text-xs break-all" data-testid="invite-link">
              {createdLink}
            </p>
            <div className="mt-2">
              <Button size="compact" variant="outlined" onClick={() => void copyLink()}>
                {copied ? "Copied" : "Copy link"}
              </Button>
            </div>
          </div>
        )}
      </section>

      <h3 className="text-on-surface mt-6 text-sm font-medium">Recent invitations</h3>
      {invites.length === 0 ? (
        <p className="text-on-surface-variant mt-2 text-sm">No invitations yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {invites.map((invite) => (
            <li
              key={invite.id}
              className="border-outline-variant bg-surface-container-low flex items-center gap-3 rounded-card border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-on-surface text-sm font-medium">
                  {invite.role === "admin" ? "Admin" : invite.role === "member" ? "Member" : "Viewer"}{" "}
                  invitation
                </p>
                <p className="text-on-surface-variant text-xs">
                  Expires{" "}
                  {new Date(invite.expiresAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
              <Chip tone={STATUS_TONES[invite.status]}>{invite.status}</Chip>
              {invite.status === "pending" && (
                <Button
                  size="compact"
                  variant="text"
                  className="text-error hover:bg-error-container/40"
                  onClick={() => void revoke(invite.id)}
                  loading={busyInvite === invite.id}
                  loadingLabel="Revoking…"
                >
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
