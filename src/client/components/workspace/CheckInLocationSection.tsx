import { lazy, Suspense, useId, useState } from "react";
import type { PersonalSignalLocation } from "../../../shared/schemas";
import { mapsConfigured } from "../../lib/maps-loader";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";

const MapCanvas = lazy(() =>
  import("../map/MapCanvas").then((module) => ({ default: module.MapCanvas })),
);

type GeolocationStatus = "idle" | "requesting" | "denied" | "unavailable";

export type CheckInLocationSectionProps = {
  location: PersonalSignalLocation | null;
  disabled: boolean;
  onChange: (location: PersonalSignalLocation | null) => void;
};

export function CheckInLocationSection({
  location,
  disabled,
  onChange,
}: CheckInLocationSectionProps) {
  const [status, setStatus] = useState<GeolocationStatus>("idle");
  const [mapFailed, setMapFailed] = useState(false);
  const labelId = useId();

  function requestCurrentLocation() {
    if (!("geolocation" in navigator)) {
      setStatus("unavailable");
      return;
    }
    setStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStatus("idle");
        onChange({
          placeId: null,
          label: location?.label ?? "",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          precision: location?.precision ?? "approximate",
        });
      },
      (error) => {
        setStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  return (
    <fieldset disabled={disabled}>
      <legend className="text-on-surface text-sm font-medium">
        Location
        <span className="text-on-surface-variant ml-1 font-normal">(optional)</span>
      </legend>

      {location === null ? (
        <div className="mt-2">
          <p className="text-on-surface-variant text-sm">
            If you add a place, Cognaxis stores only the coordinates and the label you approve,
            together with this check-in. Nothing is requested until you ask.
          </p>
          <div className="mt-2">
            <Button
              size="compact"
              variant="outlined"
              icon="my_location"
              loading={status === "requesting"}
              loadingLabel="Locating…"
              onClick={requestCurrentLocation}
            >
              Use my current location
            </Button>
          </div>
          {status === "denied" && (
            <p className="text-on-surface-variant mt-2 text-sm" role="status">
              Location permission was declined. Your check-in works fine without a place.
            </p>
          )}
          {status === "unavailable" && (
            <p className="text-on-surface-variant mt-2 text-sm" role="status">
              Your location could not be determined right now. Your check-in works fine without a
              place.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          <p className="text-on-surface text-sm" data-testid="location-coordinates">
            Selected point: {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
          </p>

          {mapsConfigured() && !mapFailed && (
            <Suspense fallback={<div className="bg-surface-container-high h-36 rounded-card" />}>
              <MapCanvas
                center={{ latitude: location.latitude, longitude: location.longitude }}
                zoom={14}
                markers={[
                  {
                    id: "selection",
                    latitude: location.latitude,
                    longitude: location.longitude,
                    title: "Selected place",
                  },
                ]}
                onMapClick={(latitude, longitude) =>
                  onChange({ ...location, latitude, longitude })
                }
                onLoadError={() => setMapFailed(true)}
                className="h-36 w-full overflow-hidden rounded-card"
              />
            </Suspense>
          )}
          {mapFailed && (
            <InlineAlert tone="info">
              The map preview could not be loaded. You can still save the selected point.
            </InlineAlert>
          )}

          <div>
            <label htmlFor={labelId} className="text-on-surface text-sm font-medium">
              Place label
            </label>
            <input
              id={labelId}
              type="text"
              value={location.label}
              maxLength={160}
              onChange={(event) => onChange({ ...location, label: event.target.value })}
              placeholder="How you want to remember this place"
              className="border-outline-variant bg-surface text-on-surface placeholder:text-on-surface-variant focus-visible:outline-focus-ring mt-1 w-full rounded-field border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            />
          </div>

          <fieldset>
            <legend className="text-on-surface text-sm font-medium">Stored precision</legend>
            <div className="mt-1 flex flex-col gap-1">
              <label className="text-on-surface flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="location-precision"
                  checked={location.precision === "approximate"}
                  onChange={() => onChange({ ...location, precision: "approximate" })}
                />
                Approximate — rounded to about a kilometre (recommended)
              </label>
              <label className="text-on-surface flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="location-precision"
                  checked={location.precision === "exact"}
                  onChange={() => onChange({ ...location, precision: "exact" })}
                />
                Exact — the precise coordinates shown above
              </label>
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-2">
            <Button
              size="compact"
              variant="outlined"
              icon="my_location"
              loading={status === "requesting"}
              loadingLabel="Locating…"
              onClick={requestCurrentLocation}
            >
              Update to current location
            </Button>
            <Button size="compact" variant="text" onClick={() => onChange(null)}>
              Remove location
            </Button>
          </div>
        </div>
      )}
    </fieldset>
  );
}
