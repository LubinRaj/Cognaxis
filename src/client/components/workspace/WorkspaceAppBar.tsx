import type { SessionDetail } from "../../../shared/schemas";
import {
  SUMMARY_ACTION_LABELS,
  type SummaryActionState,
} from "../../workspace/session-sync";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { Menu } from "../ui/Menu";

const SUMMARY_HINTS: Record<SummaryActionState, string | undefined> = {
  "not-enough-messages": "Write at least one exchange before creating a summary.",
  create: undefined,
  current: "Your summary covers the whole conversation.",
  stale: "New messages have arrived since the last summary.",
  summarizing: undefined,
};

type WorkspaceAppBarProps = {
  session: SessionDetail | null;
  summaryState: SummaryActionState;
  messagePending: boolean;
  summaryBlocked: boolean;
  onOpenHistory: () => void;
  onSummary: () => void;
  onExport: () => void;
  onDelete: () => void;
};

export function WorkspaceAppBar({
  session,
  summaryState,
  messagePending,
  summaryBlocked,
  onOpenHistory,
  onSummary,
  onExport,
  onDelete,
}: WorkspaceAppBarProps) {
  const summaryDisabled = summaryState === "not-enough-messages" || summaryBlocked;
  const hint = summaryBlocked
    ? "Another reflection summary is still being created."
    : SUMMARY_HINTS[summaryState];

  return (
    <header className="border-outline-variant bg-surface/95 sticky top-0 z-20 flex min-h-16 items-center gap-2 border-b px-3 backdrop-blur-md sm:px-5">
      <IconButton
        icon="menu"
        label="Open reflection history"
        onClick={onOpenHistory}
        className="lg:hidden"
      />

      <div className="min-w-0 flex-1">
        <h1 className="text-on-surface truncate text-base font-medium sm:text-lg">
          {session?.title ?? "Your private journal"}
        </h1>
        {session && (
          <p className="text-on-surface-variant hidden truncate text-xs sm:block">
            Updated{" "}
            {new Date(session.updatedAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <Button
          size="compact"
          variant="tonal"
          icon="auto_awesome"
          onClick={onSummary}
          disabled={!session || summaryDisabled}
          loading={summaryState === "summarizing"}
          loadingLabel="Creating…"
          title={hint}
          aria-describedby={hint ? "summary-action-hint" : undefined}
          className="hidden sm:inline-flex"
        >
          {SUMMARY_ACTION_LABELS[summaryState]}
        </Button>

        <IconButton
          icon="auto_awesome"
          label={SUMMARY_ACTION_LABELS[summaryState]}
          onClick={onSummary}
          disabled={!session || summaryDisabled || summaryState === "summarizing"}
          title={hint}
          className="sm:hidden"
        />

        {hint && (
          <span id="summary-action-hint" className="sr-only">
            {hint}
          </span>
        )}

        <Menu
          label="Reflection actions"
          items={[
            {
              id: "export",
              label: "Export reflection",
              icon: "download",
              disabled: !session || messagePending,
              onSelect: onExport,
            },
            {
              id: "delete",
              label: "Delete reflection",
              icon: "delete",
              tone: "destructive",
              separated: true,
              disabled: !session || messagePending,
              onSelect: onDelete,
            },
          ]}
          trigger={(props) => (
            <button
              {...props}
              type="button"
              aria-label="More reflection actions"
              className="text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors duration-(--duration-feedback) focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
              </svg>
            </button>
          )}
        />
      </div>
    </header>
  );
}
