import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { useAuth } from "../../auth/AuthProvider";
import { isSessionFull } from "../../workspace/session-sync";
import { useWorkspaceController } from "../../workspace/use-workspace-controller";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { EmptyState } from "../ui/EmptyState";
import { InlineAlert } from "../ui/InlineAlert";
import { Dialog } from "../ui/Dialog";
import { ConversationSkeleton } from "../ui/Skeleton";
import { TextField } from "../ui/TextField";
import { useFocusTrap, useScrollLock } from "../ui/use-focus-trap";
import { useSessionSignal } from "../../workspace/use-session-signal";
import { useApiClient } from "../../lib/use-api-client";
import type { JournalSession, PersonalOpenLoop, Preferences, SessionDetail } from "../../../shared/schemas";
import { normalizeReflectionTag, sanitizeReflectionTags } from "../../../shared/reflection-tags";
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
  initialOrganizationId,
}: {
  user: User;
  initialSessionId?: string;
  initialOrganizationId?: string;
}) {
  const [organizationId, setOrganizationId] = useState<string | null>(initialOrganizationId ?? null);

  return (
    <ScopedWorkspaceShell
      key={organizationId ?? "personal"}
      user={user}
      initialSessionId={initialSessionId}
      organizationId={organizationId}
      onScopeChange={setOrganizationId}
    />
  );
}

function ScopedWorkspaceShell({
  user,
  initialSessionId,
  organizationId,
  onScopeChange,
}: {
  user: User;
  initialSessionId?: string;
  organizationId: string | null;
  onScopeChange: (organizationId: string | null) => void;
}) {
  const { globalError, clearGlobalError } = useAuth();
  const workspace = useWorkspaceController(user, initialSessionId, organizationId);
  const api = useApiClient(user);
  const teamScope = organizationId !== null;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportSession, setExportSession] = useState<SessionDetail | null>(null);
  const [renameTarget, setRenameTarget] = useState<JournalSession | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renamePending, setRenamePending] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [tagTarget, setTagTarget] = useState<JournalSession | null>(null);
  const [tagDraft, setTagDraft] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagPending, setTagPending] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [catalogTags, setCatalogTags] = useState<string[]>([]);
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<JournalSession | null>(null);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkInNudge, setCheckInNudge] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const checkIn = useSessionSignal(user, teamScope ? null : workspace.activeSessionId);
  const drawerRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<ReflectionSummaryHandle>(null);
  const nudgedSessions = useRef(new Set<string>());
  const [locationMode, setLocationMode] = useState<Preferences["locationMode"]>("off");
  const [openLoops, setOpenLoops] = useState<PersonalOpenLoop[]>([]);
  const loadActiveAttachment = useCallback(
    (attachmentId: string) => {
      if (!workspace.activeSessionId) return Promise.reject(new Error("No active reflection"));
      return organizationId
        ? api.getOrganizationAttachment(organizationId, workspace.activeSessionId, attachmentId)
        : api.getPersonalAttachment(workspace.activeSessionId, attachmentId);
    },
    [api, organizationId, workspace.activeSessionId],
  );

  useEffect(() => {
    let active = true;
    if (teamScope) return;
    void api
      .getPreferences()
      .then((preferences) => {
        if (active) setLocationMode(preferences?.locationMode ?? "off");
      })
      .catch(() => {
        // Preferences are an enhancement to the capture flow; a failed read must never block
        // the journal or create an unhandled rejection during auth/session transitions.
      });
    return () => {
      active = false;
    };
  }, [api, teamScope]);

  useEffect(() => {
    let active = true;
    const request = organizationId ? api.listOrganizationTags(organizationId) : api.listReflectionTags();
    void request.then((tags) => {
      if (active) setCatalogTags(sanitizeReflectionTags(tags, 100));
    }).catch(() => {
      // Existing session tags remain filterable even if the optional catalog read is unavailable.
    });
    return () => {
      active = false;
    };
  }, [api, organizationId]);

  useEffect(() => {
    let active = true;
    if (teamScope) {
      return;
    }
    void api.listPersonalOpenLoops()
      .then((loops) => {
        if (active) setOpenLoops(loops);
      })
      .catch(() => {
        // Open loops are a derived convenience; the private journal remains usable if unavailable.
      });
    return () => {
      active = false;
    };
  }, [api, teamScope]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  useFocusTrap(drawerRef, drawerOpen, closeDrawer);
  useScrollLock(drawerOpen);

  const { activeSession, sessionStatus, workspaceStatus, sendStatus } = workspace;

  // A check-in is an invitation, never a gate. New captures receive one contextual nudge; a
  // long-paused reflection gets one more nudge when the person returns to it in this visit.
  useEffect(() => {
    if (teamScope || !activeSession || activeSession.status !== "active" || checkIn.status !== "ready" || nudgedSessions.current.has(activeSession.id)) return;
    const lastActivity = Date.parse(activeSession.updatedAt);
    const lastCheckIn = checkIn.signal ? Date.parse(checkIn.signal.capturedAt) : Number.NEGATIVE_INFINITY;
    const returningAfterPause =
      Number.isFinite(lastActivity) &&
      Date.now() - lastActivity >= 12 * 60 * 60 * 1_000 &&
      Date.now() - lastCheckIn >= 12 * 60 * 60 * 1_000;
    if (returningAfterPause) {
      // Defer the visual nudge to the next task. It avoids interrupting the data-loading render,
      // and the cleanup keeps Strict Mode's effect replay from showing duplicate nudges. The
      // nudge is intentionally non-modal: returning to a reflection must not steal focus or block
      // history, export, delete, or keyboard navigation.
      const timer = window.setTimeout(() => {
        if (nudgedSessions.current.has(activeSession.id)) return;
        nudgedSessions.current.add(activeSession.id);
        setCheckInNudge(true);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [activeSession, checkIn.signal, checkIn.status, teamScope]);
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

  function openRename(session: JournalSession) {
    setRenameTarget(session);
    setRenameTitle(session.title);
    setRenameError(null);
  }

  function openManageTags(session: JournalSession) {
    setTagTarget(session);
    setTagDraft([...(session.tags ?? [])]);
    setTagInput("");
    setTagError(null);
  }

  function addDraftTag(value = tagInput) {
    const normalized = normalizeReflectionTag(value);
    if (normalized && tagDraft.includes(normalized)) {
      setTagInput("");
      setTagError(null);
      return;
    }
    const next = sanitizeReflectionTags([...tagDraft, value]);
    if (next.length === tagDraft.length && value.trim()) {
      setTagError("Use a short tag with letters, numbers, spaces, or - / &.");
    } else {
      setTagDraft(next);
      setTagInput("");
      setTagError(null);
    }
  }

  async function confirmTags() {
    if (!tagTarget || tagPending) return;
    setTagPending(true);
    const saved = await workspace.updateSessionTags(tagTarget.id, tagDraft);
    setTagPending(false);
    if (saved) {
      setCatalogTags((current) => sanitizeReflectionTags([...current, ...tagDraft], 100));
      setTagTarget(null);
      setTagError(null);
      setAnnouncement("Reflection tags updated.");
    } else {
      setTagError("These tags could not be saved. Try again.");
    }
  }

  async function openExport(session: JournalSession) {
    try {
      let detail: SessionDetail;
      if (session.id === activeSession?.id && activeSession) {
        detail = activeSession;
      } else if (organizationId) {
        const teamSession = await api.getOrganizationSession(organizationId, session.id);
        detail = {
          ...teamSession,
          summary: teamSession.summary ? { ...teamSession.summary, sourceMessageIds: [] } : null,
        };
      } else {
        detail = await api.getSession(session.id);
      }
      setExportSession(detail);
      setExportOpen(true);
    } catch (error) {
      setAnnouncement(error instanceof Error ? error.message : "This reflection could not be opened for export.");
    }
  }

  async function confirmRename() {
    if (!renameTarget || renamePending) return;
    const title = renameTitle.trim();
    if (!title) return;
    setRenamePending(true);
    const renamed = await workspace.renameSession(renameTarget.id, title);
    setRenamePending(false);
    if (renamed) {
      setRenameTarget(null);
      setRenameError(null);
      setAnnouncement("Reflection renamed.");
    } else {
      setRenameError("This reflection could not be renamed. Try again.");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const deleted = await workspace.deleteActiveSession();
    if (deleted) {
      setDeleteOpen(false);
      setDeleteTarget(null);
      setAnnouncement("Reflection deleted.");
    }
  }

  async function archiveActive() {
    const archived = await workspace.archiveActiveSession();
    if (archived) setAnnouncement("Reflection archived.");
  }

  const availableTags = useMemo(
    () => sanitizeReflectionTags([
      ...catalogTags,
      ...workspace.sessions.flatMap((session) => session.tags ?? []),
    ], 100).sort((left, right) => left.localeCompare(right)),
    [catalogTags, workspace.sessions],
  );
  const historySessions = useMemo(
    () => tagFilters.length > 0
      ? workspace.visibleSessions.filter((session) => tagFilters.some((tag) => (session.tags ?? []).includes(tag)))
      : workspace.visibleSessions,
    [tagFilters, workspace.visibleSessions],
  );

  const history = (
    <ReflectionHistory
      sessions={historySessions}
      totalSessions={workspace.sessions.length}
      activeSessionId={workspace.activeSessionId}
      status={workspaceStatus}
      createStatus={workspace.createStatus}
      errorMessage={workspace.workspaceError}
      query={workspace.query}
      onQueryChange={workspace.setQuery}
      availableTags={availableTags}
      selectedTags={tagFilters}
      onTagFiltersChange={setTagFilters}
      onSelect={selectFromHistory}
      onRename={openRename}
      onManageTags={openManageTags}
      onExport={(session) => void openExport(session)}
      onArchive={(session) => {
        void workspace.archiveSession(session.id).then((archived) => {
          if (archived) setAnnouncement("Reflection archived.");
        });
      }}
      onCreate={createFromHistory}
      onRetry={workspace.retryWorkspace}
      openLoops={openLoops}
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
              sessions={historySessions}
              totalSessions={workspace.sessions.length}
              activeSessionId={workspace.activeSessionId}
              status={workspaceStatus}
              createStatus={workspace.createStatus}
              errorMessage={workspace.workspaceError}
              query={workspace.query}
              onQueryChange={workspace.setQuery}
              availableTags={availableTags}
              selectedTags={tagFilters}
              onTagFiltersChange={setTagFilters}
              onSelect={selectFromHistory}
              onRename={openRename}
              onManageTags={openManageTags}
              onExport={(session) => void openExport(session)}
              onArchive={(session) => {
                void workspace.archiveSession(session.id).then((archived) => {
                  if (archived) setAnnouncement("Reflection archived.");
                });
              }}
              onCreate={createFromHistory}
              onRetry={workspace.retryWorkspace}
              openLoops={openLoops}
              drawerMode
              onCloseDrawer={closeDrawer}
            />
          </nav>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <WorkspaceAppBar
          user={user}
          currentOrganizationId={organizationId}
          onScopeChange={onScopeChange}
          session={activeSession}
          summaryState={workspace.summaryState}
          messagePending={activeMessagePending}
          summaryBlocked={summaryBlocked}
          hasCheckIn={!teamScope && checkIn.signal !== null}
          checkInDisabled={teamScope || checkIn.status === "loading"}
          onOpenHistory={() => setDrawerOpen(true)}
          onSummary={handleSummaryAction}
          onCheckIn={() => {
            if (checkIn.status === "error") {
              checkIn.reload();
              return;
            }
            setCheckInOpen(true);
            setCheckInNudge(false);
          }}
          onExport={() => {
            setExportSession(activeSession);
            setExportOpen(true);
          }}
          onArchive={() => void archiveActive()}
          onDelete={() => {
            if (!activeSession) return;
            setDeleteTarget(activeSession);
            workspace.dismissDeleteError();
            setDeleteOpen(true);
          }}
        />

        <main id="reflection-main" className="flex min-h-0 flex-1 flex-col">
          <div aria-live="polite" className="sr-only">
            {announcement}
          </div>

          {(globalError ?? workspace.summaryError ?? workspace.sessionError ?? workspace.archiveError ?? renameError) && (
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
              {renameError && (
                <InlineAlert tone="error" className="mt-2" onDismiss={() => setRenameError(null)}>
                  {renameError}
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
              {workspace.archiveError && (
                <InlineAlert
                  tone="error"
                  className="mt-2"
                  onDismiss={workspace.dismissArchiveError}
                >
                  {workspace.archiveError}
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
                    editDisabled={checkIn.saving || activeSession.status !== "active"}
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
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="mx-auto flex min-h-0 w-full max-w-[900px] flex-1 flex-col px-4 py-6 sm:px-6">
                <ConversationSkeleton />
              </div>
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
                    onUpdate={activeSession.status === "active" ? () => void workspace.createSummary() : undefined}
                    onCopyResult={setAnnouncement}
                  />
                </div>
              )}
              <ConversationThread
                messages={activeSession.messages}
                pending={activeMessagePending}
                onCopyResult={setAnnouncement}
                loadAttachment={loadActiveAttachment}
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
              {checkInNudge && (
                <div className="mx-auto flex w-full max-w-[900px] items-center justify-between gap-3 px-4 pb-2 sm:px-6">
                  <p className="text-on-surface-variant text-xs sm:text-sm">
                    You’re back in this reflection. Add a private check-in?
                  </p>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="compact"
                      variant="text"
                      onClick={() => {
                        setCheckInOpen(true);
                        setCheckInNudge(false);
                      }}
                    >
                      Check in
                    </Button>
                    <Button
                      size="compact"
                      variant="text"
                      onClick={() => setCheckInNudge(false)}
                    >
                      Not now
                    </Button>
                  </div>
                </div>
              )}
              <ReflectionComposer
                draft={workspace.draft}
                onDraftChange={workspace.setDraft}
                onSubmit={() => void send()}
                attachments={workspace.attachments}
                onUploadAttachment={workspace.uploadAttachment}
                onRemoveAttachment={workspace.removeAttachment}
                onTranscribeAttachment={workspace.transcribeAttachment}
                onTranscribeVoice={workspace.transcribeVoice}
                attachmentError={workspace.attachmentError}
                sending={activeMessagePending}
                submissionBlocked={anotherMessagePending}
                submissionBlockedReason="Another reflection is still waiting for a response."
                disabled={activeSession.status !== "active" || sessionFull || sessionStatus === "pending" || activeMessagePending}
                disabledReason={
                  activeSession.status !== "active"
                    ? "This reflection is archived. Restore it to continue."
                    : sessionFull
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

      <ExportDialog
        open={exportOpen}
        session={exportSession}
        onClose={() => {
          setExportOpen(false);
          setExportSession(null);
        }}
      />

      <Dialog
        open={renameTarget !== null}
        title="Rename reflection"
        description="Choose a short name you will recognize in your reflection list."
        onClose={() => {
          if (!renamePending) {
            setRenameTarget(null);
            setRenameError(null);
          }
        }}
        busy={renamePending}
        actions={
          <>
            <Button
              variant="text"
              onClick={() => {
                setRenameTarget(null);
                setRenameError(null);
              }}
              disabled={renamePending}
            >
              Cancel
            </Button>
            <Button onClick={() => void confirmRename()} loading={renamePending} disabled={renameTitle.trim().length === 0}>
              Save name
            </Button>
          </>
        }
      >
        <TextField
          label="Reflection name"
          value={renameTitle}
          maxLength={120}
          autoFocus
          onChange={(event) => setRenameTitle(event.target.value)}
        />
      </Dialog>

      <Dialog
        open={tagTarget !== null}
        title="Manage tags"
        description="Use up to five broad labels to organize and find this reflection later."
        onClose={() => {
          if (!tagPending) {
            setTagTarget(null);
            setTagError(null);
          }
        }}
        busy={tagPending}
        actions={
          <>
            <Button
              variant="text"
              onClick={() => {
                setTagTarget(null);
                setTagError(null);
              }}
              disabled={tagPending}
            >
              Cancel
            </Button>
            <Button onClick={() => void confirmTags()} loading={tagPending}>Save tags</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex min-h-9 flex-wrap gap-2" aria-label="Current tags">
            {tagDraft.length === 0 ? (
              <p className="text-on-surface-variant text-sm">No tags yet.</p>
            ) : tagDraft.map((tag) => (
              <Chip key={tag} icon="label">
                <span>{tag}</span>
                <button
                  type="button"
                  aria-label={`Remove ${tag}`}
                  className="hover:text-on-surface focus-visible:outline-focus-ring rounded-full focus-visible:outline-2"
                  onClick={() => setTagDraft((current) => current.filter((item) => item !== tag))}
                >
                  ×
                </button>
              </Chip>
            ))}
          </div>
          {availableTags.some((tag) => !tagDraft.includes(tag)) && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reflection-existing-tag" className="text-on-surface text-sm font-medium">Choose a saved tag</label>
              <select
                id="reflection-existing-tag"
                defaultValue=""
                onChange={(event) => {
                  if (event.target.value) addDraftTag(event.target.value);
                  event.target.value = "";
                }}
                className="border-outline bg-surface text-on-surface focus-visible:outline-focus-ring min-h-11 rounded-xl border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <option value="">Choose a tag…</option>
                {availableTags.filter((tag) => !tagDraft.includes(tag)).map((tag) => <option key={tag} value={tag}>{tag}</option>)}
              </select>
            </div>
          )}
          <TextField
            label="Create a new tag"
            placeholder="e.g. work, family, learning"
            value={tagInput}
            maxLength={48}
            error={tagError}
            onChange={(event) => setTagInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                addDraftTag();
              }
            }}
          />
          <p className="text-on-surface-variant text-xs">Press Enter after each tag. Tags are also used by reflection search.</p>
        </div>
      </Dialog>

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
            setCheckInNudge(false);
          }}
          nudge={checkInNudge}
          locationMode={locationMode}
        />
      )}

      <DeleteReflectionDialog
        open={deleteOpen && deleteTarget !== null}
        title={deleteTarget?.title ?? ""}
        deleting={workspace.deleteStatus === "pending"}
        errorMessage={workspace.deleteError}
        onCancel={() => {
          workspace.dismissDeleteError();
          setDeleteOpen(false);
          setDeleteTarget(null);
        }}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
