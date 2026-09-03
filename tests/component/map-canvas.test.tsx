import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadMapsLibrary = vi.fn();
vi.mock("../../src/client/lib/maps-loader", () => ({
  loadMapsLibrary: () => loadMapsLibrary() as Promise<unknown>,
  mapsConfigured: () => true,
}));

const { MapCanvas } = await import("../../src/client/components/map/MapCanvas");

class FakeListener {
  removed = false;
  remove(): void {
    this.removed = true;
  }
}

type ListenerRecord = { event: string; handler: (...args: unknown[]) => void; listener: FakeListener };

class FakeMap {
  static instances: FakeMap[] = [];
  readonly options: Record<string, unknown>;
  readonly listeners: ListenerRecord[] = [];
  readonly panCalls: Array<{ lat: number; lng: number }> = [];

  constructor(_element: HTMLElement, options: Record<string, unknown>) {
    this.options = options;
    FakeMap.instances.push(this);
  }

  addListener(event: string, handler: (...args: unknown[]) => void): FakeListener {
    const listener = new FakeListener();
    this.listeners.push({ event, handler, listener });
    return listener;
  }

  panTo(position: { lat: number; lng: number }): void {
    this.panCalls.push(position);
  }
}

class FakeMarker {
  static instances: FakeMarker[] = [];
  map: unknown;
  position: { lat: number; lng: number };
  title: string;
  animation: unknown = null;
  readonly listeners: ListenerRecord[] = [];

  constructor(options: { map: unknown; position: { lat: number; lng: number }; title: string }) {
    this.map = options.map;
    this.position = options.position;
    this.title = options.title;
    FakeMarker.instances.push(this);
  }

  addListener(event: string, handler: (...args: unknown[]) => void): FakeListener {
    const listener = new FakeListener();
    this.listeners.push({ event, handler, listener });
    return listener;
  }

  setMap(map: unknown): void {
    this.map = map;
  }

  setPosition(position: { lat: number; lng: number }): void {
    this.position = position;
  }

  setTitle(title: string): void {
    this.title = title;
  }

  setAnimation(animation: unknown): void {
    this.animation = animation;
  }
}

function deferLoader() {
  let resolve!: (library: { Map: typeof FakeMap }) => void;
  let reject!: (error: Error) => void;
  loadMapsLibrary.mockReturnValue(
    new Promise((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    }),
  );
  return { resolve, reject };
}

const CENTER = { latitude: 12.9, longitude: 77.5 };
const MARKER = { id: "point_a", latitude: 12.91, longitude: 77.51, title: "Reflection point_a" };

describe("MapCanvas lifecycle", () => {
  beforeEach(() => {
    FakeMap.instances = [];
    FakeMarker.instances = [];
    loadMapsLibrary.mockReset();
    (globalThis as { google?: unknown }).google = {
      maps: { Marker: FakeMarker, Animation: { BOUNCE: "BOUNCE" } },
    };
  });

  afterEach(() => {
    cleanup();
    delete (globalThis as { google?: unknown }).google;
  });

  it("renders markers supplied before the library finished loading", async () => {
    const { resolve } = deferLoader();
    render(
      <MapCanvas
        center={CENTER}
        zoom={12}
        markers={[MARKER]}
        onLoadError={() => undefined}
      />,
    );
    expect(FakeMarker.instances).toHaveLength(0);

    await act(async () => {
      resolve({ Map: FakeMap });
      await Promise.resolve();
    });

    expect(FakeMap.instances).toHaveLength(1);
    expect(FakeMarker.instances).toHaveLength(1);
    expect(FakeMarker.instances[0]?.title).toBe("Reflection point_a");
    expect(FakeMarker.instances[0]?.map).toBe(FakeMap.instances[0]);
  });

  it("pans to the center chosen while the library was still loading", async () => {
    const { resolve } = deferLoader();
    const { rerender } = render(
      <MapCanvas center={CENTER} zoom={12} markers={[]} onLoadError={() => undefined} />,
    );
    const laterCenter = { latitude: 48.85, longitude: 2.35 };
    rerender(
      <MapCanvas center={laterCenter} zoom={12} markers={[]} onLoadError={() => undefined} />,
    );

    await act(async () => {
      resolve({ Map: FakeMap });
      await Promise.resolve();
    });

    expect(FakeMap.instances[0]?.panCalls).toContainEqual({ lat: 48.85, lng: 2.35 });
  });

  it("removes markers and listeners when unmounted", async () => {
    const { resolve } = deferLoader();
    const { unmount } = render(
      <MapCanvas
        center={CENTER}
        zoom={12}
        markers={[MARKER]}
        onSelect={() => undefined}
        onMapClick={() => undefined}
        onLoadError={() => undefined}
      />,
    );
    await act(async () => {
      resolve({ Map: FakeMap });
      await Promise.resolve();
    });
    const map = FakeMap.instances[0];
    const marker = FakeMarker.instances[0];
    expect(marker?.map).toBe(map);

    unmount();

    expect(marker?.map).toBeNull();
    expect(marker?.listeners.every((record) => record.listener.removed)).toBe(true);
    expect(map?.listeners.every((record) => record.listener.removed)).toBe(true);
  });

  it("reports a load failure exactly through the error callback", async () => {
    const { reject } = deferLoader();
    const onLoadError = vi.fn();
    render(<MapCanvas center={CENTER} zoom={12} markers={[]} onLoadError={onLoadError} />);

    await act(async () => {
      reject(new Error("blocked"));
      await Promise.resolve();
    });

    expect(onLoadError).toHaveBeenCalledTimes(1);
    expect(FakeMap.instances).toHaveLength(0);
  });
});
