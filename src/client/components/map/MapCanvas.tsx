/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import { loadMapsLibrary } from "../../lib/maps-loader";

export type MapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
};

export type MapCanvasProps = {
  center: { latitude: number; longitude: number };
  zoom: number;
  markers: MapMarker[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onMapClick?: (latitude: number, longitude: number) => void;
  onLoadError: () => void;
  className?: string;
};

type TrackedMarker = {
  marker: google.maps.Marker;
  listener: google.maps.MapsEventListener;
};

// A thin imperative bridge to the Maps JavaScript API. The surrounding page always renders the
// synchronized accessible list, so this canvas is purely additive and hidden from screen readers.
export function MapCanvas({
  center,
  zoom,
  markers,
  selectedId,
  onSelect,
  onMapClick,
  onLoadError,
  className = "",
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef(new Map<string, TrackedMarker>());
  const mapListenersRef = useRef<google.maps.MapsEventListener[]>([]);
  const callbacksRef = useRef({ onSelect, onMapClick, onLoadError });
  // The library loads asynchronously; effects that need the map instance key off this flag so
  // markers and center supplied before the load completes still apply once it does.
  const [mapReady, setMapReady] = useState(false);
  useEffect(() => {
    callbacksRef.current = { onSelect, onMapClick, onLoadError };
  });

  useEffect(() => {
    let cancelled = false;
    const markerStore = markersRef.current;
    const mapListeners = mapListenersRef.current;

    async function initialise() {
      try {
        const mapsLibrary = await loadMapsLibrary();
        if (cancelled || !containerRef.current) return;
        const map = new mapsLibrary.Map(containerRef.current, {
          center: { lat: center.latitude, lng: center.longitude },
          zoom,
          clickableIcons: false,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });
        mapListeners.push(
          map.addListener("click", (event: google.maps.MapMouseEvent) => {
            const position = event.latLng;
            if (position) callbacksRef.current.onMapClick?.(position.lat(), position.lng());
          }),
        );
        mapRef.current = map;
        setMapReady(true);
      } catch {
        if (!cancelled) callbacksRef.current.onLoadError();
      }
    }

    void initialise();
    return () => {
      cancelled = true;
      for (const listener of mapListeners.splice(0)) listener.remove();
      for (const tracked of markerStore.values()) {
        tracked.listener.remove();
        tracked.marker.setMap(null);
      }
      markerStore.clear();
      mapRef.current = null;
    };
    // The map is created once; center/zoom afterwards are controlled through pans below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map) map.panTo({ lat: center.latitude, lng: center.longitude });
  }, [center.latitude, center.longitude, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || typeof google === "undefined") return;

    const existing = markersRef.current;
    const nextIds = new Set(markers.map((marker) => marker.id));
    for (const [id, tracked] of existing) {
      if (!nextIds.has(id)) {
        tracked.listener.remove();
        tracked.marker.setMap(null);
        existing.delete(id);
      }
    }
    for (const marker of markers) {
      let tracked = existing.get(marker.id);
      if (!tracked) {
        const instance = new google.maps.Marker({
          map,
          position: { lat: marker.latitude, lng: marker.longitude },
          title: marker.title,
        });
        const listener = instance.addListener("click", () =>
          callbacksRef.current.onSelect?.(marker.id),
        );
        tracked = { marker: instance, listener };
        existing.set(marker.id, tracked);
      } else {
        tracked.marker.setPosition({ lat: marker.latitude, lng: marker.longitude });
        tracked.marker.setTitle(marker.title);
      }
      const instance = tracked.marker;
      instance.setAnimation(marker.id === selectedId ? google.maps.Animation.BOUNCE : null);
      if (marker.id === selectedId) {
        window.setTimeout(() => instance.setAnimation(null), 700);
      }
    }
  }, [markers, selectedId, mapReady]);

  return <div ref={containerRef} aria-hidden="true" className={className} />;
}
