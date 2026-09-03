import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import type { User } from "firebase/auth";
import { useAuth } from "../auth/AuthProvider";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { Skeleton } from "../components/ui/Skeleton";
import { BottomNav, NavRail } from "./AppNav";
import { CapabilitiesProvider, useCapabilities } from "./capabilities-context";

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
  const { state } = useCapabilities();

  if (state.status === "suspended") {
    return <SuspendedScreen />;
  }

  return (
    <div className="bg-surface text-on-surface flex h-dvh min-h-0 w-full flex-col overflow-hidden font-sans md:flex-row">
      <NavRail />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Suspense fallback={<PageLoading />}>
          <Outlet context={user} />
        </Suspense>
      </div>
      <BottomNav />
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
