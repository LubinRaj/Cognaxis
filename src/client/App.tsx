import { Suspense, lazy } from "react";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { AuthLoading } from "./components/auth/AuthLoading";
import { AuthSurfaceBoundary } from "./components/auth/AuthSurfaceBoundary";
import { ConfigurationRequired } from "./components/ConfigurationRequired";
import { JournalWorkspace } from "./components/JournalWorkspace";
import { LandingPage } from "./components/LandingPage";

// FirebaseUI and every authentication screen load only for the unauthenticated surface. The
// authenticated workspace never pulls the credential form code into its bundle.
const AuthSurface = lazy(() => import("./components/auth/AuthSurface"));

function AppRoutes() {
  const { state, user, bootstrapStalled, retryBootstrap, send } = useAuth();

  if (state === "CONFIGURATION_MISSING") return <ConfigurationRequired />;

  if (state === "BOOTSTRAPPING") {
    return <AuthLoading stalled={bootstrapStalled} onRetry={retryBootstrap} />;
  }

  if (state === "AUTHENTICATED" && user) {
    return <JournalWorkspace key={user.uid} user={user} />;
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
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
