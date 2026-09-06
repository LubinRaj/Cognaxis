import { useRef } from "react";
import { Link } from "react-router-dom";
import type { JournalSession, PersonalOpenLoop } from "../../../shared/schemas";
import type { LoadStatus, OperationStatus } from "../../workspace/use-workspace-controller";
import { MaterialIcon } from "../MaterialIcon";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { EmptyState } from "../ui/EmptyState";
import { IconButton } from "../ui/IconButton";
import { InlineAlert } from "../ui/InlineAlert";
import { Menu } from "../ui/Menu";
import { SessionListSkeleton } from "../ui/Skeleton";
import { TextField } from "../ui/TextField";
import { ReflectionFilterPopover } from "./ReflectionFilterPopover";

function formatUpdated(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type ReflectionHistoryProps = {
  sessions: JournalSession[];
  totalSessions: number;
  activeSessionId: string | null;
  status: LoadStatus;
  createStatus: OperationStatus;
  errorMessage: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  availableTags?: string[];
  selectedTags?: string[];
  onTagFiltersChange?: (tags: string[]) => void;
  onSelect: (sessionId: string) => void;
  onRename?: (session: JournalSession) => void;
  onManageTags?: (session: JournalSession) => void;
  onExport?: (session: JournalSession) => void;
  onArchive?: (session: JournalSession) => void;
  onCreate: () => void;
  onRetry: () => void;
  openLoops?: PersonalOpenLoop[];
  drawerMode?: boolean;
  onCloseDrawer?: () => void;
};

export function ReflectionHistory({
  sessions,
  totalSessions,
  activeSessionId,
  status,
  createStatus,
  errorMessage,
  query,
  onQueryChange,
  availableTags = [],
  selectedTags = [],
  onTagFiltersChange,
  onSelect,
  onRename,
  onManageTags,
  onExport,
  onArchive,
  onCreate,
  onRetry,
  openLoops = [],
  drawerMode = false,
  onCloseDrawer,
}: ReflectionHistoryProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const filtering = query.trim().length > 0 || selectedTags.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-primary flex items-center">
            <MaterialIcon name="psychiatry" size={26} />
          </span>
          <span className="font-display text-on-surface text-lg font-medium tracking-tight">
            Cognaxis
          </span>
        </div>
        {drawerMode && onCloseDrawer && (
          <IconButton icon="close" label="Close reflection history" onClick={onCloseDrawer} />
        )}
      </div>

      <Button
        icon="add"
        fullWidth
        onClick={onCreate}
        loading={createStatus === "pending"}
        loadingLabel="Starting…"
      >
        New reflection
      </Button>

      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <TextField
            inputRef={searchRef}
            label="Search recent reflections"
            hideLabel
            type="search"
            placeholder="Search recent reflections"
            leadingIcon="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onClear={() => {
              onQueryChange("");
              searchRef.current?.focus();
            }}
            clearLabel="Clear search"
            onKeyDown={(event) => {
              // Escape clears the field first; the drawer only closes on a second press.
              if (event.key === "Escape" && event.currentTarget.value.length > 0) {
                event.preventDefault();
                event.stopPropagation();
                onQueryChange("");
              }
            }}
          />
        </div>
        {onTagFiltersChange && (
          <ReflectionFilterPopover
            availableTags={availableTags}
            selectedTags={selectedTags}
            onSelectedTagsChange={onTagFiltersChange}
          />
        )}
      </div>

      {openLoops.length > 0 && !filtering && (
        <section className="border-outline-variant bg-surface-container rounded-card border p-3" aria-labelledby="open-loops-heading">
          <div className="flex items-center justify-between gap-2">
            <h2 id="open-loops-heading" className="text-on-surface text-xs font-medium">Open loops</h2>
            <Link to="/app/insights" className="text-primary text-xs hover:underline">Weekly view</Link>
          </div>
          <ul className="mt-2 space-y-1.5">
            {openLoops.slice(0, 3).map((loop) => (
              <li key={`${loop.sessionId}:${loop.text}`}>
                <button type="button" onClick={() => onSelect(loop.sessionId)} className="text-on-surface-variant hover:text-on-surface focus-visible:outline-focus-ring line-clamp-2 w-full rounded text-left text-xs focus-visible:outline-2">
                  {loop.text}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <h2 className="text-on-surface-variant px-1 pb-2 text-xs font-medium">
          {filtering
            ? `Matching reflections (${sessions.length})`
            : `Recent reflections (${totalSessions})`}
        </h2>

        <div className="-mr-1 min-h-0 flex-1 overflow-y-auto pr-1">
          {status === "loading" ? (
            <SessionListSkeleton />
          ) : status === "error" ? (
            <InlineAlert
              tone="error"
              title="Reflections unavailable"
              action={
                <Button size="compact" variant="outlined" onClick={onRetry} icon="refresh">
                  Try again
                </Button>
              }
            >
              {errorMessage ?? "Your reflections could not be loaded."}
            </InlineAlert>
          ) : sessions.length === 0 ? (
            filtering ? (
              <EmptyState
                icon="search"
                size="compact"
                headingLevel={3}
                title="No matching reflections"
                description={selectedTags.length > 0
                  ? "No recent reflections match the selected tags."
                  : `Nothing in your recent reflections matches "${query.trim()}".`}
                actions={
                  <Button size="compact" variant="text" onClick={() => {
                    onQueryChange("");
                    onTagFiltersChange?.([]);
                  }}>
                    Clear filter
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon="chat_bubble"
                size="compact"
                headingLevel={3}
                title="No reflections yet"
                description="Your reflections will appear here once you start one."
                actions={
                  <Button size="compact" onClick={onCreate} icon="add">
                    Start a reflection
                  </Button>
                }
              />
            )
          ) : (
            <ul className="flex flex-col gap-1">
              {sessions.map((session) => {
                const isActive = session.id === activeSessionId;
                return (
                  <li
                    key={session.id}
                    className={`group flex min-h-14 items-stretch rounded-xl ${
                      isActive
                        ? "bg-secondary-container text-on-secondary-container"
                        : "text-on-surface hover:bg-surface-container-high"
                    }`}
                  >
                    <button
                      type="button"
                      aria-current={isActive ? "true" : undefined}
                      onClick={() => onSelect(session.id)}
                      className="focus-visible:outline-focus-ring flex min-w-0 flex-1 flex-col items-start justify-center gap-1 rounded-xl px-3 py-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2"
                    >
                      <span className="block w-full truncate text-sm font-medium">{session.title}</span>
                      {(session.tags ?? []).length > 0 && (
                        <span className="flex max-w-full flex-wrap gap-1">
                          {(session.tags ?? []).slice(0, 3).map((tag) => <Chip key={tag} className="px-2 py-0.5 text-[10px]">{tag}</Chip>)}
                        </span>
                      )}
                      <span
                        className={`flex items-center gap-2 text-xs ${
                          isActive ? "text-on-secondary-container/80" : "text-on-surface-variant"
                        }`}
                      >
                        <span>{formatUpdated(session.updatedAt)}</span>
                        {session.messageCount > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>
                              {session.messageCount} message
                              {session.messageCount === 1 ? "" : "s"}
                            </span>
                          </>
                        )}
                      </span>
                    </button>
                    {(onRename || onManageTags || onExport || onArchive) && (
                      <Menu
                        label={`Actions for ${session.title}`}
                        items={[
                          ...(onRename
                            ? [{ id: "rename", label: "Rename reflection", icon: "edit" as const, onSelect: () => onRename(session) }]
                            : []),
                          ...(onManageTags
                            ? [{ id: "tags", label: "Manage tags", icon: "label" as const, onSelect: () => onManageTags(session) }]
                            : []),
                          ...(onExport
                            ? [{ id: "export", label: "Export reflection", icon: "download" as const, onSelect: () => onExport(session) }]
                            : []),
                          ...(onArchive
                            ? [{ id: "archive", label: "Archive reflection", icon: "archive" as const, separated: true, onSelect: () => onArchive(session) }]
                            : []),
                        ]}
                        trigger={(props) => (
                          <button
                            {...props}
                            type="button"
                            aria-label="Reflection actions"
                            className="text-on-surface-variant hover:text-on-surface focus-visible:outline-focus-ring m-1 flex h-10 w-10 shrink-0 self-center items-center justify-center rounded-lg p-0 opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 sm:opacity-0 sm:group-hover:opacity-100"
                          >
                            <MaterialIcon name="more_vert" size={20} />
                          </button>
                        )}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
