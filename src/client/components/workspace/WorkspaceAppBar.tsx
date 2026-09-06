import type { User } from "firebase/auth";
import type { SessionDetail } from "../../../shared/schemas";
import {
  SUMMARY_ACTION_LABELS,
  type SummaryActionState,
} from "../../workspace/session-sync";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { Menu } from "../ui/Menu";
import { WorkspaceScopeSelector } from "./WorkspaceScopeSelector";

const SUMMARY_HINTS: Record<SummaryActionState, string | undefined> = {
  "not-enough-messages": "Write at least one exchange before creating a summary.",
  create: undefined,
  current: "Your summary covers the whole conversation.",
  stale: "New messages have arrived since the last summary.",
  summarizing: undefined,
};

type WorkspaceAppBarProps = {
  user: User;
  currentOrganizationId: string | null;
  onScopeChange: (organizationId: string | null) => void;
  session: SessionDetail | null;
  summaryState: SummaryActionState;
  messagePending: boolean;
  summaryBlocked: boolean;
  hasCheckIn: boolean;
  checkInDisabled: boolean;
  onOpenHistory: () => void;
  onSummary: () => void;
  onCheckIn: () => void;
  onExport: () => void;
  onArchive?: () => void;
  onDelete: () => void;
};

export function WorkspaceAppBar({
  user,
  currentOrganizationId,
  onScopeChange,
  session,
  summaryState,
  messagePending,
  summaryBlocked,
  hasCheckIn,
  checkInDisabled,
  onOpenHistory,
  onSummary,
  onCheckIn,
  onExport,
  onArchive,
  onDelete,
}: WorkspaceAppBarProps) {
  const archivedSummaryBlocked = session?.status === "archived" && summaryState !== "current";
  const summaryDisabled = summaryState === "not-enough-messages" || summaryBlocked || archivedSummaryBlocked;
  const hint = summaryBlocked
    ? "Another reflection summary is still being created."
    : archivedSummaryBlocked
      ? "Restore this reflection to create or update its summary."
    : SUMMARY_HINTS[summaryState];

  return (
    <header className="border-outline-variant bg-surface/95 sticky top-0 z-20 flex min-h-14 items-center gap-1 border-b px-2 backdrop-blur-md sm:min-h-16 sm:gap-2 sm:px-5">
      <IconButton
        icon="menu"
        label="Open reflection history"
        onClick={onOpenHistory}
        className="lg:hidden"
      />

      <div className="min-w-0 flex-none w-[min(34vw,9rem)] sm:flex-1 sm:w-auto">
        <h1 className="sr-only">
          {session?.title ?? "Your personal space"}
        </h1>
        <WorkspaceScopeSelector
          user={user}
          currentOrganizationId={currentOrganizationId}
          onScopeChange={onScopeChange}
        />
      </div>

      {session && (
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-2">
        <IconButton
          icon="mood"
          label={hasCheckIn ? "Edit reflection check-in" : "Add reflection check-in"}
          onClick={onCheckIn}
          disabled={!session || checkInDisabled}
        />

        <Button
          size="compact"
          variant="tonal"
          icon="auto_awesome"
          onClick={onSummary}
          disabled={!session || summaryDisabled}
          loading={summaryState === "summarizing"}
          loadingLabel="Creating…"
          title={hint}
          aria-label={SUMMARY_ACTION_LABELS[summaryState]}
          aria-describedby={hint ? "summary-action-hint" : undefined}
          className="max-w-[8rem] px-2.5 sm:max-w-none sm:px-4"
        >
          <span className="truncate sm:hidden">Summary</span>
          <span className="hidden truncate sm:inline">{SUMMARY_ACTION_LABELS[summaryState]}</span>
        </Button>

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
            ...(onArchive
              ? [{
                  id: "archive",
                  label: "Archive reflection",
                  icon: "archive" as const,
                  disabled: !session || session.status !== "active" || messagePending,
                  onSelect: onArchive,
                }]
              : []),
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
      )}
    </header>
  );
}
