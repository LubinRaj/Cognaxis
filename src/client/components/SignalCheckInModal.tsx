import { useState } from "react";
import { MaterialIcon } from "./MaterialIcon";
import type { PersonalSignal, EmotionLabel, UpsertSignalInput, PersonalSignalLocation } from "../../shared/schemas";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  signal: PersonalSignal | null;
  onSave: (input: UpsertSignalInput) => Promise<void>;
  isBusy: boolean;
};

const EMOTIONS: EmotionLabel[] = [
  "calm", "hopeful", "focused", "energized",
  "grateful", "content", "uncertain", "tired",
  "stressed", "frustrated", "sad", "overwhelmed"
];

export function SignalCheckInModal({ isOpen, onClose, signal, onSave, isBusy }: Props) {
  if (!isOpen) return null;

  return (
    <SignalCheckInForm
      key={signal?.sourceSessionId ?? signal?.capturedAt ?? "new"}
      onClose={onClose}
      signal={signal}
      onSave={onSave}
      isBusy={isBusy}
    />
  );
}

function SignalCheckInForm({
  onClose,
  signal,
  onSave,
  isBusy,
}: Omit<Props, "isOpen">) {
  const [moodScore, setMoodScore] = useState<(1 | 2 | 3 | 4 | 5) | null>(
    () => (signal?.moodScore as (1 | 2 | 3 | 4 | 5) | null) ?? null,
  );
  const [energyScore, setEnergyScore] = useState<(1 | 2 | 3 | 4 | 5) | null>(
    () => (signal?.energyScore as (1 | 2 | 3 | 4 | 5) | null) ?? null,
  );
  const [emotions, setEmotions] = useState<EmotionLabel[]>(() => signal?.emotions ?? []);
  const [note, setNote] = useState(() => signal?.note ?? "");
  const [location, setLocation] = useState<PersonalSignalLocation | null>(() => signal?.location ?? null);
  const [locating, setLocating] = useState(false);

  function toggleEmotion(emotion: EmotionLabel) {
    setEmotions(curr => 
      curr.includes(emotion)
        ? curr.filter(e => e !== emotion)
        : curr.length < 5 ? [...curr, emotion] : curr
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const d = new Date();
    // basic local date yyyy-mm-dd
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    
    await onSave({
      moodScore,
      energyScore,
      emotions,
      note: note.trim() || null,
      location,
      localDate: `${y}-${m}-${day}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    onClose();
  }

  function handleAddLocation() {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          placeId: null,
          label: "Approximate Location", // Mock reverse geocode
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          precision: "approximate"
        });
        setLocating(false);
      },
      () => {
        alert("Unable to retrieve your location");
        setLocating(false);
      }
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-[#2d3734] bg-[#0d1614] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#2d3734] px-6 py-4">
          <h2 className="text-lg font-medium text-[#e8f3ef]">Session Check-in</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-[#1f2b27] hover:text-white"
          >
            <MaterialIcon name="close" />
          </button>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="p-6 space-y-8 text-[#e8f3ef]">
          {/* Mood Slider */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-300 flex justify-between">
              <span>Mood</span>
              <span className="text-teal-400">{moodScore ? `${moodScore} / 5` : "Not set"}</span>
            </label>
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={moodScore || 3}
              onChange={(e) => setMoodScore(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
              className="w-full accent-teal-500"
            />
            <div className="flex justify-between text-xs text-slate-500 font-medium">
              <span>Negative</span>
              <span>Neutral</span>
              <span>Positive</span>
            </div>
          </div>

          {/* Energy Slider */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-300 flex justify-between">
              <span>Energy</span>
              <span className="text-teal-400">{energyScore ? `${energyScore} / 5` : "Not set"}</span>
            </label>
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={energyScore || 3}
              onChange={(e) => setEnergyScore(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
              className="w-full accent-teal-500"
            />
            <div className="flex justify-between text-xs text-slate-500 font-medium">
              <span>Depleted</span>
              <span>Neutral</span>
              <span>High</span>
            </div>
          </div>

          {/* Emotions */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-300 flex justify-between">
              <span>Emotions (max 5)</span>
              <span className="text-slate-500">{emotions.length} / 5</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {EMOTIONS.map(emotion => {
                const active = emotions.includes(emotion);
                return (
                  <button
                    key={emotion}
                    type="button"
                    onClick={() => toggleEmotion(emotion)}
                    disabled={!active && emotions.length >= 5}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                      active
                        ? "bg-teal-500/20 text-teal-300 border border-teal-500/50"
                        : "bg-[#16201d] text-slate-400 border border-[#2d3734] hover:bg-[#1f2b27] disabled:opacity-50"
                    }`}
                  >
                    {emotion}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional Note */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Context (optional)</label>
            <input
              type="text"
              maxLength={280}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What's influencing this?"
              className="w-full rounded-lg border border-[#2d3734] bg-[#060d0b] px-4 py-2 text-sm text-[#e8f3ef] placeholder:text-slate-600 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          {/* Location */}
          <div className="space-y-2 border-t border-[#16201d] pt-4">
            <label className="text-sm font-medium text-slate-300 flex justify-between items-center">
              <span>Location</span>
              {location && (
                <button type="button" onClick={() => setLocation(null)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
              )}
            </label>
            {!location ? (
              <button type="button" onClick={handleAddLocation} disabled={locating} className="flex w-full items-center justify-center gap-2 rounded-lg border border-teal-500/30 bg-teal-500/10 px-4 py-2 text-sm font-medium text-teal-300 hover:bg-teal-500/20 transition-colors disabled:opacity-50">
                <MaterialIcon name={locating ? "progress_activity" : "my_location"} size={16} className={locating ? "animate-spin" : ""} />
                {locating ? "Finding location..." : "Add Location (Approximate)"}
              </button>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-[#2d3734] bg-[#16201d] px-4 py-3 text-sm text-slate-300">
                <MaterialIcon name="place" size={18} className="text-teal-400" />
                <span className="flex-1">{location.label}</span>
                <span className="text-xs text-slate-500">[{location.latitude.toFixed(2)}, {location.longitude.toFixed(2)}]</span>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-[#2d3734]">
            <button
              type="button"
              onClick={onClose}
              disabled={isBusy}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isBusy || (moodScore === null && energyScore === null && emotions.length === 0)}
              className="rounded-lg bg-teal-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-500 disabled:opacity-50 flex items-center gap-2"
            >
              {isBusy && <MaterialIcon name="progress_activity" size={16} className="animate-spin" />}
              Save Check-in
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
