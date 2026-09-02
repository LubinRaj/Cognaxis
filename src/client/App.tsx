import { Suspense, lazy, useState } from "react";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { AuthLoading } from "./components/auth/AuthLoading";
import { AuthSurfaceBoundary } from "./components/auth/AuthSurfaceBoundary";
import { ConfigurationRequired } from "./components/ConfigurationRequired";
import { LandingPage } from "./components/LandingPage";
import { WorkspaceShell } from "./components/workspace/WorkspaceShell";

// FirebaseUI and every authentication screen load only for the unauthenticated surface. The
// authenticated workspace never pulls the credential form code into its bundle.
const AuthSurface = lazy(() => import("./components/auth/AuthSurface"));
const AuthActionRoute = lazy(() => import("./components/auth-action/AuthActionRoute"));

export const AUTH_ACTION_PATH = "/auth/action";

function AppRoutes() {
  const { state, user, bootstrapStalled, retryBootstrap, send } = useAuth();

  if (state === "CONFIGURATION_MISSING") return <ConfigurationRequired />;

  if (state === "BOOTSTRAPPING") {
    return <AuthLoading stalled={bootstrapStalled} onRetry={retryBootstrap} />;
  }

  if (state === "AUTHENTICATED" && user) {
    return <WorkspaceShell key={user.uid} user={user} />;
  }

  if (state === "SIGNED_OUT_LANDING") {
    return <LandingPage onOpenAuth={() => send({ type: "OPEN_SIGN_IN" })} />;
  }

  return (
    <AuthSurfaceBoundary>
      <Suspense fallback={<AuthLoading />}>
        <AuthSurface />
      </Suspense>
    </AuthSurfaceBoundary>
  );
}

export function App() {
  // The email-action handler is a public, state-driven page rather than a routed application view,
  // so it is selected once from the entry path and never re-entered from in-app navigation.
  const [isActionRoute, setIsActionRoute] = useState(
    () => typeof window !== "undefined" && window.location.pathname === AUTH_ACTION_PATH,
  );

  if (isActionRoute) {
    return (
      <AuthSurfaceBoundary>
        <Suspense fallback={<AuthLoading />}>
          <AuthActionRoute
            onReturnToApp={(destination) => {
              window.history.replaceState(null, "", destination ?? "/");
              setIsActionRoute(false);
            }}
          />
        </Suspense>
      </AuthSurfaceBoundary>
    );
  }

  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
