import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import type { User } from "firebase/auth";
import { periodKeyFor, type PeriodType } from "../../shared/periods";
import type { DashboardRangeDays, PersonalInsight } from "../../shared/schemas";
import { useAuth } from "../auth/AuthProvider";
import { ApiClient, ApiError, type DashboardView } from "../lib/api-client";
import { browserTimeZone, EMOTION_DISPLAY } from "../workspace/check-in";
import { InsightCard } from "../components/insights/InsightCard";
import { AccessibleLineChart } from "../components/ui/AccessibleLineChart";
import { Button } from "../components/ui/Button";
import { Chip } from "../components/ui/Chip";
import { EmptyState } from "../components/ui/EmptyState";
import { InlineAlert } from "../components/ui/InlineAlert";
import { Skeleton } from "../components/ui/Skeleton";
import { usePageTitle } from "../shell/use-page-title";

const RANGES: DashboardRangeDays[] = [7, 30, 90];

type DashboardStatus = "loading" | "refreshing" | "ready" | "error";

function formatDelta(delta: number | null): string | null {
  if (delta === null) return null;
  if (delta === 0) return "Same as the previous period";
  const direction = delta > 0 ? "up" : "down";
  return `${direction} ${Math.abs(delta).toFixed(1)} from the previous period`;
}

function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string | null;
}) {
  return (
    <div className="border-outline-variant bg-surface-container-low rounded-card border p-4">
      <p className="text-on-surface-variant text-xs font-medium">{label}</p>
      <p className="text-on-surface mt-1 text-2xl font-semibold">{value}</p>
      {detail && <p className="text-on-surface-variant mt-1 text-xs">{detail}</p>}
    </div>
  );
}

export function InsightsPage() {
  const user = useOutletContext<User>();
  const navigate = useNavigate();
  const { reportSessionExpired, reportEmailVerificationRequired } = useAuth();
  usePageTitle("Insights · Cognaxis");

  const api = useMemo(
    () =>
      new ApiClient(() => user, {
        onSessionExpired: reportSessionExpired,
        onEmailVerificationRequired: reportEmailVerificationRequired,
      }),
    [user, reportSessionExpired, reportEmailVerificationRequired],
  );

  const [rangeDays, setRangeDays] = useState<DashboardRangeDays>(7);
  const [view, setView] = useState<DashboardView | null>(null);
  const [status, setStatus] = useState<DashboardStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [timezoneSaving, setTimezoneSaving] = useState(false);
  const [generationPending, setGenerationPending] = useState<PeriodType | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const requestRef = useRef(0);
  const initializedRef = useRef(false);

  const dashboard = view?.dashboard ?? null;

  const load = useCallback(
    (range: DashboardRangeDays) => {
      const requestId = ++requestRef.current;
      setStatus((current) => (current === "ready" || current === "refreshing" ? "refreshing" : "loading"));
      setErrorMessage(null);
      api
        .getDashboardView(range)
        .then((loaded) => {
          if (requestRef.current !== requestId) return;
          setView(loaded);
          setStatus("ready");
        })
        .catch((error: unknown) => {
          if (requestRef.current !== requestId) return;
          setStatus("error");
          setErrorMessage(
            error instanceof ApiError
              ? error.message
              : "Your insights could not be loaded right now.",
          );
        });
    },
    [api],
  );

  const applyInsight = useCallback((insight: PersonalInsight) => {
    setView((current) => {
      if (!current) return current;
      const others = current.recentInsights.filter(
        (entry) => entry.periodKey !== insight.periodKey,
      );
      return { ...current, recentInsights: [insight, ...others] };
    });
  }, []);

  async function generateFor(periodType: PeriodType, periodKey: string, regenerate: boolean) {
    setGenerationPending(periodType);
    setErrorMessage(null);
    try {
      const result = await api.generateInsight(periodType, periodKey, {
        requestId: crypto.randomUUID(),
        regenerate,
      });
      applyInsight(result.insight);
      setAnnouncement(
        result.outcome === "reused"
          ? "This recap is already up to date."
          : periodType === "day"
            ? "Daily recap ready."
            : "Weekly insight ready.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : "The recap could not be created right now. Please try again.",
      );
    } finally {
      setGenerationPending(null);
    }
  }

  async function removeInsight(insight: PersonalInsight) {
    setErrorMessage(null);
    try {
      await api.deleteInsight(insight.periodKey);
      setView((current) =>
        current
          ? {
              ...current,
              recentInsights: current.recentInsights.filter(
                (entry) => entry.periodKey !== insight.periodKey,
              ),
            }
          : current,
      );
      setAnnouncement("Recap removed. Your reflections are untouched.");
    } catch {
      setErrorMessage("The recap could not be removed. Please try again.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    if (initializedRef.current) return;
    initializedRef.current = true;
    api
      .getPreferences()
      .then((preferences) => {
        if (cancelled) return;
        setRangeDays(preferences.insightRangeDays);
        load(preferences.insightRangeDays);
      })
      .catch(() => {
        if (cancelled) return;
        load(7);
      });
    return () => {
      cancelled = true;
    };
  }, [api, load]);

  function selectRange(range: DashboardRangeDays) {
    if (range === rangeDays && status !== "error") return;
    setRangeDays(range);
    load(range);
    // The choice is remembered as the dashboard preference; a failure only loses the memory.
    api
      .savePreferences({
        timezone: dashboard?.timezone ?? browserTimeZone(),
        weekStartsOn: "monday",
        insightRangeDays: range,
      })
      .catch(() => undefined);
  }

  const detectedTimeZone = browserTimeZone();
  const showTimezoneSuggestion =
    status === "ready" &&
    dashboard !== null &&
    dashboard.timezone !== detectedTimeZone;

  async function adoptTimezone() {
    setTimezoneSaving(true);
    try {
      await api.savePreferences({
        timezone: detectedTimeZone,
        weekStartsOn: "monday",
        insightRangeDays: rangeDays,
      });
      load(rangeDays);
    } catch {
      setErrorMessage("Your timezone could not be saved. Please try again.");
    } finally {
      setTimezoneSaving(false);
    }
  }

  const isEmpty =
    dashboard !== null && dashboard.checkinCount === 0 && dashboard.reflectionCount === 0;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[980px] px-4 py-6 sm:px-6">
        <div aria-live="polite" className="sr-only">
          {announcement}
        </div>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-on-surface text-2xl font-medium">Insights</h1>
            <p className="text-on-surface-variant mt-1 text-sm">
              Patterns from your own check-ins. Only you can see this page.
            </p>
          </div>

          <div role="group" aria-label="Time range" className="border-outline-variant flex overflow-hidden rounded-full border">
            {RANGES.map((range) => {
              const selected = range === rangeDays;
              return (
                <button
                  key={range}
                  type="button"
                  aria-pressed={selected}
                  disabled={status === "loading" || status === "refreshing"}
                  onClick={() => selectRange(range)}
                  className={`focus-visible:outline-focus-ring min-h-10 px-4 text-sm font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 motion-safe:transition-colors motion-safe:duration-feedback ${
                    selected
                      ? "bg-secondary-container text-on-secondary-container"
                      : "text-on-surface-variant hover:bg-surface-container-high"
                  }`}
                >
                  {range} days
                </button>
              );
            })}
          </div>
        </header>

        {showTimezoneSuggestion && (
          <div className="mt-4">
            <InlineAlert
              tone="info"
              action={
                <Button
                  size="compact"
                  variant="outlined"
                  loading={timezoneSaving}
                  loadingLabel="Saving…"
                  onClick={() => void adoptTimezone()}
                >
                  Use {detectedTimeZone}
                </Button>
              }
            >
              Dates are currently grouped in {dashboard.timezone}. Your device reports{" "}
              {detectedTimeZone}.
            </InlineAlert>
          </div>
        )}

        {status === "error" && dashboard === null ? (
          <div className="mt-10">
            <EmptyState
              icon="refresh"
              title="Your insights could not be loaded"
              description={errorMessage ?? "Check your connection and try again in a moment."}
              actions={
                <Button icon="refresh" onClick={() => load(rangeDays)}>
                  Try again
                </Button>
              }
            />
          </div>
        ) : status === "loading" ? (
          <div className="mt-6 space-y-6" role="status" aria-label="Loading insights">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} className="h-24 rounded-card" />
              ))}
            </div>
            <Skeleton className="h-56 rounded-card" />
          </div>
        ) : dashboard === null ? null : isEmpty ? (
          <div className="mt-10">
            <EmptyState
              icon="mood"
              title="No check-ins yet"
              description="Add an optional mood and energy check-in to a reflection, and your private trends will appear here."
              actions={
                <Button icon="forum" onClick={() => void navigate("/app/journal")}>
                  Go to your journal
                </Button>
              }
            />
          </div>
        ) : (
          <div aria-busy={status === "refreshing"}>
            {errorMessage && (
              <div className="mt-4">
                <InlineAlert tone="error" onDismiss={() => setErrorMessage(null)}>
                  {errorMessage}
                </InlineAlert>
              </div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricCard label="Reflections" value={String(dashboard.reflectionCount)} />
              <MetricCard
                label="Check-ins"
                value={String(dashboard.checkinCount)}
                detail={
                  dashboard.coverage !== null
                    ? `${Math.round(dashboard.coverage * 100)}% of reflections have one`
                    : null
                }
              />
              <MetricCard
                label="Average mood"
                value={dashboard.moodAverage !== null ? dashboard.moodAverage.toFixed(1) : "—"}
                detail={
                  dashboard.moodAverage === null
                    ? "No mood check-ins yet"
                    : formatDelta(dashboard.moodDeltaFromPrevious)
                }
              />
              <MetricCard
                label="Average energy"
                value={
                  dashboard.energyAverage !== null ? dashboard.energyAverage.toFixed(1) : "—"
                }
                detail={
                  dashboard.energyAverage === null
                    ? "No energy check-ins yet"
                    : formatDelta(dashboard.energyDeltaFromPrevious)
                }
              />
            </div>

            <section className="border-outline-variant bg-surface-container-low mt-6 rounded-card border p-4 sm:p-5">
              <h2 className="text-on-surface text-base font-medium">Mood and energy</h2>
              {dashboard.hasEnoughForTrend ? (
                <div className="mt-3">
                  <AccessibleLineChart
                    title={`Mood and energy over the last ${dashboard.rangeDays} days`}
                    description="Scores are your own one-to-five check-ins. Days without a check-in are shown as gaps."
                    xLabels={dashboard.trend.map((point) => point.date)}
                    min={1}
                    max={5}
                    formatLabel={formatDay}
                    tableCaption={`Daily average mood and energy from ${formatDay(dashboard.from)} to ${formatDay(dashboard.to)}.`}
                    series={[
                      {
                        id: "mood",
                        label: "Mood",
                        color: "var(--sys-primary)",
                        points: dashboard.trend.map((point) => point.mood),
                      },
                      {
                        id: "energy",
                        label: "Energy",
                        color: "var(--sys-success)",
                        dash: "6 4",
                        points: dashboard.trend.map((point) => point.energy),
                      },
                    ]}
                  />
                </div>
              ) : (
                <p className="text-on-surface-variant mt-2 text-sm">
                  Not enough check-ins yet. Trends appear after three or more check-ins in this
                  range.
                </p>
              )}
            </section>

            {dashboard.topEmotions.length > 0 && (
              <section className="mt-6">
                <h2 className="text-on-surface text-base font-medium">Most noted emotions</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {dashboard.topEmotions.map((entry) => (
                    <Chip key={entry.emotion}>
                      {EMOTION_DISPLAY[entry.emotion]} · {entry.count}
                    </Chip>
                  ))}
                </div>
              </section>
            )}

            <section className="mt-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-on-surface text-base font-medium">Recaps</h2>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="compact"
                    variant="tonal"
                    icon="auto_awesome"
                    loading={generationPending === "day"}
                    loadingLabel="Creating…"
                    disabled={generationPending !== null}
                    onClick={() =>
                      void generateFor("day", periodKeyFor("day", dashboard.to), false)
                    }
                  >
                    Create today&rsquo;s recap
                  </Button>
                  <Button
                    size="compact"
                    variant="tonal"
                    icon="calendar_today"
                    loading={generationPending === "week"}
                    loadingLabel="Creating…"
                    disabled={generationPending !== null}
                    onClick={() =>
                      void generateFor("week", periodKeyFor("week", dashboard.to), false)
                    }
                  >
                    Create weekly insight
                  </Button>
                </div>
              </div>
              <p className="text-on-surface-variant mt-1 text-sm">
                A recap is written from your own reflections and check-ins for that period, and
                only when you ask for one.
              </p>

              {view !== null && view.recentInsights.length > 0 ? (
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {view.recentInsights.map((insight) => (
                    <InsightCard
                      key={insight.periodKey}
                      insight={insight}
                      busy={generationPending !== null}
                      onRegenerate={() =>
                        void generateFor(insight.periodType, insight.periodKey, true)
                      }
                      onRemove={() => void removeInsight(insight)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-on-surface-variant mt-4 text-sm">
                  No recaps yet. Create one when you have reflected on a day or week.
                </p>
              )}
            </section>

            {dashboard.locatedCount > 0 && (
              <p className="text-on-surface-variant mt-6 text-sm">
                {dashboard.locatedCount}{" "}
                {dashboard.locatedCount === 1 ? "reflection has" : "reflections have"} a saved
                location.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default InsightsPage;
