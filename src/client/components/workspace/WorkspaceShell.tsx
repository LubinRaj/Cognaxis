import { useCallback, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { useAuth } from "../../auth/AuthProvider";
import { isSessionFull } from "../../workspace/session-sync";
import { useWorkspaceController } from "../../workspace/use-workspace-controller";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { InlineAlert } from "../ui/InlineAlert";
import { ConversationSkeleton } from "../ui/Skeleton";
import { useFocusTrap, useScrollLock } from "../ui/use-focus-trap";
import { useSessionSignal } from "../../workspace/use-session-signal";
import { CheckInDialog } from "./CheckInDialog";
import { CheckInSummaryRow } from "./CheckInSummaryRow";
import { ConversationThread } from "./ConversationThread";
import { DeleteReflectionDialog } from "./DeleteReflectionDialog";
import { ExportDialog } from "./ExportDialog";
import { ReflectionComposer } from "./ReflectionComposer";
import { ReflectionHistory } from "./ReflectionHistory";
import { ReflectionSummary, type ReflectionSummaryHandle } from "./ReflectionSummary";
import { WorkspaceAppBar } from "./WorkspaceAppBar";
import { EmptyReflection, WorkspaceFirstUse } from "./WorkspaceEmptyState";

export function WorkspaceShell({
  user,
  initialSessionId,
}: {
  user: User;
  initialSessionId?: string;
}) {
  const { signOutAndReset, isSigningOut, globalError, clearGlobalError } = useAuth();
  const workspace = useWorkspaceController(user, initialSessionId);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const checkIn = useSessionSignal(user, workspace.activeSessionId);
  const drawerRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<ReflectionSummaryHandle>(null);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  useFocusTrap(drawerRef, drawerOpen, closeDrawer);
  useScrollLock(drawerOpen);

  const { activeSession, sessionStatus, workspaceStatus, sendStatus } = workspace;
  const activeMessagePending =
    sendStatus === "pending" && workspace.sendTargetId === activeSession?.id;
  const anotherMessagePending = sendStatus === "pending" && !activeMessagePending;
  const summaryBlocked =
    workspace.summaryStatus === "pending" && workspace.summaryTargetId !== activeSession?.id;

  async function send() {
    const delivered = await workspace.sendMessage();
    if (delivered) setAnnouncement("Cognaxis replied.");
  }

  function handleSummaryAction() {
    if (workspace.summaryState === "current") {
      summaryRef.current?.reveal();
      return;
    }
    void workspace.createSummary();
  }

  const sessionFull = isSessionFull(activeSession);
  const hasSessions = workspace.sessions.length > 0;

  function selectFromHistory(sessionId: string) {
    workspace.selectSession(sessionId);
    setDrawerOpen(false);
  }

  function createFromHistory() {
    void workspace.createSession();
    setDrawerOpen(false);
  }

  async function confirmDelete() {
    const deleted = await workspace.deleteActiveSession();
    if (deleted) {
      setDeleteOpen(false);
      setAnnouncement("Reflection deleted.");
    }
  }

  const history = (
    <ReflectionHistory
      user={user}
      sessions={workspace.visibleSessions}
      totalSessions={workspace.sessions.length}
      activeSessionId={workspace.activeSessionId}
      status={workspaceStatus}
      createStatus={workspace.createStatus}
      errorMessage={workspace.workspaceError}
      query={workspace.query}
      onQueryChange={workspace.setQuery}
      onSelect={selectFromHistory}
      onCreate={createFromHistory}
      onRetry={workspace.retryWorkspace}
      onSignOut={() => void signOutAndReset()}
      signingOut={isSigningOut}
    />
  );

  return (
    <div className="bg-surface text-on-surface flex h-full min-h-0 w-full overflow-hidden font-sans">
      <a
        href="#reflection-main"
        className="bg-primary text-on-primary sr-only rounded-full px-4 py-2 focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to your reflection
      </a>

      <nav
        aria-label="Reflection history"
        className="border-outline-variant bg-surface-container-low hidden w-[288px] shrink-0 border-r lg:block xl:w-[304px]"
      >
        {history}
      </nav>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="bg-scrim absolute inset-0"
            onClick={closeDrawer}
            aria-hidden="true"
            data-testid="history-scrim"
          />
          <nav
            ref={drawerRef}
            aria-label="Reflection history"
            className="bg-surface-container-low absolute inset-y-0 left-0 w-[min(320px,88vw)] shadow-xl outline-none"
            tabIndex={-1}
          >
            <ReflectionHistory
              user={user}
              sessions={workspace.visibleSessions}
              totalSessions={workspace.sessions.length}
              activeSessionId={workspace.activeSessionId}
              status={workspaceStatus}
              createStatus={workspace.createStatus}
              errorMessage={workspace.workspaceError}
              query={workspace.query}
              onQueryChange={workspace.setQuery}
              onSelect={selectFromHistory}
              onCreate={createFromHistory}
              onRetry={workspace.retryWorkspace}
              onSignOut={() => void signOutAndReset()}
              signingOut={isSigningOut}
              drawerMode
              onCloseDrawer={closeDrawer}
            />
          </nav>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <WorkspaceAppBar
          session={activeSession}
          summaryState={workspace.summaryState}
          messagePending={activeMessagePending}
          summaryBlocked={summaryBlocked}
          hasCheckIn={checkIn.signal !== null}
          checkInDisabled={checkIn.status === "loading"}
          onOpenHistory={() => setDrawerOpen(true)}
          onSummary={handleSummaryAction}
          onCheckIn={() => {
            if (checkIn.status === "error") {
              checkIn.reload();
              return;
            }
            setCheckInOpen(true);
          }}
          onExport={() => setExportOpen(true)}
          onDelete={() => setDeleteOpen(true)}
        />

        <main id="reflection-main" className="flex min-h-0 flex-1 flex-col">
          <div aria-live="polite" className="sr-only">
            {announcement}
          </div>

          {(globalError ?? workspace.summaryError ?? workspace.sessionError) && (
            <div className="mx-auto w-full max-w-[900px] px-4 pt-4 sm:px-6">
              {globalError && (
                <InlineAlert tone="error" urgent onDismiss={clearGlobalError}>
                  {globalError}
                </InlineAlert>
              )}
              {workspace.sessionError && sessionStatus === "error" && (
                <InlineAlert
                  tone="error"
                  className="mt-2"
                  action={
                    <Button
                      size="compact"
                      variant="outlined"
                      icon="refresh"
                      onClick={workspace.retrySession}
                    >
                      Try again
                    </Button>
                  }
                >
                  {workspace.sessionError}
                </InlineAlert>
              )}
              {workspace.summaryError && (
                <InlineAlert
                  tone="error"
                  className="mt-2"
                  onDismiss={workspace.dismissSummaryError}
                >
                  {workspace.summaryError}
                </InlineAlert>
              )}
            </div>
          )}

          {activeSession &&
            workspaceStatus === "ready" &&
            sessionStatus !== "pending" &&
            checkIn.signal && (
              <div className="mx-auto w-full max-w-[900px] px-4 pt-4 sm:px-6">
                <CheckInSummaryRow
                  signal={checkIn.signal}
                  onEdit={() => setCheckInOpen(true)}
                  editDisabled={checkIn.saving}
                />
              </div>
            )}

          {workspaceStatus === "loading" ? (
            <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6">
              <ConversationSkeleton />
            </div>
          ) : workspaceStatus === "error" ? (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <EmptyState
                icon="refresh"
                title="Your reflections could not be loaded"
                description={
                  workspace.workspaceError ??
                  "Check your connection and try again in a moment."
                }
                actions={
                  <Button icon="refresh" onClick={workspace.retryWorkspace}>
                    Try again
                  </Button>
                }
              />
            </div>
          ) : !hasSessions && !activeSession ? (
            <WorkspaceFirstUse
              onCreate={() => void workspace.createSession()}
              createStatus={workspace.createStatus}
            />
          ) : !activeSession ? (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <EmptyState
                icon="chat_bubble"
                title="Choose a reflection"
                description="Open one of your recent reflections, or start a new one."
                actions={
                  <Button icon="add" onClick={() => void workspace.createSession()}>
                    New reflection
                  </Button>
                }
              />
            </div>
          ) : sessionStatus === "pending" ? (
            <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6">
              <ConversationSkeleton />
            </div>
          ) : activeSession.messages.length === 0 ? (
            <EmptyReflection title={activeSession.title} />
          ) : (
            <>
              {activeSession.summary && (
                <div className="px-4 pt-4 sm:px-6">
                  <ReflectionSummary
                    ref={summaryRef}
                    summary={activeSession.summary}
                    state={workspace.summaryState}
                    onUpdate={() => void workspace.createSummary()}
                    onCopyResult={setAnnouncement}
                  />
                </div>
              )}
              <ConversationThread
                messages={activeSession.messages}
                pending={activeMessagePending}
                onCopyResult={setAnnouncement}
              />
            </>
          )}

          {activeSession && workspaceStatus === "ready" && (
            <>
              {workspace.sendError && (
                <div className="mx-auto w-full max-w-[900px] px-4 sm:px-6">
                  <InlineAlert tone="error" onDismiss={workspace.dismissSendError}>
                    {workspace.sendError}
                  </InlineAlert>
                </div>
              )}
              <ReflectionComposer
                draft={workspace.draft}
                onDraftChange={workspace.setDraft}
                onSubmit={() => void send()}
                onCancel={workspace.cancelSend}
                sending={activeMessagePending}
                submissionBlocked={anotherMessagePending}
                submissionBlockedReason="Another reflection is still waiting for a response."
                disabled={sessionFull || sessionStatus === "pending" || activeMessagePending}
                disabledReason={
                  sessionFull
                    ? "This reflection is full. Start a new reflection to continue."
                    : sessionStatus === "pending"
                      ? "Opening this reflection…"
                      : activeMessagePending
                        ? "Waiting for Cognaxis to respond…"
                      : undefined
                }
                showStarterPrompts={
                  activeSession.messages.length === 0 && workspace.draft.length === 0
                }
              />
            </>
          )}
        </main>
      </div>

      <ExportDialog open={exportOpen} session={activeSession} onClose={() => setExportOpen(false)} />

      {checkInOpen && activeSession && (
        <CheckInDialog
          key={activeSession.id}
          sessionTitle={activeSession.title}
          initialSignal={checkIn.signal}
          saving={checkIn.saving}
          errorMessage={checkIn.saveError}
          onDismissError={checkIn.dismissSaveError}
          onSave={async (input) => {
            const saved = await checkIn.save(input);
            if (saved) setAnnouncement("Check-in saved.");
            return saved;
          }}
          onRemove={async () => {
            const removed = await checkIn.remove();
            if (removed) setAnnouncement("Check-in removed.");
            return removed;
          }}
          onClose={() => {
            checkIn.dismissSaveError();
            setCheckInOpen(false);
          }}
        />
      )}

      <DeleteReflectionDialog
        open={deleteOpen && activeSession !== null}
        title={activeSession?.title ?? ""}
        deleting={workspace.deleteStatus === "pending"}
        errorMessage={workspace.deleteError}
        onCancel={() => {
          workspace.dismissDeleteError();
          setDeleteOpen(false);
        }}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
