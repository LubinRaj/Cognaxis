import { StrictMode } from "react";
import { act, render, waitFor, type RenderResult } from "@testing-library/react";
import { App } from "../../../src/client/App";
import { emitUser, makeUser, type TestUser } from "./firebase-harness";

// Every screen is reached through the real application shell and the real authentication state
// machine, so the tests exercise the same transitions the browser does.
export async function renderApp(
  initialPath = "/",
  options: { strictMode?: boolean } = {},
): Promise<RenderResult> {
  // The authentication surface is behind a dynamic import. Resolving it here puts it in the module
  // cache before the first render, so Suspense never has to race an async query timeout while the
  // suite runs in parallel. The import happens inside the mocked module graph, so the component
  // under test is still the mocked one.
  await import("../../../src/client/components/auth/AuthSurface");

  // jsdom keeps the URL of the previous test, so every render starts from an explicit path.
  window.history.replaceState(null, "", initialPath);
  window.sessionStorage.removeItem("cognaxis.postAuthPath");

  // Production React may replay effects in development Strict Mode. Supporting it here lets
  // component tests catch effects that accidentally cancel their only asynchronous load.
  const result = render(options.strictMode ? <StrictMode><App /></StrictMode> : <App />);
  await act(async () => {
    await Promise.resolve();
  });
  return result;
}

export async function signalNoUser(): Promise<void> {
  await act(async () => {
    emitUser(null);
    await Promise.resolve();
  });
}

export async function signalUser(user: TestUser): Promise<void> {
  await act(async () => {
    emitUser(user);
    await Promise.resolve();
  });
}

export async function renderSignedOut(): Promise<RenderResult> {
  const result = await renderApp();
  await signalNoUser();
  return result;
}

// The authentication surface is a lazily loaded chunk, so tests must wait for the Suspense
// boundary to resolve before querying its screens.
export async function waitForAuthSurface(): Promise<void> {
  await waitFor(() => {
    if (!document.querySelector(".cx-auth-card")) {
      throw new Error("The authentication surface has not mounted yet.");
    }
  }, { timeout: 5_000 });
}

export async function renderWithUser(user: TestUser): Promise<RenderResult> {
  const result = await renderApp();
  await signalUser(user);
  await waitForAuthSurface();
  return result;
}

export async function renderUnverifiedUser(
  overrides: Partial<TestUser> = {},
): Promise<RenderResult> {
  const result = await renderApp();
  await signalUser(makeUser({ emailVerified: false, ...overrides }));
  await waitForAuthSurface();
  return result;
}
