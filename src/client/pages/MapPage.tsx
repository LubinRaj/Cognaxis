import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import type { User } from "firebase/auth";
import type { MapPoint, Preferences } from "../../shared/schemas";
import { useAuth } from "../auth/AuthProvider";
import { ApiClient, ApiError } from "../lib/api-client";
import { mapsConfigured } from "../lib/maps-loader";
import { MOOD_LABELS } from "../workspace/check-in";
import { Button } from "../components/ui/Button";
import { Chip } from "../components/ui/Chip";
import { EmptyState } from "../components/ui/EmptyState";
import { InlineAlert } from "../components/ui/InlineAlert";
import { Skeleton } from "../components/ui/Skeleton";
import { usePageTitle } from "../shell/use-page-title";

const MapCanvas = lazy(() =>
  import("../components/map/MapCanvas").then((module) => ({ default: module.MapCanvas })),
);

type LoadStatus = "loading" | "ready" | "error";

function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function MapPage() {
  const user = useOutletContext<User>();
  const navigate = useNavigate();
  const { reportSessionExpired, reportEmailVerificationRequired } = useAuth();
  usePageTitle("Map · Cognaxis");

  const api = useMemo(
    () =>
      new ApiClient(() => user, {
        onSessionExpired: reportSessionExpired,
        onEmailVerificationRequired: reportEmailVerificationRequired,
      }),
    [user, reportSessionExpired, reportEmailVerificationRequired],
  );

  const [points, setPoints] = useState<MapPoint[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [locationSaving, setLocationSaving] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const requestId = ++requestRef.current;
    api
      .getMapPoints()
      .then((loaded) => {
        if (requestRef.current !== requestId) return;
        setPoints(loaded);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (requestRef.current !== requestId) return;
        setStatus("error");
        setErrorMessage(
          error instanceof ApiError
            ? error.message
            : "Your located reflections could not be loaded.",
        );
      });
    return () => {
      requestRef.current += 1;
    };
  }, [api, reloadToken]);

  useEffect(() => {
    api
      .getPreferences()
      .then(setPreferences)
      .catch(() => setLocationError("Location preferences could not be loaded."));
  }, [api]);

  async function updateLocationMode(locationMode: Preferences["locationMode"]) {
    if (!preferences) return;
    setLocationSaving(true);
    setLocationError(null);
    try {
      const saved = await api.savePreferences({
        timezone: preferences.timezone,
        weekStartsOn: preferences.weekStartsOn,
        insightRangeDays: preferences.insightRangeDays,
        locationMode,
      });
      setPreferences(saved);
    } catch (error: unknown) {
      setLocationError(error instanceof ApiError ? error.message : "Location preferences could not be saved.");
    } finally {
      setLocationSaving(false);
    }
  }

  const selected = points.find((point) => point.sessionId === selectedId) ?? points[0] ?? null;
  const showMap = mapsConfigured() && !mapFailed && points.length > 0;

  function selectFromMap(sessionId: string) {
    setSelectedId(sessionId);
    const item = listRef.current?.querySelector<HTMLElement>(`[data-session-id="${sessionId}"]`);
    item?.scrollIntoView?.({ block: "nearest" });
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[980px] px-4 py-6 sm:px-6">
        <header>
          <h1 className="font-display text-on-surface text-2xl font-medium">Map</h1>
          <p className="text-on-surface-variant mt-1 text-sm">
            Reflections from the last 90 days where you chose to save a place. Only you can see
            this map.
          </p>
        </header>

        <section className="border-outline-variant bg-surface-container-low mt-5 rounded-card border p-4" aria-label="Location preferences">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-on-surface text-sm font-medium">Location on personal check-ins</h2>
              <p className="text-on-surface-variant mt-1 max-w-2xl text-xs">
                Off is the default. Choosing a mode sets the suggested precision; your browser only
                asks for location after you explicitly choose “Use my current location”.
              </p>
            </div>
            <label className="text-on-surface flex items-center gap-2 text-sm">
              <span className="sr-only">Location on captures</span>
              <select
                aria-label="Location on captures"
                value={preferences?.locationMode ?? "off"}
                disabled={!preferences || locationSaving}
                onChange={(event) =>
                  void updateLocationMode(event.target.value as Preferences["locationMode"])
                }
                className="border-outline-variant bg-surface text-on-surface focus-visible:outline-focus-ring rounded-field border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <option value="off">Off</option>
                <option value="approximate">Approximate place</option>
                <option value="exact">Exact place</option>
              </select>
            </label>
          </div>
          {locationError && <p className="text-error mt-2 text-xs" role="status">{locationError}</p>}
        </section>

        {!mapsConfigured() && points.length > 0 && (
          <div className="mt-4">
            <InlineAlert tone="info">
              The interactive map is not configured for this deployment, so your located
              reflections are shown as a list.
            </InlineAlert>
          </div>
        )}
        {mapFailed && (
          <div className="mt-4">
            <InlineAlert tone="warning">
              The map could not be loaded right now. Your located reflections are still available
              in the list below.
            </InlineAlert>
          </div>
        )}

        {status === "loading" ? (
          <div className="mt-6 space-y-3" role="status" aria-label="Loading located reflections">
            <Skeleton className="h-56 rounded-card" />
            <Skeleton className="h-16 rounded-card" />
            <Skeleton className="h-16 rounded-card" />
          </div>
        ) : status === "error" ? (
          <div className="mt-10">
            <EmptyState
              icon="refresh"
              title="The map could not be loaded"
              description={errorMessage ?? "Check your connection and try again in a moment."}
              actions={
                <Button icon="refresh" onClick={() => setReloadToken((token) => token + 1)}>
                  Try again
                </Button>
              }
            />
          </div>
        ) : points.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              icon="place"
              title="No located reflections yet"
              description="When you add a place to a reflection check-in, it appears here as a private pin you can revisit."
              actions={
                <Button icon="forum" onClick={() => void navigate("/app/journal")}>
                  Go to your journal
                </Button>
              }
            />
          </div>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            {showMap && selected && (
              <Suspense fallback={<Skeleton className="h-64 rounded-card sm:h-[360px]" />}>
                <MapCanvas
                  center={{ latitude: selected.latitude, longitude: selected.longitude }}
                  zoom={12}
                  markers={points.map((point) => ({
                    id: point.sessionId,
                    latitude: point.latitude,
                    longitude: point.longitude,
                    title: point.label,
                  }))}
                  selectedId={selected.sessionId}
                  onSelect={selectFromMap}
                  onLoadError={() => setMapFailed(true)}
                  className="border-outline-variant h-64 w-full overflow-hidden rounded-card border sm:h-[360px]"
                />
              </Suspense>
            )}

            <section aria-label="Located reflections" className={showMap ? "" : "lg:col-span-2"}>
              <ul ref={listRef} className="space-y-2">
                {points.map((point) => {
                  const isSelected = selected?.sessionId === point.sessionId;
                  return (
                    <li key={point.sessionId} data-session-id={point.sessionId}>
                      <div
                        className={`border-outline-variant rounded-card border p-3 ${
                          isSelected ? "bg-surface-container" : "bg-surface-container-low"
                        }`}
                        aria-current={isSelected ? "true" : undefined}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedId(point.sessionId)}
                          className="focus-visible:outline-focus-ring block w-full rounded-control text-left focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          <span className="text-on-surface block text-sm font-medium">
                            {point.sessionTitle}
                          </span>
                          <span className="text-on-surface-variant mt-0.5 block text-xs">
                            {point.label} · {formatDay(point.localDate)}
                            {point.precision === "approximate" ? " · approximate" : ""}
                          </span>
                        </button>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          {point.moodScore !== null ? (
                            <Chip icon="mood">Mood: {MOOD_LABELS[point.moodScore]}</Chip>
                          ) : (
                            <span />
                          )}
                          <Button
                            size="compact"
                            variant="text"
                            onClick={() =>
                              void navigate(
                                `/app/journal?session=${encodeURIComponent(point.sessionId)}`,
                              )
                            }
                          >
                            Open reflection
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

export default MapPage;
