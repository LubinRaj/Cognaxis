import { useEffect, useRef, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import type { User } from "firebase/auth";
import type { OrganizationDetail, OrganizationMemberView } from "../../shared/schemas";
import { ApiError } from "../lib/api-client";
import { useApiClient } from "../lib/use-api-client";
import { OrgConversation } from "../components/organization/OrgConversation";
import { OrgInvitesTab } from "../components/organization/OrgInvitesTab";
import { OrgMembersTab } from "../components/organization/OrgMembersTab";
import { Button } from "../components/ui/Button";
import { Chip } from "../components/ui/Chip";
import { EmptyState } from "../components/ui/EmptyState";
import { InlineAlert } from "../components/ui/InlineAlert";
import { Skeleton } from "../components/ui/Skeleton";
import { Tabs } from "../components/ui/Tabs";
import { TextField } from "../components/ui/TextField";
import { usePageTitle } from "../shell/use-page-title";

type LoadStatus = "loading" | "ready" | "error" | "suspended";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

function SettingsTab({
  detail,
  onSave,
  saving,
  errorMessage,
  onDismissError,
}: {
  detail: OrganizationDetail;
  onSave: (name: string, description: string) => void;
  saving: boolean;
  errorMessage: string | null;
  onDismissError: () => void;
}) {
  const [name, setName] = useState(detail.organization.name);
  const [description, setDescription] = useState(detail.organization.description ?? "");

  return (
    <div className="max-w-xl space-y-4">
      {errorMessage && (
        <InlineAlert tone="error" urgent onDismiss={onDismissError}>
          {errorMessage}
        </InlineAlert>
      )}
      <TextField
        label="Organization name"
        value={name}
        maxLength={80}
        onChange={(event) => setName(event.target.value)}
      />
      <TextField
        label="Description"
        value={description}
        maxLength={300}
        onChange={(event) => setDescription(event.target.value)}
      />
      <Button
        onClick={() => onSave(name, description)}
        loading={saving}
        loadingLabel="Saving…"
        disabled={name.trim().length < 2}
      >
        Save settings
      </Button>
    </div>
  );
}

export function OrganizationWorkspacePage() {
  const user = useOutletContext<User>();
  const { orgId: routeOrganizationId = "" } = useParams();
  const orgId = routeOrganizationId;
  const navigate = useNavigate();
  const api = useApiClient(user);

  const [detail, setDetail] = useState<OrganizationDetail | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [members, setMembers] = useState<OrganizationMemberView[]>([]);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState("reflections");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const requestRef = useRef(0);

  usePageTitle(
    detail ? `${detail.organization.name} · Cognaxis` : "Organization · Cognaxis",
  );

  useEffect(() => {
    const requestId = ++requestRef.current;
    api
      .getOrganization(orgId)
      .then(async (loaded) => {
        if (requestRef.current !== requestId) return;
        setDetail(loaded);
        setStatus("ready");
        try {
          const loadedMembers = await api.listOrganizationMembers(orgId);
          if (requestRef.current !== requestId) return;
          setMembers(loadedMembers);
        } finally {
          if (requestRef.current === requestId) setMembersLoaded(true);
        }
      })
      .catch((error: unknown) => {
        if (requestRef.current !== requestId) return;
        if (error instanceof ApiError && error.code === "ORGANIZATION_SUSPENDED") {
          setStatus("suspended");
          return;
        }
        setStatus("error");
        setErrorMessage(
          error instanceof ApiError ? error.message : "This organization could not be opened.",
        );
      });
    return () => {
      requestRef.current += 1;
    };
  }, [api, orgId, reloadToken]);

  function saveSettings(name: string, description: string) {
    setSettingsSaving(true);
    setSettingsError(null);
    api
      .updateOrganization(orgId, {
        name: name.trim(),
        description: description.trim() === "" ? null : description.trim(),
      })
      .then((organization) => {
        setDetail((current) => (current ? { ...current, organization } : current));
      })
      .catch((error: unknown) => {
        setSettingsError(
          error instanceof ApiError ? error.message : "Settings could not be saved.",
        );
      })
      .finally(() => setSettingsSaving(false));
  }

  if (status === "loading") {
    return (
      <div className="mx-auto w-full max-w-[980px] flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div role="status" aria-label="Loading organization" className="space-y-4">
          <Skeleton className="h-8 w-60 rounded-control" />
          <Skeleton className="h-40 rounded-card" />
        </div>
      </div>
    );
  }

  if (status === "suspended") {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <EmptyState
          icon="lock"
          title="This organization is suspended"
          description="Its workspace is unavailable right now. Your private journal is not affected."
          actions={
            <Button variant="outlined" onClick={() => void navigate("/app/organizations")}>
              Back to organizations
            </Button>
          }
        />
      </div>
    );
  }

  if (status === "error" || detail === null) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <EmptyState
          icon="refresh"
          title="This organization could not be opened"
          description={errorMessage ?? "It may not exist, or you may not be a member."}
          actions={
            <>
              <Button variant="outlined" onClick={() => void navigate("/app/organizations")}>
                Back to organizations
              </Button>
              <Button icon="refresh" onClick={() => setReloadToken((token) => token + 1)}>
                Try again
              </Button>
            </>
          }
        />
      </div>
    );
  }

  const tabs = [
    { id: "reflections", label: "Reflections" },
    { id: "members", label: `Members (${detail.organization.memberCount})` },
    ...(detail.permissions.canViewInvites ? [{ id: "invites", label: "Invites" }] : []),
    ...(detail.permissions.canUpdateSettings ? [{ id: "settings", label: "Settings" }] : []),
  ];

  const memberNames = new Map(
    members
      .filter((member) => member.displayName !== null || member.email !== null)
      .map((member) => [member.uid, member.displayName ?? member.email ?? ""]),
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[980px] px-4 py-6 sm:px-6">
        <header>
          <p className="sr-only">Organization workspace</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-on-surface text-2xl font-medium">
              {detail.organization.name}
            </h1>
            <Chip tone="primary">{ROLE_LABELS[detail.role] ?? detail.role}</Chip>
          </div>
          {detail.organization.description && (
            <p className="text-on-surface-variant mt-1 text-sm">
              {detail.organization.description}
            </p>
          )}
          <p className="text-on-surface-variant mt-1 text-xs">
            Shared with all active members. This space is separate from your private journal.
          </p>
        </header>

        <div className="mt-5">
          <Tabs
            label={`${detail.organization.name} sections`}
            tabs={tabs}
            activeId={tabs.some((tab) => tab.id === activeTab) ? activeTab : "reflections"}
            onChange={setActiveTab}
          >
            {activeTab === "members" ? (
              <OrgMembersTab
                api={api}
                orgId={orgId}
                currentUid={user.uid}
                permissions={detail.permissions}
                members={members}
                membersLoaded={membersLoaded}
                onMembersChanged={setMembers}
              />
            ) : activeTab === "invites" && detail.permissions.canViewInvites ? (
              <OrgInvitesTab api={api} orgId={orgId} permissions={detail.permissions} />
            ) : activeTab === "settings" && detail.permissions.canUpdateSettings ? (
              <>
                <SettingsTab
                  detail={detail}
                  onSave={saveSettings}
                  saving={settingsSaving}
                  errorMessage={settingsError}
                  onDismissError={() => setSettingsError(null)}
                />
              </>
            ) : (
              <OrgConversation
                api={api}
                orgId={orgId}
                currentUid={user.uid}
                permissions={detail.permissions}
                memberNames={memberNames}
              />
            )}
          </Tabs>
        </div>
      </div>
    </div>
  );
}

export default OrganizationWorkspacePage;
