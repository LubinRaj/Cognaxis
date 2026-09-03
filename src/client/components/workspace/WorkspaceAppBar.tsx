import type { SessionDetail } from "../../../shared/schemas";
import {
  SUMMARY_ACTION_LABELS,
  type SummaryActionState,
} from "../../workspace/session-sync";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { Menu } from "../ui/Menu";
import { MaterialIcon } from "../MaterialIcon";

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
  currentView: "journal" | "insights" | "map" | "organizations" | "admin";
  onNavigate: (view: "journal" | "insights" | "map" | "organizations" | "admin") => void;
  isSuperAdmin?: boolean;
  onOpenCheckIn: () => void;
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
  currentView,
  onNavigate,
  isSuperAdmin,
  onOpenCheckIn,
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
    <header className="border-outline-variant bg-surface/95 sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 backdrop-blur-md sm:px-5">
      <div className="flex items-center gap-2 min-w-0">
        <IconButton
          icon="menu"
          label="Open reflection history"
          onClick={onOpenHistory}
          className="lg:hidden"
        />

        <div className="min-w-0">
          <h1 className="text-on-surface truncate text-sm font-semibold sm:text-base">
            {currentView === "journal"
              ? session?.title ?? "Personal Journal"
              : currentView === "insights"
              ? "Insights & Trajectory"
              : currentView === "map"
              ? "Location Analytics"
              : currentView === "organizations"
              ? "Organizations & Teams"
              : "Platform Administration"}
          </h1>
          {session && currentView === "journal" && (
            <p className="text-on-surface-variant hidden truncate text-xs sm:block">
              Updated{" "}
              {new Date(session.updatedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </p>
          )}
        </div>
      </div>

      {/* Nav View Tabs */}
      <nav className="flex items-center gap-1 rounded-xl bg-surface-container p-1 border border-outline-variant/60 text-xs">
        <button
          onClick={() => onNavigate("journal")}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
            currentView === "journal"
              ? "bg-primary text-on-primary shadow-sm"
              : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
          }`}
        >
          <MaterialIcon name="edit_document" size={15} />
          <span>Journal</span>
        </button>

        <button
          onClick={() => onNavigate("insights")}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
            currentView === "insights"
              ? "bg-primary text-on-primary shadow-sm"
              : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
          }`}
        >
          <MaterialIcon name="auto_graph" size={15} />
          <span>Insights</span>
        </button>

        <button
          onClick={() => onNavigate("map")}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
            currentView === "map"
              ? "bg-primary text-on-primary shadow-sm"
              : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
          }`}
        >
          <MaterialIcon name="map" size={15} />
          <span>Map</span>
        </button>

        <button
          onClick={() => onNavigate("organizations")}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
            currentView === "organizations"
              ? "bg-primary text-on-primary shadow-sm"
              : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
          }`}
        >
          <MaterialIcon name="groups" size={15} />
          <span>Teams</span>
        </button>

        {isSuperAdmin && (
          <button
            onClick={() => onNavigate("admin")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
              currentView === "admin"
                ? "bg-amber-600 text-white shadow-sm"
                : "text-amber-400 hover:bg-amber-500/10"
            }`}
          >
            <MaterialIcon name="verified_user" size={15} />
            <span>Admin</span>
          </button>
        )}
      </nav>

      {/* Action Controls */}
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        {/* Signal Check-in Button */}
        <Button
          size="compact"
          variant="outlined"
          icon="psychiatry"
          onClick={onOpenCheckIn}
          title="Record mood, energy, & location signal"
        >
          <span className="hidden sm:inline">Check-in</span>
        </Button>

        {currentView === "journal" && (
          <>
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
                  className="hover:bg-surface-container-high focus-visible:ring-primary inline-flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-40"
                  aria-label="More reflection actions"
                >
                  <MaterialIcon name="more_vert" size={20} />
                </button>
              )}
            />
          </>
        )}
      </div>
    </header>
  );
}
