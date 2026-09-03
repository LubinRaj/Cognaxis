import { useEffect, useRef, useState } from "react";
import type { OrganizationMemberView, OrganizationPermissions } from "../../../shared/schemas";
import type { ApiClient } from "../../lib/api-client";
import { ApiError } from "../../lib/api-client";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { Dialog } from "../ui/Dialog";
import { InlineAlert } from "../ui/InlineAlert";
import { Menu } from "../ui/Menu";
import { Skeleton } from "../ui/Skeleton";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

type Props = {
  api: ApiClient;
  orgId: string;
  currentUid: string;
  permissions: OrganizationPermissions;
  members: OrganizationMemberView[];
  onMembersChanged: (members: OrganizationMemberView[]) => void;
  membersLoaded: boolean;
};

export function OrgMembersTab({
  api,
  orgId,
  currentUid,
  permissions,
  members,
  onMembersChanged,
  membersLoaded,
}: Props) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState<OrganizationMemberView | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function changeMember(
    target: OrganizationMemberView,
    input: { role?: "admin" | "member" | "viewer"; status?: "active" | "suspended" },
    message: string,
  ) {
    setBusyUid(target.uid);
    setErrorMessage(null);
    try {
      const updated = await api.updateOrganizationMember(orgId, target.uid, input);
      if (!mounted.current) return;
      onMembersChanged(members.map((member) => (member.uid === target.uid ? updated : member)));
      setAnnouncement(message);
    } catch (error) {
      if (!mounted.current) return;
      setErrorMessage(
        error instanceof ApiError ? error.message : "The change could not be applied.",
      );
    } finally {
      if (mounted.current) setBusyUid(null);
    }
  }

  async function confirmRemoval() {
    if (!pendingRemoval) return;
    setBusyUid(pendingRemoval.uid);
    setErrorMessage(null);
    try {
      await api.removeOrganizationMember(orgId, pendingRemoval.uid);
      if (!mounted.current) return;
      onMembersChanged(members.filter((member) => member.uid !== pendingRemoval.uid));
      setAnnouncement("Member removed.");
      setPendingRemoval(null);
    } catch (error) {
      if (!mounted.current) return;
      setErrorMessage(
        error instanceof ApiError ? error.message : "The member could not be removed.",
      );
      setPendingRemoval(null);
    } finally {
      if (mounted.current) setBusyUid(null);
    }
  }

  if (!membersLoaded) {
    return (
      <div className="space-y-2" role="status" aria-label="Loading members">
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

      <ul className="space-y-2">
        {members.map((member) => {
          const name = member.displayName ?? member.email ?? "A member";
          const canGovern =
            permissions.canManageMembers && member.uid !== currentUid && member.role !== "owner";
          return (
            <li
              key={member.uid}
              className="border-outline-variant bg-surface-container-low flex items-center gap-3 rounded-card border p-3"
            >
              <Avatar displayName={member.displayName} email={member.email} />
              <div className="min-w-0 flex-1">
                <p className="text-on-surface truncate text-sm font-medium">{name}</p>
                {member.email && (
                  <p className="text-on-surface-variant truncate text-xs">{member.email}</p>
                )}
              </div>
              <Chip tone={member.status === "active" ? "neutral" : "warning"}>
                {member.status === "active"
                  ? (ROLE_LABELS[member.role] ?? member.role)
                  : "Suspended"}
              </Chip>
              {canGovern && (
                <Menu
                  label={`Manage ${name}`}
                  items={[
                    {
                      id: "make-admin",
                      label: "Make admin",
                      disabled: member.role === "admin" || busyUid !== null,
                      onSelect: () =>
                        void changeMember(member, { role: "admin" }, "Role updated."),
                    },
                    {
                      id: "make-member",
                      label: "Make member",
                      disabled: member.role === "member" || busyUid !== null,
                      onSelect: () =>
                        void changeMember(member, { role: "member" }, "Role updated."),
                    },
                    {
                      id: "make-viewer",
                      label: "Make viewer",
                      disabled: member.role === "viewer" || busyUid !== null,
                      onSelect: () =>
                        void changeMember(member, { role: "viewer" }, "Role updated."),
                    },
                    {
                      id: "toggle-status",
                      label: member.status === "active" ? "Suspend in this organization" : "Restore access",
                      separated: true,
                      disabled: busyUid !== null,
                      onSelect: () =>
                        void changeMember(
                          member,
                          { status: member.status === "active" ? "suspended" : "active" },
                          member.status === "active" ? "Member suspended." : "Member restored.",
                        ),
                    },
                    {
                      id: "remove",
                      label: "Remove from organization",
                      tone: "destructive",
                      disabled: busyUid !== null,
                      onSelect: () => setPendingRemoval(member),
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

      {pendingRemoval && (
        <Dialog
          open
          tone="destructive"
          title="Remove this member?"
          description={`${pendingRemoval.displayName ?? pendingRemoval.email ?? "This member"} will immediately lose access to this organization. Shared reflections they wrote stay with the organization.`}
          onClose={() => setPendingRemoval(null)}
          busy={busyUid !== null}
          actions={
            <>
              <Button variant="text" onClick={() => setPendingRemoval(null)} disabled={busyUid !== null}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => void confirmRemoval()}
                loading={busyUid !== null}
                loadingLabel="Removing…"
              >
                Remove member
              </Button>
            </>
          }
        />
      )}
    </div>
  );
}
