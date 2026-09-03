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
const { installWorkspaceApi, makeDashboard, makeInsight, failure, releaseGate } = await import(
  "./support/workspace-api"
);

let api: WorkspaceApiStub;

async function renderInsights() {
  await renderApp("/app/insights");
  const account = makeUser({ uid: "user_alpha", emailVerified: true });
  account.getIdToken = vi.fn().mockResolvedValue("token-user_alpha");
  await signalUser(account);
  await screen.findByRole("heading", { name: "Insights" });
}

describe("insights dashboard page", () => {
  beforeEach(() => {
    resetHarness();
    api = installWorkspaceApi();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders deterministic metrics, emotions, and the accessible chart table", async () => {
    const user = userEvent.setup();
    await renderInsights();

    const reflectionsLabel = await screen.findByText("Reflections");
    expect(reflectionsLabel.closest("div")).toHaveTextContent("5");
    expect(screen.getByText("3.7")).toBeInTheDocument();
    expect(screen.getByText("3.2")).toBeInTheDocument();
    expect(screen.getByText("60% of reflections have one")).toBeInTheDocument();
    expect(screen.getByText("up 0.5 from the previous period")).toBeInTheDocument();
    expect(screen.getByText(/Calm · 2/)).toBeInTheDocument();

    await user.click(screen.getByText("View chart data as a table"));
    const table = await screen.findByRole("table");
    expect(table).toBeInTheDocument();
    expect(screen.getAllByText("No check-in").length).toBeGreaterThan(0);
  });

  it("shows an honest empty state that links back to the journal", async () => {
    api.dashboard = makeDashboard({
      reflectionCount: 0,
      checkinCount: 0,
      coverage: null,
      moodAverage: null,
      energyAverage: null,
      topEmotions: [],
      trend: [],
      hasEnoughForTrend: false,
    });
    await renderInsights();

    expect(await screen.findByText("No check-ins yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to your journal" })).toBeInTheDocument();
  });

  it("announces sparse data instead of drawing an unsupported trend", async () => {
    api.dashboard = makeDashboard({ checkinCount: 2, hasEnoughForTrend: false });
    await renderInsights();

    expect(await screen.findByText(/Not enough check-ins yet/)).toBeInTheDocument();
    expect(screen.queryByText("View chart data as a table")).not.toBeInTheDocument();
  });

  it("recovers from a load failure with retry", async () => {
    api.handler = (route) =>
      route.url.startsWith("/api/v1/personal/insights/dashboard")
        ? failure(500, "INTERNAL_ERROR")
        : null;
    await renderInsights();

    expect(
      await screen.findByRole("heading", { name: "Your insights could not be loaded" }),
    ).toBeInTheDocument();

    api.handler = null;
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Reflections")).toBeInTheDocument();
  });

  it("keeps the current dashboard visible while a new range loads", async () => {
    const user = userEvent.setup();
    await renderInsights();
    await screen.findByText("Reflections");

    api.gate.hold = true;
    await user.click(screen.getByRole("button", { name: "30 days" }));

    expect(screen.getByText("Reflections")).toBeInTheDocument();
    expect(screen.getByText("3.7")).toBeInTheDocument();

    api.dashboard = makeDashboard({ rangeDays: 30, moodAverage: 2.1 });
    releaseGate(api);
    await waitFor(() => {
      expect(screen.getByText("2.1")).toBeInTheDocument();
    });
    const rangeRequests = api.routes.filter((route) =>
      route.url.includes("rangeDays=30"),
    );
    expect(rangeRequests.length).toBeGreaterThan(0);
  });

  it("creates a daily recap on demand with an idempotent request id", async () => {
    const user = userEvent.setup();
    await renderInsights();
    await screen.findByText("Reflections");

    await user.click(screen.getByRole("button", { name: "Create today’s recap" }));

    expect(await screen.findByText("A steady day")).toBeInTheDocument();
    const generateCall = api.routes.find((route) => route.url.includes("/generate"));
    expect(generateCall).toBeDefined();
    const body = generateCall?.body as { requestId: string; regenerate: boolean };
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.regenerate).toBe(false);
    expect(generateCall?.url).toContain("/insights/day/day_2026-09-03/generate");
  });

  it("shows a stored recap with grounding, evidence links, and the disclaimer", async () => {
    const user = userEvent.setup();
    api.recentInsights = [makeInsight({ periodKey: "day_2026-09-03" })];
    await renderInsights();

    expect(await screen.findByText("A steady day")).toBeInTheDocument();
    expect(screen.getByText(/Reflections shared a calm tone/)).toBeInTheDocument();
    expect(
      screen.getByText(/not medical advice or a diagnosis/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open reflection" }));
    expect(window.location.pathname).toBe("/app/journal");
    expect(window.location.search).toBe("?session=s1");
  });

  it("marks an out-of-date recap and regenerates it explicitly", async () => {
    const user = userEvent.setup();
    api.recentInsights = [makeInsight({ periodKey: "day_2026-09-03", stale: true })];
    await renderInsights();

    expect(await screen.findByText("Out of date")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Update recap" }));

    await waitFor(() => {
      expect(screen.queryByText("Out of date")).not.toBeInTheDocument();
    });
    const generateCall = api.routes.find((route) => route.url.includes("/generate"));
    expect((generateCall?.body as { regenerate: boolean }).regenerate).toBe(true);
  });

  it("removes only the derived recap", async () => {
    const user = userEvent.setup();
    api.recentInsights = [makeInsight({ periodKey: "day_2026-09-03" })];
    await renderInsights();
    await screen.findByText("A steady day");

    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(screen.queryByText("A steady day")).not.toBeInTheDocument();
    });
    expect(
      api.routes.some(
        (route) =>
          route.method === "DELETE" && route.url === "/api/v1/personal/insights/day_2026-09-03",
      ),
    ).toBe(true);
  });

  it("offers the detected browser timezone when the stored one differs", async () => {
    api.dashboard = makeDashboard({ timezone: "Asia/Kolkata" });
    await renderInsights();

    expect(await screen.findByText(/Your device reports/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Use / })).toBeInTheDocument();
  });
});
