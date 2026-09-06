import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import type { UserOrganizationEdge } from "../../../shared/schemas";
import { useApiClient } from "../../lib/use-api-client";

type Props = {
  user: User;
  currentOrganizationId?: string | null;
  onScopeChange: (organizationId: string | null) => void;
};

function newestFirst(a: UserOrganizationEdge, b: UserOrganizationEdge): number {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}

/**
 * Changes workspace context without ever changing the visibility of an existing reflection.
 * Personal and team reflections remain separate server-authorized resources.
 */
export function WorkspaceScopeSelector({
  user,
  currentOrganizationId,
  onScopeChange,
}: Props) {
  const api = useApiClient(user);
  const [organizations, setOrganizations] = useState<UserOrganizationEdge[]>([]);
  const [loaded, setLoaded] = useState(false);

  const activeOrganizations = useMemo(
    () => organizations.filter((edge) => edge.status === "active").sort(newestFirst),
    [organizations],
  );

  useEffect(() => {
    let active = true;
    void api
      .listOrganizations()
      .then((result) => {
        if (!active) return;
        setOrganizations(result ?? []);
        setLoaded(true);
      })
      .catch(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [api]);

  const value = currentOrganizationId ? `team:${currentOrganizationId}` : "personal";

  function changeScope(selected: string) {
    if (selected === "personal") {
      onScopeChange(null);
      return;
    }
    const organizationId = selected.slice("team:".length);
    if (!activeOrganizations.some((edge) => edge.orgId === organizationId)) return;
    onScopeChange(organizationId);
  }

  return (
    <>
      {/* Phone labels deliberately stay short so the workspace control never crowds its actions. */}
      <select
        aria-label="Reflection space"
        value={value}
        disabled={!loaded}
        onChange={(event) => changeScope(event.target.value)}
        className="border-outline-variant bg-surface-container-low text-on-surface focus-visible:outline-focus-ring min-h-10 w-full min-w-0 rounded-control border px-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 sm:hidden"
      >
        <option value="personal">Personal</option>
        {activeOrganizations.map((organization) => (
          <option key={organization.orgId} value={`team:${organization.orgId}`}>
            {organization.organizationName}
          </option>
        ))}
      </select>
      <select
        aria-label="Reflection space"
        value={value}
        disabled={!loaded}
        onChange={(event) => changeScope(event.target.value)}
        className="border-outline-variant bg-surface-container-low text-on-surface focus-visible:outline-focus-ring hidden min-h-10 max-w-[min(22rem,62vw)] rounded-control border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 sm:block"
      >
        <option value="personal">Personal · only you</option>
        {activeOrganizations.map((organization) => (
          <option key={organization.orgId} value={`team:${organization.orgId}`}>
            {organization.organizationName} · team
          </option>
        ))}
      </select>
    </>
  );
}
