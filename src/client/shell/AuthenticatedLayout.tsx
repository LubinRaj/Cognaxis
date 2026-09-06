import { Suspense, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import type { User } from "firebase/auth";
import { useAuth } from "../auth/AuthProvider";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { Skeleton } from "../components/ui/Skeleton";
import { BottomNav, NavRail } from "./AppNav";
import { CapabilitiesProvider, useCapabilities } from "./capabilities-context";
import { useApiClient } from "../lib/use-api-client";
import { ApiError } from "../lib/api-client";
import { InlineAlert } from "../components/ui/InlineAlert";
import {
  readRecentTeamScope,
  rememberWorkspaceScope,
} from "../workspace/workspace-scope";

function PageLoading() {
  return (
    <div
      role="status"
      aria-label="Loading page"
      className="mx-auto w-full max-w-[980px] space-y-4 px-4 py-6 sm:px-6"
    >
      <Skeleton className="h-8 w-48 rounded-control" />
      <Skeleton className="h-40 rounded-card" />
      <Skeleton className="h-40 rounded-card" />
    </div>
  );
}

function SuspendedScreen() {
  const { signOutAndReset, isSigningOut } = useAuth();

  return (
    <div className="bg-surface text-on-surface flex min-h-dvh items-center justify-center p-6">
      <EmptyState
        icon="lock"
        title="This account is suspended"
        description="Your Cognaxis account is currently suspended and cannot be used. Your reflections have not been deleted. If you believe this is a mistake, contact the person who operates your Cognaxis deployment."
        actions={
          <Button variant="outlined" icon="logout" loading={isSigningOut} onClick={() => void signOutAndReset()}>
            Sign out
          </Button>
        }
      />
    </div>
  );
}

function LayoutFrame({ user }: { user: User }) {
  const { signOutAndReset, isSigningOut } = useAuth();
  const { state } = useCapabilities();
  const api = useApiClient(user);
  const navigate = useNavigate();
  const location = useLocation();
  const [creatingReflection, setCreatingReflection] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const hasPageSpecificCreation = location.pathname === "/app/journal";

  async function startReflection() {
    if (creatingReflection) return;
    setCreatingReflection(true);
    setCreationError(null);
    try {
      const organizationMatch = location.pathname.match(/^\/app\/organizations\/([^/]+)$/);
      const currentTeamId = organizationMatch?.[1]
        ? decodeURIComponent(organizationMatch[1])
        : readRecentTeamScope(user.uid);
      if (currentTeamId) {
        const organizations = await api.listOrganizations();
        const team = organizations.find(
          (edge) =>
            edge.orgId === currentTeamId && edge.status === "active" && edge.role !== "viewer",
        );
        if (team) {
          rememberWorkspaceScope(user.uid, team.orgId);
          void navigate("/app/journal", { state: { organizationId: team.orgId } });
          return;
        }
      }

      rememberWorkspaceScope(user.uid, null);
      void navigate("/app/journal");
    } catch (error) {
      setCreationError(
        error instanceof ApiError
          ? error.message
          : "A new reflection could not be started. Please try again.",
      );
    } finally {
      setCreatingReflection(false);
    }
  }

  if (state.status === "suspended") {
    return <SuspendedScreen />;
  }

  return (
    <div className="app-shell bg-surface text-on-surface flex h-dvh min-h-0 w-full flex-col overflow-hidden font-sans md:flex-row">
      <NavRail
        user={user}
        onSignOut={() => void signOutAndReset()}
        signingOut={isSigningOut}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Suspense fallback={<PageLoading />}>
          <Outlet context={user} />
        </Suspense>
      </div>
      <BottomNav
        user={user}
        onSignOut={() => void signOutAndReset()}
        signingOut={isSigningOut}
      />
      {!hasPageSpecificCreation && (
        <Button
          icon="add"
          aria-label="New reflection"
          className="app-new-reflection-action fixed right-4 z-30 h-14 w-14 gap-0 p-0 leading-none shadow-lg sm:h-11 sm:w-auto sm:gap-2 sm:px-4 md:right-6 md:bottom-6"
          loading={creatingReflection}
          loadingLabel="Starting…"
          onClick={() => void startReflection()}
        >
          <span className="hidden sm:inline">New reflection</span>
        </Button>
      )}
      {creationError && (
        <div className="fixed right-4 bottom-[9rem] z-40 w-[min(24rem,calc(100vw-2rem))] md:right-6 md:bottom-20">
          <InlineAlert tone="error" onDismiss={() => setCreationError(null)}>
            {creationError}
          </InlineAlert>
        </div>
      )}
    </div>
  );
}

export function AuthenticatedLayout({ user }: { user: User }) {
  return (
    <CapabilitiesProvider user={user}>
      <LayoutFrame user={user} />
    </CapabilitiesProvider>
  );
}
