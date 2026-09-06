import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  type ForwardedRef,
} from "react";
import type { PersonalMemory } from "../../../shared/schemas";
import type { SummaryActionState } from "../../workspace/session-sync";
import { MaterialIcon } from "../MaterialIcon";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { IconButton } from "../ui/IconButton";
import { Surface } from "../ui/Surface";

const COLLAPSE_KEY = "cognaxis_summary_collapsed";

function readCollapsed(): boolean {
  try {
    return window.sessionStorage.getItem(COLLAPSE_KEY) === "true";
  } catch {
    return false;
  }
}

type ReflectionSummaryProps = {
  summary: PersonalMemory | null;
  state: SummaryActionState;
  onUpdate?: () => void;
  onCopyResult: (message: string) => void;
};

export type ReflectionSummaryHandle = {
  reveal: () => void;
};

function ReflectionSummaryComponent(
  { summary, state, onUpdate, onCopyResult }: ReflectionSummaryProps,
  ref: ForwardedRef<ReflectionSummaryHandle>,
) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      // Only the collapsed/expanded preference is stored, never any journal content.
      window.sessionStorage.setItem(COLLAPSE_KEY, String(collapsed));
    } catch {
      // A blocked storage API must not break the surface.
    }
  }, [collapsed]);

  useImperativeHandle(
    ref,
    () => ({
      reveal() {
        setCollapsed(false);
        window.setTimeout(() => {
          document
            .getElementById("reflection-summary-title")
            ?.scrollIntoView?.({ block: "start", behavior: "auto" });
        }, 0);
      },
    }),
    [],
  );

  if (!summary) return null;

  async function copySummary() {
    if (!summary) return;
    const parts = [summary.title, "", summary.summary];
    if (summary.themes.length > 0) parts.push("", `Themes: ${summary.themes.join(", ")}`);
    if (summary.nextSteps.length > 0) {
      parts.push("", "Next steps:");
      summary.nextSteps.forEach((step, index) => parts.push(`${index + 1}. ${step}`));
    }

    try {
      await navigator.clipboard.writeText(parts.join("\n"));
      setCopied(true);
      onCopyResult("Summary copied");
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      onCopyResult("Copying is not available in this browser.");
    }
  }

  return (
    <Surface
      as="section"
      level="low"
      radius="card"
      bordered
      aria-labelledby="reflection-summary-title"
      className="mx-auto w-full max-w-[900px]"
    >
      <div className="flex items-start gap-3 p-4">
        <span
          aria-hidden="true"
          className="bg-primary-container text-on-primary-container mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        >
          <MaterialIcon name="auto_awesome" size={18} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 id="reflection-summary-title" className="text-on-surface text-sm font-medium">
              Reflection summary
            </h2>
            <span className="text-on-surface-variant text-xs">Private to your account</span>
          </div>
          <p className="text-on-surface mt-1 text-base font-medium">{summary.title}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {!collapsed && (
            <IconButton
              icon={copied ? "check" : "content_copy"}
              label={copied ? "Summary copied" : "Copy summary"}
              size={18}
              onClick={() => void copySummary()}
            />
          )}
          <IconButton
            icon={collapsed ? "expand_more" : "expand_less"}
            label={collapsed ? "Expand reflection summary" : "Collapse reflection summary"}
            size={20}
            onClick={() => setCollapsed((value) => !value)}
            aria-expanded={!collapsed}
            aria-controls="reflection-summary-body"
          />
        </div>
      </div>

      {collapsed && (
        <div className="flex items-center justify-between gap-3 px-4 pb-4 sm:pl-16">
          <p className="text-on-surface-variant min-w-0 truncate text-sm">
            View the themes and next steps from this reflection.
          </p>
          <Button size="compact" variant="text" onClick={() => setCollapsed(false)}>
            View summary
          </Button>
        </div>
      )}

      {!collapsed && (
        <div id="reflection-summary-body" className="flex flex-col gap-4 px-4 pb-4 sm:pl-16">
          <p className="text-on-surface-variant text-sm leading-relaxed">{summary.summary}</p>

          {summary.themes.length > 0 && (
            <div>
              <h3 className="text-on-surface-variant text-xs font-medium">Themes</h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {summary.themes.map((theme) => (
                  <li key={theme}>
                    <Chip tone="primary">{theme}</Chip>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.nextSteps.length > 0 && (
            <div>
              <h3 className="text-on-surface-variant flex items-center gap-1.5 text-xs font-medium">
                <span aria-hidden="true">
                  <MaterialIcon name="checklist" size={14} />
                </span>
                Next steps
              </h3>
              <ol className="text-on-surface mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-relaxed">
                {summary.nextSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          )}

          <p className="text-on-surface-variant text-xs">
            Gemini generated this from the conversation on{" "}
            {new Date(summary.updatedAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
            .
          </p>

          {state === "stale" && onUpdate && (
            <div className="border-outline-variant flex flex-wrap items-center gap-3 border-t pt-3">
              <p className="text-on-surface-variant flex items-center gap-1.5 text-xs">
                <span aria-hidden="true" className="text-warning">
                  <MaterialIcon name="info" size={16} />
                </span>
                New messages have arrived since this summary.
              </p>
              <Button size="compact" variant="text" onClick={onUpdate}>
                Update summary
              </Button>
            </div>
          )}
        </div>
      )}
    </Surface>
  );
}

export const ReflectionSummary = forwardRef<ReflectionSummaryHandle, ReflectionSummaryProps>(
  ReflectionSummaryComponent,
);
