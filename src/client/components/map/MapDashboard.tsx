import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { ApiClient } from "../../lib/api-client";
import { MaterialIcon } from "../MaterialIcon";
import type { User } from "firebase/auth";
import type { PersonalSignal } from "../../../shared/schemas";

interface LatLngLiteral {
  lat: number;
  lng: number;
}

interface GoogleMapsGlobal {
  google?: {
    maps?: {
      Map: new (element: HTMLElement, options: unknown) => unknown;
      marker?: {
        AdvancedMarkerElement: new (options: unknown) => {
          addListener: (event: string, handler: () => void) => void;
        };
      };
      Marker?: new (options: unknown) => {
        addListener: (event: string, handler: () => void) => void;
      };
    };
  };
}

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const globalWin = window as unknown as GoogleMapsGlobal;
    if (globalWin.google?.maps) {
      resolve();
      return;
    }
    const existing = document.getElementById("google-maps-js-sdk");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Maps SDK")));
      return;
    }
    const script = document.createElement("script");
    script.id = "google-maps-js-sdk";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&libraries=marker`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps SDK"));
    document.head.appendChild(script);
  });
}

type Props = { user: User; onNavigate: (path: string) => void };

export function MapDashboard({ user, onNavigate }: Props) {
  const api = useMemo(() => new ApiClient(() => user), [user]);
  const [signals, setSignals] = useState<PersonalSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSignal, setSelectedSignal] = useState<PersonalSignal | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<unknown>(null);

  const initGoogleMap = useCallback(async (locatedSignals: PersonalSignal[]) => {
    if (!mapRef.current) return;
    const envKey: unknown = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    const apiKey = typeof envKey === "string" ? envKey : "";
    if (!apiKey) return;

    try {
      await loadGoogleMapsScript(apiKey);
      const globalWin = window as unknown as GoogleMapsGlobal;
      const maps = globalWin.google?.maps;
      if (!maps || !mapRef.current) return;

      const center: LatLngLiteral =
        locatedSignals.length > 0 && locatedSignals[0].location
          ? { lat: locatedSignals[0].location.latitude, lng: locatedSignals[0].location.longitude }
          : { lat: 37.7749, lng: -122.4194 };

      const map = new maps.Map(mapRef.current, {
        center,
        zoom: 11,
        disableDefaultUI: true,
        zoomControl: true,
      });
      mapInstance.current = map;

      locatedSignals.forEach((signal) => {
        const loc = signal.location;
        if (loc) {
          const marker = maps.marker?.AdvancedMarkerElement
            ? new maps.marker.AdvancedMarkerElement({
                map,
                position: { lat: loc.latitude, lng: loc.longitude },
                title: loc.label,
              })
            : maps.Marker
            ? new maps.Marker({
                map,
                position: { lat: loc.latitude, lng: loc.longitude },
                title: loc.label,
              })
            : null;

          if (marker) {
            marker.addListener("click", () => {
              setSelectedSignal(signal);
            });
          }
        }
      });
    } catch {
      // Map loader fallback to OpenStreetMap
    }
  }, []);

  useEffect(() => {
    let live = true;
    api
      .request<{ signals: PersonalSignal[] }>("/personal/signals?limit=100")
      .then((res) => {
        if (live) {
          const located = res.signals.filter((s) => s.location !== null);
          setSignals(located);
          if (located.length > 0) setSelectedSignal(located[0]);
          setLoading(false);
          void initGoogleMap(located);
        }
      })
      .catch(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [api, initGoogleMap]);

  const activeLat = selectedSignal?.location?.latitude ?? 37.7749;
  const activeLng = selectedSignal?.location?.longitude ?? -122.4194;
  const osmEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${activeLng - 0.08}%2C${activeLat - 0.05}%2C${activeLng + 0.08}%2C${activeLat + 0.05}&layer=mapnik&marker=${activeLat}%2C${activeLng}`;

  return (
    <div className="flex h-screen w-screen flex-col bg-[#060d0b] text-[#e8f3ef]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[#16201d] px-6 py-4 z-10 bg-[#060d0b]">
        <div className="flex items-center gap-4">
          <button
            onClick={() => onNavigate("/journal")}
            className="flex items-center gap-2 text-slate-400 hover:text-white"
          >
            <MaterialIcon name="arrow_back" size={20} />
            <span className="text-sm font-medium">Back to Journal</span>
          </button>
          <div className="h-4 w-px bg-slate-700" />
          <h1 className="text-xl font-semibold">Location & Context Analytics</h1>
        </div>
        <div className="text-xs text-slate-400">
          <span className="text-teal-400 font-semibold">{signals.length}</span> Geotagged Check-ins
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 relative flex overflow-hidden">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[#060d0b] z-20">
            <MaterialIcon name="progress_activity" size={32} className="animate-spin text-teal-500" />
          </div>
        ) : (
          <>
            {/* Sidebar list */}
            <div className="w-full sm:w-80 lg:w-96 bg-[#0d1614] border-r border-[#16201d] overflow-y-auto p-4 flex flex-col gap-3 shrink-0">
              <div className="flex items-center justify-between pb-2 border-b border-[#16201d]">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Check-in Locations
                </h2>
                <span className="rounded bg-teal-500/10 px-2 py-0.5 text-[11px] font-semibold text-teal-300">
                  {signals.length} Places
                </span>
              </div>

              {signals.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  <MaterialIcon name="place" size={40} className="mx-auto mb-2 text-slate-600" />
                  <p className="text-sm">No geotagged signals yet.</p>
                  <p className="text-xs mt-1 text-slate-600">
                    Use "Check-in" in your journal to tag approximate or exact location coordinates.
                  </p>
                </div>
              ) : (
                signals.map((s) => {
                  const isSelected = selectedSignal?.sourceSessionId === s.sourceSessionId;
                  return (
                    <div
                      key={s.sourceSessionId}
                      onClick={() => setSelectedSignal(s)}
                      className={`p-4 rounded-xl border transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-[#16201d] border-teal-500/80 shadow-md shadow-teal-500/10"
                          : "bg-[#060d0b] border-[#2d3734] hover:border-teal-500/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <MaterialIcon name="place" size={16} className="text-teal-400 shrink-0" />
                          <span className="text-sm font-medium text-white truncate">
                            {s.location?.label || "Tagged Location"}
                          </span>
                        </div>
                        {s.moodScore && (
                          <span className="rounded bg-teal-900/40 px-2 py-0.5 text-xs font-semibold text-teal-300 shrink-0">
                            Mood: {s.moodScore}/5
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] font-mono text-slate-400">
                        {s.location?.latitude.toFixed(4)}°, {s.location?.longitude.toFixed(4)}°
                      </div>

                      <div className="mt-2 flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-[#16201d]">
                        <span>{s.localDate}</span>
                        {s.location?.precision && (
                          <span className="capitalize text-[11px] text-slate-500">
                            {s.location.precision} precision
                          </span>
                        )}
                      </div>

                      {s.note && (
                        <p className="text-xs text-slate-300 mt-2 bg-[#060d0b]/80 p-2 rounded border border-[#16201d]">
                          "{s.note}"
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Map Canvas / Viewer */}
            <div className="flex-1 bg-[#060d0b] relative flex flex-col">
              {import.meta.env.VITE_GOOGLE_MAPS_API_KEY ? (
                <div className="h-full w-full" ref={mapRef} />
              ) : (
                /* Interactive OpenStreetMap Fallback */
                <div className="h-full w-full relative">
                  <iframe
                    title="OpenStreetMap Location"
                    className="w-full h-full border-0"
                    src={osmEmbedUrl}
                  />

                  {selectedSignal && (
                    <div className="absolute bottom-6 left-6 right-6 lg:left-12 lg:right-auto lg:max-w-md rounded-2xl border border-teal-500/40 bg-[#0d1614]/95 backdrop-blur-md p-4 shadow-2xl">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <MaterialIcon name="place" size={18} className="text-teal-400" />
                          <h3 className="text-sm font-semibold text-white">
                            {selectedSignal.location?.label}
                          </h3>
                        </div>
                        <span className="rounded bg-teal-500/20 px-2 py-0.5 text-xs font-semibold text-teal-300">
                          {selectedSignal.localDate}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-slate-400">
                        Lat: {selectedSignal.location?.latitude.toFixed(6)} | Lng: {selectedSignal.location?.longitude.toFixed(6)}
                      </p>
                      {selectedSignal.emotions.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {selectedSignal.emotions.map((emo) => (
                            <span
                              key={emo}
                              className="rounded-md bg-teal-900/30 px-2 py-0.5 text-[11px] text-teal-200"
                            >
                              {emo}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
