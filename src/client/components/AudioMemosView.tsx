import { useState, useEffect } from "react";
import { Mic, Square, Volume2 } from "lucide-react";
import type { JournalEntry } from "../data/mockData";

interface AudioMemosViewProps {
  entries: JournalEntry[];
  onSelectEntry: (id: string) => void;
  onNewAudioReflection: (title: string, transcript: string) => void;
}

export function AudioMemosView({ entries, onSelectEntry, onNewAudioReflection }: AudioMemosViewProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(() => {
      setRecordingSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isRecording]);

  function handleStartRecording() {
    setRecordingSeconds(0);
    setIsRecording(true);
  }

  function handleStopRecording() {
    setIsRecording(false);
    // Simulate AI speech-to-text transcript creation
    const sampleTranscript =
      "I was walking near the park this evening thinking about the decision we discussed earlier. It feels like simplifying our priorities is the only path that preserves mental clarity and avoids unnecessary friction.";
    onNewAudioReflection(`Voice Memo — ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`, sampleTranscript);
  }

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-[#fafbfc] p-6 sm:p-10 text-slate-800 transition-colors dark:bg-[#0b101b] dark:text-slate-100">
      <div className="mx-auto max-w-4xl w-full">
        <div className="flex items-center justify-between border-b border-slate-200/80 pb-4 dark:border-slate-800/80">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
              <Mic className="h-4 w-4" />
              <span>Voice Journaling</span>
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              Audio Reflections
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Speak your thoughts naturally with instant AI transcription and semantic synthesis
            </p>
          </div>
        </div>

        {/* Audio Recording Live Studio Card */}
        <div className="mt-6 rounded-3xl border border-sky-500/20 bg-linear-to-br from-sky-500/10 via-white to-sky-500/5 p-6 sm:p-8 shadow-md dark:from-sky-950/40 dark:via-slate-900 dark:to-slate-900">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={isRecording ? handleStopRecording : handleStartRecording}
                className={`relative flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg transition-all ${
                  isRecording
                    ? "bg-red-500 hover:bg-red-600 animate-pulse"
                    : "bg-sky-600 hover:bg-sky-500 hover:scale-105"
                }`}
              >
                {isRecording ? <Square className="h-6 w-6" /> : <Mic className="h-7 w-7" />}
              </button>

              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {isRecording ? "Listening & Transcribing..." : "Record New Voice Reflection"}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isRecording
                    ? `Recording in progress • ${formatTimer(recordingSeconds)}`
                    : "Tap microphone to record an unstructured stream of consciousness"}
                </p>
              </div>
            </div>

            {isRecording && (
              <div className="flex items-center gap-1.5 h-10 px-4 rounded-xl bg-red-50 border border-red-200/80 dark:bg-red-950/40 dark:border-red-900/60">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
                <span className="font-mono text-xs font-bold text-red-600 dark:text-red-400">
                  {formatTimer(recordingSeconds)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Previous Voice Entries */}
        <div className="mt-10">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Recorded Memos & Reflections
          </h2>

          <div className="mt-4 space-y-3">
            {entries.slice(0, 4).map((entry) => (
              <div
                key={entry.id}
                onClick={() => onSelectEntry(entry.id)}
                className="group flex cursor-pointer items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs hover:border-sky-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 transition-all"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-300">
                    <Volume2 className="h-5 w-5" />
                  </div>

                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-bold text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                      {entry.title}
                    </h4>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {entry.body.slice(0, 80)}...
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span>
                    {new Date(entry.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
