import { useRef } from "react";
import type { User } from "firebase/auth";
import type { JournalSession } from "../../../shared/schemas";
import type { LoadStatus, OperationStatus } from "../../workspace/use-workspace-controller";
import { MaterialIcon } from "../MaterialIcon";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { IconButton } from "../ui/IconButton";
import { InlineAlert } from "../ui/InlineAlert";
import { SessionListSkeleton } from "../ui/Skeleton";
import { TextField } from "../ui/TextField";
import { AccountMenu } from "./AccountMenu";

function formatUpdated(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type ReflectionHistoryProps = {
  user: User;
  sessions: JournalSession[];
  totalSessions: number;
  activeSessionId: string | null;
  status: LoadStatus;
  createStatus: OperationStatus;
  errorMessage: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (sessionId: string) => void;
  onCreate: () => void;
  onRetry: () => void;
  onSignOut: () => void;
  signingOut: boolean;
  drawerMode?: boolean;
  onCloseDrawer?: () => void;
};

export function ReflectionHistory({
  user,
  sessions,
  totalSessions,
  activeSessionId,
  status,
  createStatus,
  errorMessage,
  query,
  onQueryChange,
  onSelect,
  onCreate,
  onRetry,
  onSignOut,
  signingOut,
  drawerMode = false,
  onCloseDrawer,
}: ReflectionHistoryProps) {
  const searchRef = useRef<HTMLInputElement>(null);

  const filtering = query.trim().length > 0;

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
          if (event.key === "Escape" && query.length > 0) {
            event.stopPropagation();
            onQueryChange("");
          }
        }}
      />

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
                description={`Nothing in your recent reflections matches "${query.trim()}".`}
                actions={
                  <Button size="compact" variant="text" onClick={() => onQueryChange("")}>
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
                  <li key={session.id}>
                    <button
                      type="button"
                      aria-current={isActive ? "true" : undefined}
                      onClick={() => onSelect(session.id)}
                      className={`focus-visible:outline-focus-ring flex w-full min-h-14 flex-col items-start justify-center gap-1 rounded-xl px-3 py-2 text-left transition-colors duration-(--duration-feedback) focus-visible:outline-2 focus-visible:-outline-offset-2 ${
                        isActive
                          ? "bg-secondary-container text-on-secondary-container"
                          : "text-on-surface hover:bg-surface-container-high"
                      }`}
                    >
                      <span className="w-full truncate text-sm font-medium">{session.title}</span>
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
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="border-outline-variant border-t pt-2">
        <AccountMenu user={user} onSignOut={onSignOut} signingOut={signingOut} />
      </div>
    </div>
  );
}
