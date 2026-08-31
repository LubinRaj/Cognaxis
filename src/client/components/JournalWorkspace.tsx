import type { User } from "firebase/auth";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertCircle } from "lucide-react";
import type {
  JournalMessage,
  JournalSession,
  PersonalMemory,
  SessionDetail,
} from "../../shared/schemas";
import { useAuth } from "../auth/AuthProvider";
import { ApiClient } from "../lib/api-client";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { ConversationView } from "./ConversationView";
import { Composer } from "./Composer";
import { MemoryCard } from "./MemoryCard";
import { DeleteConfirmModal } from "./DeleteConfirmModal";
import { ExportModal } from "./ExportModal";

type Props = { user: User };

export function JournalWorkspace({ user }: Props) {
  const {
    signOutAndReset,
    isSigningOut,
    reportSessionExpired,
    reportEmailVerificationRequired,
    globalError,
    clearGlobalError,
  } = useAuth();
  const api = useMemo(
    () =>
      new ApiClient(() => user, {
        onSessionExpired: reportSessionExpired,
        onEmailVerificationRequired: reportEmailVerificationRequired,
      }),
    [user, reportSessionExpired, reportEmailVerificationRequired],
  );
  const [sessions, setSessions] = useState<JournalSession[]>([]);
  const [active, setActive] = useState<SessionDetail | null>(null);
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState<PersonalMemory | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals and UI state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  useEffect(() => {
    let live = true;
    void api
      .listSessions()
      .then((items) => {
        if (!live) return;
        setSessions(items);
        if (items[0]) return api.getSession(items[0].id);
        return null;
      })
      .then((session) => {
        if (live && session) setActive(session);
      })
      .catch(() => {
        if (live) setError("The journal API is not ready. Check the server configuration.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [api]);

  async function openSession(sessionId: string) {
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      setActive(await api.getSession(sessionId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to open the session.");
    } finally {
      setBusy(false);
    }
  }

  async function createSession() {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createSession();
      setSessions((current) => [created, ...current]);
      setActive({ ...created, messages: [] });
      setSummary(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to start a session.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const content = message.trim();
    if (!active || !content || busy) return;
    setBusy(true);
    setMessage("");
    setError(null);
    const optimistic: JournalMessage = {
      id: `pending-${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    setActive((current) =>
      current ? { ...current, messages: [...current.messages, optimistic] } : current
    );

    try {
      const exchange = await api.addMessage(active.id, { content });
      setActive((current) =>
        current
          ? {
              ...current,
              messageCount: current.messageCount + 2,
              messages: [
                ...current.messages.filter((item) => item.id !== optimistic.id),
                exchange.userMessage,
                exchange.assistantMessage,
              ],
            }
          : current
      );
      if (exchange.summary) setSummary(exchange.summary);
    } catch (requestError) {
      setActive((current) =>
        current
          ? { ...current, messages: current.messages.filter((item) => item.id !== optimistic.id) }
          : current
      );
      setMessage(content);
      setError(requestError instanceof Error ? requestError.message : "Unable to send the message.");
    } finally {
      setBusy(false);
    }
  }

  async function summarize() {
    if (!active || busy) return;
    setBusy(true);
    setError(null);
    try {
      setSummary(await api.summarize(active.id));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create a summary.");
    } finally {
      setBusy(false);
    }
  }

  async function removeSession() {
    if (!active || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteSession(active.id);
      const remaining = sessions.filter((session) => session.id !== active.id);
      setSessions(remaining);
      setSummary(null);
      setIsDeleteModalOpen(false);
      setActive(remaining[0] ? await api.getSession(remaining[0].id) : null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to delete the session.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    if (isSigningOut) return;
    setError(null);
    setSessions([]);
    setActive(null);
    setSummary(null);
    setMessage("");
    await signOutAndReset();
  }

  const canSummarize = Boolean(active && active.messages.length >= 2);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#060d0b] text-[#e8f3ef]">
      {/* Sidebar Navigation */}
      <Sidebar
        user={user}
        sessions={sessions}
        activeSessionId={active?.id ?? null}
        onSelectSession={(id) => void openSession(id)}
        onCreateSession={() => void createSession()}
        onSignOut={() => void handleSignOut()}
        isBusy={busy || isSigningOut}
        isLoading={loading}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Workspace Area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          session={active}
          onOpenMobileMenu={() => setIsMobileSidebarOpen(true)}
          onSummarize={() => void summarize()}
          onExport={() => setIsExportModalOpen(true)}
          onDelete={() => setIsDeleteModalOpen(true)}
          isBusy={busy}
          canSummarize={canSummarize}
        />

        {/* Workspace Body */}
        <main className="relative flex flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-8">
          <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col">
            {/* Error Notification */}
            {(error ?? globalError) && (
              <div
                className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-sm text-red-300"
                role="alert"
              >
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
                  <span>{error ?? globalError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    clearGlobalError();
                  }}
                  className="text-xs text-red-300 underline hover:text-white"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Derived Memory Summary Card */}
            {summary && <MemoryCard summary={summary} />}

            {/* Messages Thread */}
            <ConversationView
              messages={active?.messages ?? []}
              isBusy={busy}
              isLoading={loading}
              hasActiveSession={Boolean(active)}
              onStartSession={() => void createSession()}
            />
          </div>

          {/* Composer at Bottom */}
          <Composer
            message={message}
            onChange={setMessage}
            onSubmit={(e) => void submit(e)}
            isBusy={busy}
            hasActiveSession={Boolean(active)}
            onQuickPrompt={(prompt) => setMessage(prompt)}
          />
        </main>
      </div>

      {/* Modals */}
      <DeleteConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={() => void removeSession()}
        title={active?.title ?? "this reflection"}
        isBusy={busy}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        session={active}
        summary={summary}
      />
    </div>
  );
}
