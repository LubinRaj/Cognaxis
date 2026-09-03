/// <reference types="google.maps" />

// The Maps JavaScript API is loaded only after the user opens a map surface, never on landing,
// authentication, journal, or admin screens. When no browser key is configured the application
// degrades to accessible list views without contacting any third party.

export function mapsConfigured(): boolean {
  return Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
}

let mapsLibraryPromise: Promise<google.maps.MapsLibrary> | null = null;

export async function loadMapsLibrary(): Promise<google.maps.MapsLibrary> {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("Google Maps is not configured for this deployment.");
  }

  // End-to-end builds substitute a deterministic adapter at this boundary. The flag is undefined
  // in deployed builds, so the whole branch (and the adapter chunk) is compiled out.
  if (import.meta.env.VITE_E2E_FAKE_MAPS === "true") {
    const { loadFakeMapsLibrary } = await import("./maps-loader-fake");
    return loadFakeMapsLibrary();
  }

  if (!mapsLibraryPromise) {
    mapsLibraryPromise = (async () => {
      const { setOptions, importLibrary } = await import("@googlemaps/js-api-loader");
      setOptions({ key: apiKey, v: "weekly" });
      return importLibrary("maps");
    })().catch((error: unknown) => {
      // A failed load must stay retryable instead of caching the rejection forever.
      mapsLibraryPromise = null;
      throw error;
    });
  }
  return mapsLibraryPromise;
}
