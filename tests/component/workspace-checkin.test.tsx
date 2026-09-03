import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as FirebaseAuthModule from "firebase/auth";
import type { UpsertSignalInput } from "../../src/shared/schemas";
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
const { installWorkspaceApi, makeDetail, makeSession, makeSignal, failure } = await import(
  "./support/workspace-api"
);

let api: WorkspaceApiStub;

async function renderJournalWithSession() {
  api.sessions = [makeSession({ id: "s1", title: "Morning pages" })];
  api.details.set("s1", makeDetail({ id: "s1", title: "Morning pages" }));
  await renderApp();
  const account = makeUser({ uid: "user_alpha", emailVerified: true });
  account.getIdToken = vi.fn().mockResolvedValue("token-user_alpha");
  await signalUser(account);
  await screen.findByRole("heading", { level: 1, name: "Morning pages" });
}

function lastSignalPut(): UpsertSignalInput {
  const puts = api.routes.filter(
    (route) => route.method === "PUT" && route.url.endsWith("/signals"),
  );
  expect(puts.length).toBeGreaterThan(0);
  return puts[puts.length - 1].body as UpsertSignalInput;
}

describe("reflection check-in", () => {
  beforeEach(() => {
    resetHarness();
    api = installWorkspaceApi();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves a new check-in with mood, emotions, and a note", async () => {
    const user = userEvent.setup();
    await renderJournalWithSession();

    await user.click(
      await screen.findByRole("button", { name: "Add reflection check-in" }),
    );
    expect(await screen.findByRole("dialog", { name: "Reflection check-in" })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Good/ }));
    await user.click(screen.getByRole("button", { name: "Calm" }));
    await user.click(screen.getByRole("button", { name: "Focused" }));
    await user.type(screen.getByLabelText(/Private note/), "Slept well.");
    await user.click(screen.getByRole("button", { name: "Save check-in" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Reflection check-in" })).not.toBeInTheDocument();
    });

    const body = lastSignalPut();
    expect(body.moodScore).toBe(4);
    expect(body.emotions).toEqual(["calm", "focused"]);
    expect(body.note).toBe("Slept well.");
    expect(body.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body).not.toHaveProperty("uid");
    expect(body).not.toHaveProperty("createdBy");

    expect(await screen.findByText("Mood: Good")).toBeInTheDocument();
    expect(screen.getByText("Note saved")).toBeInTheDocument();
  });

  it("loads an existing check-in for editing and can remove it", async () => {
    const user = userEvent.setup();
    api = installWorkspaceApi();
    api.signals.set(
      "s1",
      makeSignal({ sourceSessionId: "s1", moodScore: 2, emotions: ["tired"], note: "Long day." }),
    );
    await renderJournalWithSession();

    expect(await screen.findByText("Mood: Low")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit reflection check-in" }));
    const dialog = await screen.findByRole("dialog", { name: "Reflection check-in" });
    expect(dialog).toBeInTheDocument();

    expect(
      within(screen.getByRole("radiogroup", { name: "Mood" })).getByRole("radio", { name: "Low" }),
    ).toBeChecked();
    expect(screen.getByRole("button", { name: "Tired" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/Private note/)).toHaveValue("Long day.");

    await user.click(screen.getByRole("button", { name: "Remove check-in" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Reflection check-in" })).not.toBeInTheDocument();
    });
    expect(
      api.routes.some((route) => route.method === "DELETE" && route.url.endsWith("/signals")),
    ).toBe(true);
    expect(screen.queryByText("Mood: Low")).not.toBeInTheDocument();
  });

  it("limits emotions to five selections", async () => {
    const user = userEvent.setup();
    await renderJournalWithSession();
    await user.click(await screen.findByRole("button", { name: "Add reflection check-in" }));
    await screen.findByRole("dialog", { name: "Reflection check-in" });

    for (const emotion of ["Calm", "Hopeful", "Focused", "Energized", "Grateful"]) {
      await user.click(screen.getByRole("button", { name: emotion }));
    }
    expect(screen.getByRole("button", { name: "Content" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Calm" })).toBeEnabled();
  });

  it("keeps the user's input when saving fails", async () => {
    const user = userEvent.setup();
    await renderJournalWithSession();

    api.handler = (route) =>
      route.method === "PUT" && route.url.endsWith("/signals")
        ? failure(500, "INTERNAL_ERROR", "The request could not be completed.")
        : null;

    await user.click(await screen.findByRole("button", { name: "Add reflection check-in" }));
    await screen.findByRole("dialog", { name: "Reflection check-in" });
    await user.click(screen.getByRole("radio", { name: /Very good/ }));
    await user.type(screen.getByLabelText(/Private note/), "Do not lose this.");
    await user.click(screen.getByRole("button", { name: "Save check-in" }));

    expect(await screen.findByText("The request could not be completed.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Reflection check-in" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Private note/)).toHaveValue("Do not lose this.");
    expect(screen.getByRole("radio", { name: /Very good/ })).toBeChecked();

    api.handler = null;
    await user.click(screen.getByRole("button", { name: "Save check-in" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Reflection check-in" })).not.toBeInTheDocument();
    });
  });

  it("never requests the browser location before the explicit action", async () => {
    const user = userEvent.setup();
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
    });
    await renderJournalWithSession();

    await user.click(await screen.findByRole("button", { name: "Add reflection check-in" }));
    await screen.findByRole("dialog", { name: "Reflection check-in" });
    expect(getCurrentPosition).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Use my current location" }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("keeps journaling fully usable when location permission is declined", async () => {
    const user = userEvent.setup();
    const getCurrentPosition = vi.fn(
      (
        _success: PositionCallback,
        errorCallback?: PositionErrorCallback | null,
      ) => {
        errorCallback?.({
          code: 1,
          message: "denied",
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        });
      },
    );
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
    });
    await renderJournalWithSession();

    await user.click(await screen.findByRole("button", { name: "Add reflection check-in" }));
    await screen.findByRole("dialog", { name: "Reflection check-in" });
    await user.click(screen.getByRole("button", { name: "Use my current location" }));

    expect(
      await screen.findByText(/Location permission was declined/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Good/ }));
    await user.click(screen.getByRole("button", { name: "Save check-in" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Reflection check-in" })).not.toBeInTheDocument();
    });
    expect(lastSignalPut().location).toBeNull();
  });

  it("saves an explicitly approved location with a required label and precision choice", async () => {
    const user = userEvent.setup();
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: {
          latitude: 12.971598,
          longitude: 77.594566,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: Date.now(),
        toJSON: () => ({}),
      });
    });
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
    });
    await renderJournalWithSession();

    await user.click(await screen.findByRole("button", { name: "Add reflection check-in" }));
    await screen.findByRole("dialog", { name: "Reflection check-in" });
    await user.click(screen.getByRole("button", { name: "Use my current location" }));

    expect(await screen.findByTestId("location-coordinates")).toHaveTextContent("12.97160");
    expect(screen.getByRole("radio", { name: /Approximate/ })).toBeChecked();

    // A place needs a label before it can be saved.
    await user.click(screen.getByRole("radio", { name: /Good/ }));
    expect(screen.getByRole("button", { name: "Save check-in" })).toBeDisabled();
    await user.type(screen.getByLabelText("Place label"), "Neighborhood park");
    await user.click(screen.getByRole("button", { name: "Save check-in" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Reflection check-in" })).not.toBeInTheDocument();
    });
    const body = lastSignalPut();
    expect(body.location).toMatchObject({
      label: "Neighborhood park",
      latitude: 12.971598,
      longitude: 77.594566,
      precision: "approximate",
      placeId: null,
    });
    expect(await screen.findByText("Neighborhood park")).toBeInTheDocument();
  });

  it("removes a saved location without losing the rest of the check-in", async () => {
    const user = userEvent.setup();
    api.signals.set(
      "s1",
      makeSignal({
        sourceSessionId: "s1",
        moodScore: 3,
        location: {
          placeId: null,
          label: "Old spot",
          latitude: 10,
          longitude: 20,
          precision: "approximate",
        },
      }),
    );
    await renderJournalWithSession();
    expect(await screen.findByText("Old spot")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit reflection check-in" }));
    await screen.findByRole("dialog", { name: "Reflection check-in" });
    await user.click(screen.getByRole("button", { name: "Remove location" }));
    await user.click(screen.getByRole("button", { name: "Save check-in" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Reflection check-in" })).not.toBeInTheDocument();
    });
    const body = lastSignalPut();
    expect(body.location).toBeNull();
    expect(body.moodScore).toBe(3);
    expect(screen.queryByText("Old spot")).not.toBeInTheDocument();
  });

  it("disables saving while the check-in is completely empty", async () => {
    const user = userEvent.setup();
    await renderJournalWithSession();
    await user.click(await screen.findByRole("button", { name: "Add reflection check-in" }));
    await screen.findByRole("dialog", { name: "Reflection check-in" });

    expect(screen.getByRole("button", { name: "Save check-in" })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: /Okay/ }));
    expect(screen.getByRole("button", { name: "Save check-in" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Clear mood" }));
    expect(screen.getByRole("button", { name: "Save check-in" })).toBeDisabled();
  });
});
