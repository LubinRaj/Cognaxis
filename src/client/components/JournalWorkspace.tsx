import { signOut, type User } from "firebase/auth";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type {
  JournalMessage,
  JournalSession,
  PersonalMemory,
  SessionDetail,
} from "../../shared/schemas";
import { ApiClient } from "../lib/api-client";
import { auth } from "../lib/firebase";

type Props = { user: User };

function initials(user: User) {
  const source = user.displayName || user.email || "C";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function JournalWorkspace({ user }: Props) {
  const api = useMemo(() => new ApiClient(() => user), [user]);
  const [sessions, setSessions] = useState<JournalSession[]>([]);
  const [active, setActive] = useState<SessionDetail | null>(null);
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState<PersonalMemory | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

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
      requestAnimationFrame(() => composer.current?.focus());
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
    setActive((current) => (current ? { ...current, messages: [...current.messages, optimistic] } : current));
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
          : current,
      );
      if (exchange.summary) setSummary(exchange.summary);
    } catch (requestError) {
      setActive((current) =>
        current
          ? { ...current, messages: current.messages.filter((item) => item.id !== optimistic.id) }
          : current,
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
    if (!window.confirm("Delete this conversation and its derived summary? This cannot be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteSession(active.id);
      const remaining = sessions.filter((session) => session.id !== active.id);
      setSessions(remaining);
      setSummary(null);
      setActive(remaining[0] ? await api.getSession(remaining[0].id) : null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to delete the session.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><span className="brand-mark small">C</span> Cognaxis</div>
        <div className="scope-switcher" aria-label="Workspace scope">
          <button className="scope-button active">Personal</button>
          <button className="scope-button" disabled title="Organization setup is not implemented yet">Organization</button>
        </div>
        <button className="primary-button wide" onClick={() => void createSession()} disabled={busy}>
          + New reflection
        </button>
        <nav className="session-list" aria-label="Journal sessions">
          <p className="nav-label">Recent reflections</p>
          {sessions.map((session) => (
            <button
              key={session.id}
              className={`session-item ${active?.id === session.id ? "active" : ""}`}
              onClick={() => void openSession(session.id)}
              disabled={busy}
            >
              <span>{session.title}</span>
              <small>{session.messageCount} messages</small>
            </button>
          ))}
          {!loading && sessions.length === 0 ? (
            <p className="empty-nav">Your reflections will appear here.</p>
          ) : null}
        </nav>
        <div className="profile-card">
          <span className="avatar">{initials(user)}</span>
          <span><strong>{user.displayName || "Cognaxis user"}</strong><small>{user.email}</small></span>
          <button className="text-button" onClick={() => auth && void signOut(auth)}>Sign out</button>
        </div>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Personal workspace</p>
            <h1>{active?.title ?? "A private place to think"}</h1>
          </div>
          <div className="header-actions">
            <button className="secondary-button" onClick={() => void summarize()} disabled={!active || busy || (active?.messages.length ?? 0) < 2}>Summarize</button>
            <button className="danger-button" onClick={() => void removeSession()} disabled={!active || busy}>Delete</button>
          </div>
        </header>

        <section className="privacy-banner">
          <span className="privacy-icon" aria-hidden="true">◇</span>
          <div><strong>Personal scope selected</strong><p>Requests are authorized against your verified identity before data access.</p></div>
        </section>

        {error ? <div className="error-banner" role="alert">{error}</div> : null}

        <section className="conversation" aria-live="polite">
          {loading ? <p className="empty-state">Loading your private workspace…</p> : null}
          {!loading && !active ? (
            <div className="empty-state rich">
              <span className="empty-symbol">✦</span>
              <h2>Begin with what is on your mind</h2>
              <p>Explore an idea, record a decision, or unpack a difficult question.</p>
              <button className="primary-button" onClick={() => void createSession()} disabled={busy}>Start a reflection</button>
            </div>
          ) : null}
          {active?.messages.map((item) => (
            <article key={item.id} className={`message ${item.role}`}>
              <span className="message-role">{item.role === "user" ? "You" : "Cognaxis"}</span>
              <p>{item.content}</p>
            </article>
          ))}
          {busy && active ? <p className="thinking">Cognaxis is thinking…</p> : null}
        </section>

        {summary ? (
          <aside className="summary-card" aria-labelledby="summary-title">
            <p className="eyebrow">Saved personal memory</p>
            <h2 id="summary-title">{summary.title}</h2>
            <p>{summary.summary}</p>
            <div className="theme-list">{summary.themes.map((theme) => <span key={theme}>{theme}</span>)}</div>
          </aside>
        ) : null}

        <form className="composer" onSubmit={(event) => void submit(event)}>
          <label className="sr-only" htmlFor="journal-message">Write a journal message</label>
          <textarea
            id="journal-message"
            ref={composer}
            value={message}
            maxLength={8_000}
            placeholder={active ? "Write what you are thinking…" : "Start a reflection first"}
            onChange={(event) => setMessage(event.target.value)}
            disabled={!active || busy}
            rows={2}
          />
          <div className="composer-footer">
            <span>{message.length.toLocaleString()} / 8,000</span>
            <button className="primary-button" type="submit" disabled={!active || busy || !message.trim()}>Send</button>
          </div>
        </form>
      </main>
    </div>
  );
}
