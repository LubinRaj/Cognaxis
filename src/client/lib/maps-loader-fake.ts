/// <reference types="google.maps" />

// Deterministic stand-in for the Maps JavaScript API, compiled in only when the end-to-end build
// sets VITE_E2E_FAKE_MAPS. It renders plain DOM so browser tests can observe map readiness,
// markers, and selection without contacting Google. Setting the localStorage key
// "cognaxis.e2e.maps" to "fail" makes the load reject so tests can exercise the list fallback.

type Listener = { remove: () => void };

class FakeMarker {
  private element: HTMLSpanElement;
  private clickHandlers: Array<() => void> = [];

  constructor(options: { map?: FakeMap | null; position: unknown; title?: string }) {
    this.element = document.createElement("span");
    this.element.dataset.e2e = "fake-marker";
    this.element.dataset.title = options.title ?? "";
    this.element.style.display = "inline-block";
    this.element.style.width = "16px";
    this.element.style.height = "16px";
    this.element.addEventListener("click", () => {
      for (const handler of [...this.clickHandlers]) handler();
    });
    if (options.map) options.map.container.append(this.element);
  }

  addListener(_event: string, handler: () => void): Listener {
    this.clickHandlers.push(handler);
    return {
      remove: () => {
        this.clickHandlers = this.clickHandlers.filter((existing) => existing !== handler);
      },
    };
  }

  setMap(map: FakeMap | null): void {
    if (map) map.container.append(this.element);
    else this.element.remove();
  }

  setPosition(): void {}

  setTitle(title: string | null): void {
    this.element.dataset.title = title ?? "";
  }

  setAnimation(animation: unknown): void {
    this.element.dataset.selected = animation === null ? "false" : "true";
  }
}

class FakeMap {
  readonly container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    const surface = document.createElement("div");
    surface.dataset.e2e = "fake-map";
    surface.textContent = "Deterministic map ready";
    container.append(surface);
  }

  addListener(): Listener {
    return { remove: () => undefined };
  }

  panTo(): void {}
}

export async function loadFakeMapsLibrary(): Promise<google.maps.MapsLibrary> {
  await Promise.resolve();
  if (window.localStorage.getItem("cognaxis.e2e.maps") === "fail") {
    throw new Error("Deterministic maps load failure requested by the test.");
  }

  const globalWithMaps = window as unknown as { google?: { maps?: unknown } };
  globalWithMaps.google = {
    maps: {
      Marker: FakeMarker,
      Animation: { BOUNCE: "bounce" },
    },
  };

  return { Map: FakeMap } as unknown as google.maps.MapsLibrary;
}
