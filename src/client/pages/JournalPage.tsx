import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { User } from "firebase/auth";
import { WorkspaceShell } from "../components/workspace/WorkspaceShell";

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function JournalPage() {
  const user = useOutletContext<User>();

  // The deep-linked reflection is captured once on mount; later in-app selection changes are
  // owned by the workspace controller, not the URL.
  const [initialSessionId] = useState<string | undefined>(() => {
    const requested = new URLSearchParams(window.location.search).get("session");
    return requested !== null && SESSION_ID_PATTERN.test(requested) ? requested : undefined;
  });

  return <WorkspaceShell user={user} initialSessionId={initialSessionId} />;
}

export default JournalPage;
