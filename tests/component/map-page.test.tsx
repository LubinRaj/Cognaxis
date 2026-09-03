import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as FirebaseAuthModule from "firebase/auth";
import type { WorkspaceApiStub } from "./support/workspace-api";

vi.mock("firebase/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof FirebaseAuthModule>();
  const harness = await import("./support/firebase-harness");
  return { ...actual, ...harness.firebaseAuthMocks };
});

vi.mock("../../src/client/lib/firebase", async () => {
  const harness = await import("./support/firebase-harness");
  return harness.firebaseModuleMock;
});

const { resetHarness, makeUser } = await import("./support/firebase-harness");
const { renderApp, signalUser } = await import("./support/render-app");
const { installWorkspaceApi, makeMapPoint, failure } = await import("./support/workspace-api");

let api: WorkspaceApiStub;

async function renderMap() {
  await renderApp("/app/map");
  const account = makeUser({ uid: "user_alpha", emailVerified: true });
  account.getIdToken = vi.fn().mockResolvedValue("token-user_alpha");
  await signalUser(account);
  await screen.findByRole("heading", { name: "Map" });
}

describe("private map page", () => {
  beforeEach(() => {
    resetHarness();
    api = installWorkspaceApi();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists located reflections accessibly when no map key is configured", async () => {
    api.mapPoints = [
      makeMapPoint({ sessionId: "s1", label: "Neighborhood park", localDate: "2026-09-01" }),
      makeMapPoint({
        sessionId: "s2",
        label: "Lakeside bench",
        localDate: "2026-08-20",
        moodScore: null,
        precision: "exact",
      }),
    ];
    await renderMap();

    expect(
      await screen.findByText(/interactive map is not configured/),
    ).toBeInTheDocument();
    const list = screen.getByRole("region", { name: "Located reflections" });
    expect(list).toHaveTextContent("Reflection s1");
    expect(list).toHaveTextContent("Neighborhood park");
    expect(list).toHaveTextContent("approximate");
    expect(list).toHaveTextContent("Lakeside bench");
    expect(screen.getByText("Mood: Good")).toBeInTheDocument();
  });

  it("opens the owned reflection from a list entry", async () => {
    const user = userEvent.setup();
    api.mapPoints = [makeMapPoint({ sessionId: "s1" })];
    await renderMap();
    await screen.findByText("Reflection s1");

    await user.click(screen.getByRole("button", { name: "Open reflection" }));
    expect(window.location.pathname).toBe("/app/journal");
    expect(window.location.search).toBe("?session=s1");
  });

  it("shows an honest empty state", async () => {
    await renderMap();
    expect(await screen.findByText("No located reflections yet")).toBeInTheDocument();
  });

  it("recovers from a load failure with retry", async () => {
    api.handler = (route) =>
      route.url.startsWith("/api/v1/personal/map-points")
        ? failure(500, "INTERNAL_ERROR")
        : null;
    await renderMap();
    expect(
      await screen.findByRole("heading", { name: "The map could not be loaded" }),
    ).toBeInTheDocument();

    api.handler = null;
    api.mapPoints = [makeMapPoint({ sessionId: "s1" })];
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => {
      expect(screen.getByText("Reflection s1")).toBeInTheDocument();
    });
  });
});
