import { Suspense, lazy, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { AuthLoading } from "./components/auth/AuthLoading";
import { AuthSurfaceBoundary } from "./components/auth/AuthSurfaceBoundary";
import { ConfigurationRequired } from "./components/ConfigurationRequired";
import { LandingPage } from "./components/LandingPage";
import { JournalPage } from "./pages/JournalPage";
import { AuthenticatedLayout } from "./shell/AuthenticatedLayout";
import { hasPendingInvite } from "./organizations/invite-links";
import { consumeIntendedPath, rememberIntendedPath } from "./shell/post-auth-redirect";

// FirebaseUI and every authentication screen load only for the unauthenticated surface. The
// authenticated workspace never pulls the credential form code into its bundle.
const AuthSurface = lazy(() => import("./components/auth/AuthSurface"));
const AuthActionRoute = lazy(() => import("./components/auth-action/AuthActionRoute"));

// Feature pages load on demand so the core journal stays fast.
const InsightsPage = lazy(() => import("./pages/InsightsPage"));
const AskMePage = lazy(() => import("./pages/AskMePage"));
const MapPage = lazy(() => import("./pages/MapPage"));
const ArchivesPage = lazy(() => import("./pages/ArchivesPage"));
const OrganizationsPage = lazy(() => import("./pages/OrganizationsPage"));
const OrganizationWorkspacePage = lazy(() => import("./pages/OrganizationWorkspacePage"));
const JoinPage = lazy(() => import("./pages/JoinPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));

export const AUTH_ACTION_PATH = "/auth/action";

function RootRoute() {
  const { state, user, bootstrapStalled, retryBootstrap, send } = useAuth();

  if (state === "CONFIGURATION_MISSING") return <ConfigurationRequired />;

  if (state === "BOOTSTRAPPING") {
    return <AuthLoading stalled={bootstrapStalled} onRetry={retryBootstrap} />;
  }

  if (state === "AUTHENTICATED" && user) {
    // A parked invitation takes priority so the recipient lands back on the join screen after
    // signing in; otherwise the remembered deep link or the journal wins.
    if (hasPendingInvite()) return <Navigate to="/join" replace />;
    return <Navigate to={consumeIntendedPath() ?? "/app/journal"} replace />;
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

// Keying the workspace by organization id guarantees every piece of tab, invite, member, and
// conversation state resets completely when the selected organization changes.
function OrganizationWorkspaceRoute() {
  const { orgId = "" } = useParams();
  return <OrganizationWorkspacePage key={orgId} />;
}

function ProtectedApp() {
  const { state, user, bootstrapStalled, retryBootstrap } = useAuth();
  const location = useLocation();
  const redirecting = state !== "CONFIGURATION_MISSING" && state !== "BOOTSTRAPPING" && !(state === "AUTHENTICATED" && user);

  // The attempted deep link is captured before redirecting to sign-in so the same account returns
  // to it after authenticating. Only same-application paths are ever stored.
  useEffect(() => {
    if (redirecting) rememberIntendedPath(location.pathname);
  }, [redirecting, location.pathname]);

  if (state === "CONFIGURATION_MISSING") return <ConfigurationRequired />;

  if (state === "BOOTSTRAPPING") {
    return <AuthLoading stalled={bootstrapStalled} onRetry={retryBootstrap} />;
  }

  if (state === "AUTHENTICATED" && user) {
    return <AuthenticatedLayout key={user.uid} user={user} />;
  }

  return <Navigate to="/" replace />;
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
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RootRoute />} />
          <Route
            path="/join"
            element={
              <Suspense fallback={<AuthLoading />}>
                <JoinPage />
              </Suspense>
            }
          />
          <Route
            path="/privacy"
            element={
              <Suspense fallback={<AuthLoading />}>
                <PrivacyPage />
              </Suspense>
            }
          />
          <Route
            path="/terms"
            element={
              <Suspense fallback={<AuthLoading />}>
                <TermsPage />
              </Suspense>
            }
          />
          <Route path="/app" element={<ProtectedApp />}>
            <Route index element={<Navigate to="/app/journal" replace />} />
            <Route path="journal" element={<JournalPage />} />
            <Route path="insights" element={<InsightsPage />} />
            <Route path="ask" element={<AskMePage />} />
            <Route path="map" element={<MapPage />} />
            <Route path="archives" element={<ArchivesPage />} />
            <Route path="organizations" element={<OrganizationsPage />} />
            <Route path="organizations/:orgId" element={<OrganizationWorkspaceRoute />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="*" element={<Navigate to="/app/journal" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
