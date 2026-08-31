import { Component, type ReactNode } from "react";
import { AuthLoading } from "./AuthLoading";

type AuthSurfaceBoundaryProps = { children: ReactNode };
type AuthSurfaceBoundaryState = { failed: boolean };

// React caches a rejected lazy import, so a failed authentication chunk cannot be retried in place.
// The boundary offers a reload instead of leaving the user on a permanent loading screen, and it
// never renders the underlying error, which can carry asset paths and build identifiers.
export class AuthSurfaceBoundary extends Component<
  AuthSurfaceBoundaryProps,
  AuthSurfaceBoundaryState
> {
  state: AuthSurfaceBoundaryState = { failed: false };

  static getDerivedStateFromError(): AuthSurfaceBoundaryState {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <AuthLoading
          stalled
          stalledMessage="The sign-in screen could not be loaded. Check your connection and reload the page."
          retryLabel="Reload"
          onRetry={() => window.location.reload()}
        />
      );
    }

    return this.props.children;
  }
}
