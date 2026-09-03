import { useMemo, useState, useEffect } from "react";
import { MaterialIcon } from "../MaterialIcon";
import { ApiClient } from "../../lib/api-client";
import { type User } from "firebase/auth";
import type { PersonalSignal, PersonalInsight } from "../../../shared/schemas";

function formatDateLabel(isoDate: string): string {
  try {
    const parts = isoDate.split("-").map(Number);
    if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) return isoDate;
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return isoDate;
  }
}

function getPeriodKey(d: Date, type: "day" | "week"): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  if (type === "day") {
    return `${year}-${month}-${day}`;
  }
  const weekNum = Math.ceil((d.getDate() + 6 - d.getDay()) / 7);
  return `week_${year}-W${weekNum}`;
}

type Props = {
  user: User;
  onNavigate: (path: string) => void;
};

export function InsightsDashboard({ user, onNavigate }: Props) {
  const api = useMemo(() => new ApiClient(() => user), [user]);
  const [signals, setSignals] = useState<PersonalSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Period state
  const [periodType, setPeriodType] = useState<"day" | "week">("week");
  const [generating, setGenerating] = useState(false);
  const [currentInsight, setCurrentInsight] = useState<PersonalInsight | null>(null);

  useEffect(() => {
    let live = true;
    api
      .request<{ signals: PersonalSignal[] }>("/personal/signals?limit=50")
      .then((res) => {
        if (live) {
          setSignals(res.signals.sort((a, b) => a.localDate.localeCompare(b.localDate)));
        }
      })
      .catch((err) => {
        if (live) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [api]);

  // Load existing insight for current period if available
  useEffect(() => {
    const d = new Date();
    const periodKey = getPeriodKey(d, periodType);

    api
      .request<PersonalInsight>(`/personal/insights/${periodType}/${periodKey}`)
      .then((res) => {
        setCurrentInsight(res);
      })
      .catch(() => {
        setCurrentInsight(null);
      });
  }, [api, periodType]);

  const moodData = useMemo(() => {
    return signals
      .filter((s) => s.moodScore !== null)
      .map((s) => ({
        date: formatDateLabel(s.localDate),
        mood: s.moodScore as number,
        energy: s.energyScore as number,
      }));
  }, [signals]);

  const emotionsData = useMemo(() => {
    const counts: Record<string, number> = {};
    signals.forEach((s) => {
      s.emotions.forEach((e) => {
        counts[e] = (counts[e] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [signals]);

  async function handleGenerateSynthesis() {
    setGenerating(true);
    const d = new Date();
    const periodKey = getPeriodKey(d, periodType);

    try {
      const res = await api.request<PersonalInsight>(
        `/personal/insights/${periodType}/${periodKey}/generate`,
        { method: "POST" },
      );
      setCurrentInsight(res);
    } catch (err) {
      alert("Failed to generate synthesis: " + String(err));
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#060d0b]">
        <MaterialIcon name="progress_activity" size={32} className="animate-spin text-teal-500" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-[#060d0b] text-[#e8f3ef]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[#16201d] px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => onNavigate("/journal")}
            className="flex items-center gap-2 text-slate-400 hover:text-white"
          >
            <MaterialIcon name="arrow_back" size={20} />
            <span className="text-sm font-medium">Back to Journal</span>
          </button>
          <div className="h-4 w-px bg-slate-700" />
          <h1 className="text-xl font-semibold">Personal Insights & Intelligence</h1>
        </div>

        {/* Period Selector Toggle */}
        <div className="flex items-center rounded-xl border border-[#2d3734] bg-[#0d1614] p-1">
          <button
            onClick={() => setPeriodType("day")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              periodType === "day"
                ? "bg-teal-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Daily Cadence
          </button>
          <button
            onClick={() => setPeriodType("week")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              periodType === "week"
                ? "bg-teal-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Weekly Synthesis
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 lg:p-10">
        <div className="mx-auto max-w-5xl space-y-8">
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
              {error}
            </div>
          )}

          {signals.length === 0 ? (
            <div className="rounded-2xl border border-[#2d3734] bg-[#0d1614] p-12 text-center">
              <MaterialIcon name="auto_graph" size={48} className="mx-auto mb-4 text-slate-600" />
              <h2 className="text-lg font-medium text-white mb-2">No signals captured yet</h2>
              <p className="text-slate-400 max-w-md mx-auto mb-6">
                Log quick mood & energy check-ins from the top bar or session menu to unlock longitudinal trends and AI intelligence syntheses.
              </p>
              <button
                onClick={() => onNavigate("/journal")}
                className="rounded-xl bg-teal-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-teal-500"
              >
                Go to Journal Check-in
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Mood & Energy Trend */}
                <div className="col-span-1 rounded-2xl border border-[#2d3734] bg-[#0d1614] p-6 lg:col-span-2">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-sm font-medium text-slate-400">
                      Mood & Vitality Trajectory (Recent Check-ins)
                    </h3>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="flex items-center gap-1.5 text-teal-400">
                        <span className="h-2.5 w-2.5 rounded-full bg-teal-500" /> Mood (1-5)
                      </span>
                      <span className="flex items-center gap-1.5 text-amber-400">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Energy (1-5)
                      </span>
                    </div>
                  </div>
                  <div className="h-[280px] w-full flex flex-col justify-end">
                    {moodData.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-xs text-slate-500">
                        No mood data points yet.
                      </div>
                    ) : (
                      <svg viewBox="0 0 600 220" className="h-full w-full overflow-visible">
                        {/* Horizontal Grid lines for 1 to 5 */}
                        {[1, 2, 3, 4, 5].map((val) => {
                          const y = 190 - ((val - 1) / 4) * 160;
                          return (
                            <g key={val}>
                              <line x1="35" y1={y} x2="590" y2={y} stroke="#16201d" strokeDasharray="3 3" />
                              <text x="20" y={y + 4} fill="#475569" fontSize="11" textAnchor="middle">
                                {val}
                              </text>
                            </g>
                          );
                        })}

                        {/* Polylines for Mood and Energy */}
                        {(() => {
                          const points = moodData.map((d, i) => {
                            const x = moodData.length > 1
                              ? 50 + (i / (moodData.length - 1)) * 530
                              : 300;
                            const yMood = 190 - ((Math.min(Math.max(d.mood, 1), 5) - 1) / 4) * 160;
                            const yEnergy = 190 - ((Math.min(Math.max(d.energy, 1), 5) - 1) / 4) * 160;
                            return { x, yMood, yEnergy, date: d.date, mood: d.mood, energy: d.energy };
                          });

                          const moodPath = points.map((p) => `${p.x},${p.yMood}`).join(" ");
                          const energyPath = points.map((p) => `${p.x},${p.yEnergy}`).join(" ");

                          return (
                            <>
                              <polyline
                                fill="none"
                                stroke="#14b8a6"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                points={moodPath}
                              />
                              <polyline
                                fill="none"
                                stroke="#f59e0b"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                points={energyPath}
                              />
                              {points.map((p, idx) => (
                                <g key={idx}>
                                  <circle cx={p.x} cy={p.yMood} r="4" fill="#14b8a6" />
                                  <circle cx={p.x} cy={p.yEnergy} r="4" fill="#f59e0b" />
                                  <text
                                    x={p.x}
                                    y={212}
                                    fill="#475569"
                                    fontSize="10"
                                    textAnchor="middle"
                                  >
                                    {p.date}
                                  </text>
                                </g>
                              ))}
                            </>
                          );
                        })()}
                      </svg>
                    )}
                  </div>
                </div>

                {/* Top Emotions */}
                <div className="rounded-2xl border border-[#2d3734] bg-[#0d1614] p-6">
                  <h3 className="mb-6 text-sm font-medium text-slate-400">Emotional Frequency</h3>
                  <div className="h-[230px] w-full flex flex-col justify-center">
                    {emotionsData.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-xs text-slate-500">
                        No emotion tags recorded yet.
                      </div>
                    ) : (
                      <div className="space-y-3.5">
                        {emotionsData.map((item, index) => {
                          const maxCount = emotionsData[0]?.count || 1;
                          const pct = Math.round((item.count / maxCount) * 100);
                          return (
                            <div key={item.name} className="flex items-center gap-3">
                              <span className="w-24 truncate text-xs font-medium text-slate-300">
                                {item.name}
                              </span>
                              <div className="h-3 flex-1 rounded-full bg-[#16201d] overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    index === 0 ? "bg-teal-500" : "bg-teal-600/70"
                                  }`}
                                  style={{ width: `${Math.max(pct, 8)}%` }}
                                />
                              </div>
                              <span className="w-6 text-right font-mono text-xs text-slate-400">
                                {item.count}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Check-in Cadence & Generator Card */}
                <div className="rounded-2xl border border-[#2d3734] bg-gradient-to-br from-[#0d1614] to-teal-950/30 p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-900/40 text-teal-400">
                        <MaterialIcon name="auto_awesome" size={20} />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-white">
                          AI Intelligence Synthesis
                        </h3>
                        <p className="text-xs text-slate-400">
                          Period: {periodType === "day" ? "Daily" : "Weekly"} Analysis
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-300 mt-3 leading-relaxed">
                      Aggregates your mood, energy, and session patterns below the model layer, creating structured insights with zero data leak to organizational workspaces.
                    </p>
                  </div>

                  <div className="mt-6 flex items-center justify-between border-t border-[#16201d] pt-4">
                    <div className="text-xs text-slate-400">
                      <span className="text-base font-semibold text-teal-400 mr-1">{signals.length}</span>
                      Signals captured
                    </div>
                    <button
                      onClick={() => { void handleGenerateSynthesis(); }}
                      disabled={generating}
                      className="flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2 text-sm font-medium text-white hover:bg-teal-500 shadow-lg shadow-teal-600/20 disabled:opacity-50"
                    >
                      {generating ? (
                        <>
                          <MaterialIcon name="progress_activity" size={16} className="animate-spin" />
                          Analyzing…
                        </>
                      ) : (
                        <>
                          <MaterialIcon name="auto_awesome" size={16} />
                          {currentInsight ? "Regenerate Synthesis" : "Generate Synthesis"}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Render Structured AI Narrative if available */}
              {currentInsight && (
                <div className="rounded-2xl border border-teal-500/30 bg-[#0d1614] p-6 lg:p-8 space-y-6">
                  <div className="flex items-start justify-between border-b border-[#2d3734] pb-4">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-semibold text-teal-400 uppercase tracking-wider mb-1">
                        <MaterialIcon name="auto_awesome" size={16} />
                        {currentInsight.narrative.title}
                      </div>
                      <p className="text-sm text-slate-300 mt-1">{currentInsight.narrative.overview}</p>
                    </div>
                    <span className="rounded-lg bg-teal-950 border border-teal-500/30 px-2.5 py-1 text-[11px] font-mono text-teal-300">
                      {currentInsight.model}
                    </span>
                  </div>

                  {/* Patterns */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                      Detected Behavioral Patterns
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {currentInsight.narrative.patterns.map((p, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-[#2d3734] bg-[#060d0b] p-4 flex flex-col justify-between"
                        >
                          <p className="text-sm text-white mb-2">{p.observation}</p>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400">
                            <span>Confidence:</span>
                            <span
                              className={`font-semibold uppercase ${
                                p.confidence === "high"
                                  ? "text-emerald-400"
                                  : p.confidence === "medium"
                                  ? "text-amber-400"
                                  : "text-slate-400"
                              }`}
                            >
                              {p.confidence}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Highlights & Next Steps */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                    <div>
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                        Key Highlights
                      </h4>
                      <ul className="space-y-2 text-sm text-slate-300">
                        {currentInsight.narrative.highlights.map((h, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <MaterialIcon name="check_circle" size={16} className="text-teal-400 shrink-0 mt-0.5" />
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                        Recommended Next Steps
                      </h4>
                      <ul className="space-y-2 text-sm text-slate-300">
                        {currentInsight.narrative.nextSteps.map((s, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <MaterialIcon name="arrow_forward" size={16} className="text-amber-400 shrink-0 mt-0.5" />
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="border-t border-[#16201d] pt-4 text-[11px] text-slate-500 flex items-center justify-between">
                    <span>{currentInsight.narrative.disclaimer}</span>
                    <span>Computed at: {new Date(currentInsight.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
