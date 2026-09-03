import { useNavigate } from "react-router-dom";
import type { PersonalInsight } from "../../../shared/schemas";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";

function periodTitle(insight: PersonalInsight): string {
  if (insight.periodType === "day") {
    return new Date(`${insight.periodStart}T00:00:00Z`).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  }
  const start = new Date(`${insight.periodStart}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `Week of ${start}`;
}

export type InsightCardProps = {
  insight: PersonalInsight;
  busy: boolean;
  onRegenerate: () => void;
  onRemove: () => void;
};

export function InsightCard({ insight, busy, onRegenerate, onRemove }: InsightCardProps) {
  const navigate = useNavigate();
  const { narrative } = insight;

  return (
    <article
      aria-label={`${insight.periodType === "day" ? "Daily" : "Weekly"} recap: ${narrative.title}`}
      className="border-outline-variant bg-surface-container-low rounded-card border p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-on-surface-variant text-xs font-medium">{periodTitle(insight)}</p>
          <h3 className="text-on-surface mt-0.5 text-base font-medium">{narrative.title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {insight.stale && <Chip tone="warning">Out of date</Chip>}
          {insight.model === "deterministic" && <Chip>No AI needed</Chip>}
        </div>
      </div>

      <p className="text-on-surface mt-3 text-sm leading-relaxed">{narrative.overview}</p>

      {narrative.patterns.length > 0 && (
        <div className="mt-4">
          <h4 className="text-on-surface-variant text-xs font-medium tracking-wide uppercase">
            Possible patterns
          </h4>
          <ul className="mt-2 space-y-2">
            {narrative.patterns.map((pattern, index) => (
              <li key={index} className="text-on-surface text-sm">
                {pattern.observation}
                <span className="text-on-surface-variant ml-1 text-xs">
                  ({pattern.confidence} confidence)
                </span>
                {pattern.evidenceSessionIds.length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    {pattern.evidenceSessionIds.map((sessionId) => (
                      <button
                        key={sessionId}
                        type="button"
                        onClick={() =>
                          void navigate(`/app/journal?session=${encodeURIComponent(sessionId)}`)
                        }
                        className="text-primary focus-visible:outline-focus-ring rounded-control text-xs font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        Open reflection
                      </button>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {narrative.highlights.length > 0 && (
        <div className="mt-4">
          <h4 className="text-on-surface-variant text-xs font-medium tracking-wide uppercase">
            Highlights
          </h4>
          <ul className="text-on-surface mt-2 list-disc space-y-1 pl-5 text-sm">
            {narrative.highlights.map((highlight, index) => (
              <li key={index}>{highlight}</li>
            ))}
          </ul>
        </div>
      )}

      {narrative.nextSteps.length > 0 && (
        <div className="mt-4">
          <h4 className="text-on-surface-variant text-xs font-medium tracking-wide uppercase">
            Worth carrying forward
          </h4>
          <ul className="text-on-surface mt-2 list-disc space-y-1 pl-5 text-sm">
            {narrative.nextSteps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-on-surface-variant mt-4 text-xs">{narrative.disclaimer}</p>

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button size="compact" variant="text" onClick={onRemove} disabled={busy}>
          Remove
        </Button>
        {insight.stale && (
          <Button size="compact" variant="tonal" icon="refresh" onClick={onRegenerate} disabled={busy}>
            Update recap
          </Button>
        )}
      </div>
    </article>
  );
}
