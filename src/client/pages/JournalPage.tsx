import { useLocation, useOutletContext } from "react-router-dom";
import type { User } from "firebase/auth";
import { WorkspaceShell } from "../components/workspace/WorkspaceShell";

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function JournalPage() {
  const user = useOutletContext<User>();
  const location = useLocation();
  const { initialSessionId } = (() => {
    const params = new URLSearchParams(location.search);
    const requested = params.get("session");
    return {
      initialSessionId: requested !== null && SESSION_ID_PATTERN.test(requested) ? requested : undefined,
    };
  })();
  const navigationScope = (location.state as { organizationId?: unknown } | null)?.organizationId;
  const initialOrganizationId = typeof navigationScope === "string" && SESSION_ID_PATTERN.test(navigationScope)
    ? navigationScope
    : undefined;

  return <WorkspaceShell user={user} initialSessionId={initialSessionId} initialOrganizationId={initialOrganizationId} />;
}

export default JournalPage;
