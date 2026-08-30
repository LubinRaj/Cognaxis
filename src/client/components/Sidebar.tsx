import { useState, useMemo } from "react";
import {
  Plus,
  Search,
  BookOpen,
  Building2,
  Lock,
  LogOut,
  ShieldCheck,
  X,
  MessageSquare,
} from "lucide-react";
import type { User } from "firebase/auth";
import type { JournalSession } from "../../shared/schemas";

interface SidebarProps {
  user: User;
  sessions: JournalSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCreateSession: () => void;
  onSignOut: () => void;
  isBusy: boolean;
  isLoading: boolean;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

function getInitials(user: User): string {
  const source = user.displayName || user.email || "C";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function Sidebar({
  user,
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateSession,
  onSignOut,
  isBusy,
  isLoading,
  isOpenMobile,
  onCloseMobile,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, searchQuery]);

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-black/75 backdrop-blur-xs lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-emerald-500/15 bg-[#06110e]/98 p-4 backdrop-blur-xl transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
          isOpenMobile ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between pb-3 border-b border-emerald-500/10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400/20 to-teal-600/10 text-emerald-400 border border-emerald-400/30 shadow-sm font-bold font-mono">
              C
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold tracking-tight text-white text-base">Cognaxis</span>
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <span className="text-[10px] font-medium text-emerald-400/80">Personal Vault MVP</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-lg p-1 text-zinc-400 hover:text-zinc-200 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scope Switcher */}
        <div className="mt-4">
          <label className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase px-1">
            Workspace Boundary
          </label>
          <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-xl bg-[#091815] p-1 border border-emerald-500/15">
            <button
              type="button"
              className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/20 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 border border-emerald-500/30 shadow-xs"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>Personal</span>
            </button>
            <button
              type="button"
              disabled
              title="Organization scope is isolated and requires tenant admin onboarding"
              className="flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-400 cursor-not-allowed opacity-60"
            >
              <Building2 className="h-3.5 w-3.5" />
              <span>Org</span>
              <Lock className="h-2.5 w-2.5 text-zinc-500 ml-0.5" />
            </button>
          </div>
        </div>

        {/* New Reflection Button */}
        <button
          type="button"
          onClick={() => {
            onCreateSession();
            onCloseMobile();
          }}
          disabled={isBusy}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-4 py-2.5 text-xs font-semibold text-emerald-950 shadow-md hover:from-emerald-400 hover:to-teal-300 transition-all hover:shadow-emerald-500/20 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          <span>New Reflection</span>
        </button>

        {/* Search Filter */}
        <div className="relative mt-3">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search reflections..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-emerald-500/15 bg-[#0a1815] py-1.5 pl-8 pr-3 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-200 text-xs"
            >
              ×
            </button>
          )}
        </div>

        {/* Reflections List */}
        <div className="mt-4 flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-1 pb-1.5">
            <span className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
              Recent Reflections ({sessions.length})
            </span>
          </div>

          <div className="flex flex-1 flex-col gap-1 overflow-y-auto pr-1">
            {isLoading ? (
              <div className="py-6 text-center text-xs text-zinc-500">Loading reflections...</div>
            ) : filteredSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center px-2">
                <BookOpen className="h-6 w-6 text-zinc-600 mb-2" />
                <p className="text-xs text-zinc-400 font-medium">
                  {searchQuery ? "No matching reflections" : "No reflections yet"}
                </p>
                <p className="text-[11px] text-zinc-600 mt-0.5">
                  {searchQuery ? "Try a different search keyword" : "Start your first private reflection"}
                </p>
              </div>
            ) : (
              filteredSessions.map((session) => {
                const isActive = activeSessionId === session.id;
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => {
                      onSelectSession(session.id);
                      onCloseMobile();
                    }}
                    disabled={isBusy}
                    className={`group relative flex flex-col items-start rounded-xl p-2.5 text-left transition-all ${
                      isActive
                        ? "bg-gradient-to-r from-emerald-500/15 to-emerald-500/5 text-emerald-200 border border-emerald-500/30 shadow-xs"
                        : "hover:bg-[#0c1f1a] text-zinc-300 border border-transparent"
                    }`}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-emerald-400" />
                    )}
                    <span className="line-clamp-1 text-xs font-medium group-hover:text-white transition-colors">
                      {session.title}
                    </span>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-2.5 w-2.5" />
                        {session.messageCount} msg{session.messageCount !== 1 ? "s" : ""}
                      </span>
                      <span>•</span>
                      <span>
                        {new Date(session.createdAt).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* User Profile & Sign Out Footer */}
        <div className="mt-auto border-t border-emerald-500/10 pt-3">
          <div className="flex items-center justify-between rounded-xl bg-[#091815] p-2 border border-emerald-500/15">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300 font-semibold text-xs border border-emerald-500/30">
                {getInitials(user)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-zinc-200">
                  {user.displayName || "Cognaxis User"}
                </p>
                <p className="truncate text-[10px] text-zinc-500">{user.email}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onSignOut}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800/60 hover:text-red-300 transition-colors"
              title="Sign out of private session"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
