import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { InvitePreview } from "../../shared/schemas";
import { useAuth } from "../auth/AuthProvider";
import { ApiClient, ApiError } from "../lib/api-client";
import {
  clearPendingInvite,
  parseJoinLocation,
  readPendingInvite,
  storePendingInvite,
  type PendingInvite,
} from "../organizations/invite-links";
import { AuthLoading } from "../components/auth/AuthLoading";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { Surface } from "../components/ui/Surface";
import { usePageTitle } from "../shell/use-page-title";

type JoinState =
  | { step: "loading" }
  | { step: "preview"; preview: InvitePreview }
  | { step: "accepting"; preview: InvitePreview }
  | { step: "failed"; message: string };

const ROLE_SENTENCES: Record<string, string> = {
  admin: "as an admin who can manage members",
  member: "as a member who can write and reflect",
  viewer: "as a viewer with read-only access",
};

export function JoinPage() {
  const navigate = useNavigate();
  const { state: authState, user, send } = useAuth();
  usePageTitle("Join organization · Cognaxis");

  // The one-time secret is read from the URL fragment exactly once and immediately scrubbed from
  // the address bar and browser history.
  const [invite] = useState<PendingInvite | null>(() => {
    const fromUrl = parseJoinLocation(window.location.search, window.location.hash);
    if (fromUrl) {
      window.history.replaceState(null, "", "/join");
      storePendingInvite(fromUrl);
      return fromUrl;
    }
    return readPendingInvite();
  });

  const [state, setState] = useState<JoinState>({ step: "loading" });
  const previewRequested = useRef(false);

  const api = useMemo(() => (user ? new ApiClient(() => user) : null), [user]);
  const authenticated = authState === "AUTHENTICATED" && api !== null;

  useEffect(() => {
    if (!invite || !authenticated || !api || previewRequested.current) return;
    previewRequested.current = true;
    api
      .previewOrganizationInvite(invite.orgId, invite.inviteId, invite.secret)
      .then((preview) => setState({ step: "preview", preview }))
      .catch((error: unknown) => {
        clearPendingInvite();
        setState({
          step: "failed",
          message:
            error instanceof ApiError && error.code === "INVITE_INVALID"
              ? "This invitation is not valid any more. Ask for a new link."
              : "The invitation could not be checked right now. Please try again.",
        });
      });
  }, [authenticated, api, invite]);

  async function accept(preview: InvitePreview) {
    if (!invite || !api) return;
    setState({ step: "accepting", preview });
    try {
      const membership = await api.acceptOrganizationInvite(
        invite.orgId,
        invite.inviteId,
        invite.secret,
      );
      clearPendingInvite();
      void navigate(`/app/organizations/${encodeURIComponent(membership.orgId)}`, {
        replace: true,
      });
    } catch (error) {
      clearPendingInvite();
      setState({
        step: "failed",
        message:
          error instanceof ApiError && error.code === "INVITE_INVALID"
            ? "This invitation is not valid any more. Ask for a new link."
            : "The invitation could not be accepted right now. Please try again with a new link.",
      });
    }
  }

  function decline() {
    clearPendingInvite();
    void navigate("/", { replace: true });
  }

  if (authState === "BOOTSTRAPPING") {
    return <AuthLoading />;
  }

  return (
    <div className="bg-surface text-on-surface flex min-h-dvh items-center justify-center p-6 font-sans">
      <Surface className="w-full max-w-md p-6">
        {invite === null ? (
          <EmptyState
            icon="error"
            title="This invitation link is incomplete"
            description="Ask the person who invited you to send the full link again."
            actions={
              <Button variant="outlined" onClick={() => void navigate("/", { replace: true })}>
                Go to Cognaxis
              </Button>
            }
          />
        ) : !authenticated ? (
          <EmptyState
            icon="groups"
            title="You have been invited to an organization"
            description="Sign in to see the invitation. It stays available while you sign in on this device."
            actions={
              <Button
                onClick={() => {
                  send({ type: "OPEN_SIGN_IN" });
                  void navigate("/", { replace: true });
                }}
              >
                Sign in to continue
              </Button>
            }
          />
        ) : state.step === "failed" ? (
          <EmptyState
            icon="error"
            title="Invitation not accepted"
            description={state.message}
            actions={
              <Button variant="outlined" onClick={() => void navigate("/app/journal")}>
                Go to your journal
              </Button>
            }
          />
        ) : state.step === "preview" || state.step === "accepting" ? (
          <div>
            <h1 className="font-display text-on-surface text-xl font-medium">
              Join {state.preview.organizationName}?
            </h1>
            <p className="text-on-surface-variant mt-2 text-sm">
              You were invited {ROLE_SENTENCES[state.preview.role] ?? "as a member"}. Reflections
              inside an organization are visible to its active members and stay separate from your
              private journal.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="text" onClick={decline} disabled={state.step === "accepting"}>
                Not now
              </Button>
              <Button
                onClick={() => void accept(state.preview)}
                loading={state.step === "accepting"}
                loadingLabel="Joining…"
              >
                Join organization
              </Button>
            </div>
          </div>
        ) : (
          <div role="status" aria-label="Checking invitation" className="py-10 text-center">
            <p className="text-on-surface-variant text-sm">Checking your invitation…</p>
          </div>
        )}
      </Surface>
    </div>
  );
}

export default JoinPage;
