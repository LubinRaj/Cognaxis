import { useEffect, useState, useMemo } from "react";
import { MaterialIcon } from "../MaterialIcon";
import { ApiClient } from "../../lib/api-client";
import type { User } from "firebase/auth";
import type { UserOrganizationEdge, OrganizationInvite, AuditEvent } from "../../../shared/schemas";

type Props = {
  user: User;
  onNavigate: (path: string) => void;
};

type OrgMember = {
  uid: string;
  orgId: string;
  role: string;
  status: string;
  joinedAt: string;
};

export function OrganizationsDashboard({ user, onNavigate }: Props) {
  const api = useMemo(() => new ApiClient(() => user), [user]);
  const [orgs, setOrgs] = useState<UserOrganizationEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [selectedOrgTab, setSelectedOrgTab] = useState<"members" | "invites" | "audit">("members");

  // Create Org Modal state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  // Accept / Join with Invite Token Modal state
  const [showJoin, setShowJoin] = useState(false);
  const [joinToken, setJoinToken] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinMessage, setJoinMessage] = useState<string | null>(null);

  // Org detail data
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invites, setInvites] = useState<OrganizationInvite[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // New invite generation
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">("member");
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let live = true;
    api
      .request<{ organizations: UserOrganizationEdge[] }>("/organizations")
      .then((res) => {
        if (live) {
          setOrgs(res.organizations);
          setLoading(false);
        }
      })
      .catch(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [api, refreshKey]);

  const selectedOrg = useMemo(() => {
    return orgs.find((o) => o.orgId === selectedOrgId) ?? null;
  }, [orgs, selectedOrgId]);

  useEffect(() => {
    if (!selectedOrgId) return;
    let live = true;
    if (selectedOrgTab === "members") {
      api
        .request<{ members: OrgMember[] }>(`/organizations/${selectedOrgId}/members`)
        .then((res) => {
          if (live) {
            setMembers(res.members);
            setDetailLoading(false);
          }
        })
        .catch(() => {
          if (live) setDetailLoading(false);
        });
    } else if (selectedOrgTab === "invites") {
      api
        .request<{ invites: OrganizationInvite[] }>(`/organizations/${selectedOrgId}/invites`)
        .then((res) => {
          if (live) {
            setInvites(res.invites);
            setDetailLoading(false);
          }
        })
        .catch(() => {
          if (live) setDetailLoading(false);
        });
    } else if (selectedOrgTab === "audit") {
      api
        .request<{ auditEvents: AuditEvent[] }>(`/organizations/${selectedOrgId}/audit-events`)
        .then((res) => {
          if (live) {
            setAuditEvents(res.auditEvents);
            setDetailLoading(false);
          }
        })
        .catch(() => {
          if (live) setDetailLoading(false);
        });
    }
    return () => {
      live = false;
    };
  }, [api, selectedOrgId, selectedOrgTab, refreshKey]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreateBusy(true);
    try {
      await api.request("/organizations", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null }),
      });
      setRefreshKey((k) => k + 1);
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
    } catch (err) {
      alert(String(err));
    } finally {
      setCreateBusy(false);
    }
  }

  async function handleJoinInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!joinToken.trim()) return;
    setJoinBusy(true);
    setJoinMessage(null);
    try {
      const res = await api.request<{ success: boolean; organizationName: string; role: string }>("/organizations/invites/accept", {
        method: "POST",
        body: JSON.stringify({ secret: joinToken.trim() }),
      });
      setJoinMessage(`Successfully joined ${res.organizationName} as ${res.role}!`);
      setRefreshKey((k) => k + 1);
      setTimeout(() => {
        setShowJoin(false);
        setJoinToken("");
        setJoinMessage(null);
      }, 1500);
    } catch (err: unknown) {
      setJoinMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setJoinBusy(false);
    }
  }

  async function handleGenerateInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrgId) return;
    setInviteBusy(true);
    setGeneratedToken(null);
    try {
      const res = await api.request<{ token: string; inviteId: string; expiresAt: string }>(
        `/organizations/${selectedOrgId}/invites`,
        {
          method: "POST",
          body: JSON.stringify({ role: inviteRole }),
        },
      );
      setGeneratedToken(res.token);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      alert(String(err));
    } finally {
      setInviteBusy(false);
    }
  }

  async function handleRevokeInvite(inviteId: string) {
    if (!selectedOrgId) return;
    if (!confirm("Are you sure you want to revoke this invitation?")) return;
    try {
      await api.request(`/organizations/${selectedOrgId}/invites/${inviteId}`, { method: "DELETE" });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      alert(String(err));
    }
  }

  async function handleRemoveMember(targetUid: string) {
    if (!selectedOrgId) return;
    if (!confirm("Remove this member from the organization?")) return;
    try {
      await api.request(`/organizations/${selectedOrgId}/members/${targetUid}`, { method: "DELETE" });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      alert(String(err));
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-[#060d0b] text-[#e8f3ef]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[#16201d] px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => (selectedOrgId ? setSelectedOrgId(null) : onNavigate("/journal"))}
            className="flex items-center gap-2 text-slate-400 hover:text-white"
          >
            <MaterialIcon name="arrow_back" size={20} />
            <span className="text-sm font-medium">{selectedOrgId ? "All Organizations" : "Back to Journal"}</span>
          </button>
          <div className="h-4 w-px bg-slate-700" />
          <h1 className="text-xl font-semibold">
            {selectedOrg ? selectedOrg.organizationName : "Organizations & Teams"}
          </h1>
          {selectedOrg && (
            <span className="rounded-full bg-teal-500/20 px-2.5 py-0.5 text-xs font-semibold text-teal-300 uppercase">
              {selectedOrg.role}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {!selectedOrgId && (
            <>
              <button
                onClick={() => setShowJoin(true)}
                className="flex items-center gap-2 rounded-xl border border-[#2d3734] px-4 py-2 text-sm font-medium text-slate-300 hover:bg-[#16201d] hover:text-white"
              >
                <MaterialIcon name="vpn_key" size={16} />
                Join with Code
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500"
              >
                <MaterialIcon name="add" size={16} />
                Create Organization
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6 lg:p-10">
        <div className="mx-auto max-w-5xl">
          {loading ? (
            <div className="flex justify-center py-16">
              <MaterialIcon name="progress_activity" size={32} className="animate-spin text-teal-500" />
            </div>
          ) : !selectedOrgId ? (
            /* Organizations List View */
            orgs.length === 0 ? (
              <div className="rounded-2xl border border-[#2d3734] bg-[#0d1614] p-12 text-center">
                <MaterialIcon name="groups" size={48} className="mx-auto mb-4 text-slate-600" />
                <h2 className="text-lg font-medium text-white mb-2">No organizations yet</h2>
                <p className="text-slate-400 mb-6 max-w-md mx-auto">
                  Create an organizational workspace or join an existing team with an invite token to collaborate with tenant isolation.
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => setShowJoin(true)}
                    className="rounded-xl border border-[#2d3734] px-5 py-2.5 text-sm font-medium text-slate-200 hover:bg-[#16201d]"
                  >
                    Join with Invite Code
                  </button>
                  <button
                    onClick={() => setShowCreate(true)}
                    className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-500"
                  >
                    Create Organization
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {orgs.map((org) => (
                  <div
                    key={org.orgId}
                    onClick={() => setSelectedOrgId(org.orgId)}
                    className="flex flex-col justify-between rounded-2xl border border-[#2d3734] bg-[#0d1614] p-6 hover:border-teal-500/50 cursor-pointer transition-colors group"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-950 text-teal-400">
                          <MaterialIcon name="groups" size={22} />
                        </div>
                        <span className="rounded-md bg-teal-500/10 px-2 py-1 text-xs font-semibold text-teal-300 uppercase">
                          {org.role}
                        </span>
                      </div>
                      <h3 className="text-lg font-medium text-white mb-1 group-hover:text-teal-400 transition-colors">
                        {org.organizationName}
                      </h3>
                      <p className="text-xs text-slate-500">
                        Joined {new Date(org.joinedAt).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="mt-6 flex items-center justify-between border-t border-[#16201d] pt-4 text-xs text-slate-400">
                      <span>Status: {org.status}</span>
                      <span className="flex items-center gap-1 text-teal-400 font-medium">
                        Manage <MaterialIcon name="arrow_forward" size={14} />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* Selected Organization Detail View */
            <div className="space-y-6">
              {/* Tabs */}
              <div className="flex border-b border-[#2d3734] gap-6">
                <button
                  onClick={() => setSelectedOrgTab("members")}
                  className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
                    selectedOrgTab === "members"
                      ? "border-teal-500 text-teal-400"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <MaterialIcon name="groups" size={18} />
                  Members
                </button>
                {(selectedOrg?.role === "owner" || selectedOrg?.role === "admin") && (
                  <>
                    <button
                      onClick={() => setSelectedOrgTab("invites")}
                      className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
                        selectedOrgTab === "invites"
                          ? "border-teal-500 text-teal-400"
                          : "border-transparent text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <MaterialIcon name="mark_email_unread" size={18} />
                      Invites & Access
                    </button>
                    <button
                      onClick={() => setSelectedOrgTab("audit")}
                      className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
                        selectedOrgTab === "audit"
                          ? "border-teal-500 text-teal-400"
                          : "border-transparent text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <MaterialIcon name="verified_user" size={18} />
                      Audit Trail
                    </button>
                  </>
                )}
              </div>

              {detailLoading ? (
                <div className="flex justify-center py-12">
                  <MaterialIcon name="progress_activity" size={28} className="animate-spin text-teal-500" />
                </div>
              ) : selectedOrgTab === "members" ? (
                /* Members Tab */
                <div className="rounded-2xl border border-[#2d3734] bg-[#0d1614] overflow-hidden">
                  <div className="p-4 border-b border-[#16201d] flex justify-between items-center">
                    <h3 className="text-sm font-semibold text-slate-300">Active Members ({members.length})</h3>
                  </div>
                  <div className="divide-y divide-[#16201d]">
                    {members.map((m) => (
                      <div key={m.uid} className="flex items-center justify-between p-4 hover:bg-[#16201d]/50">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-900/40 text-teal-400 text-xs font-semibold">
                            {m.uid.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-white flex items-center gap-2">
                              {m.uid === user.uid ? "You" : `Member (${m.uid.slice(0, 8)}…)`}
                              <span className="rounded bg-teal-500/10 px-2 py-0.5 text-[11px] font-semibold text-teal-300 uppercase">
                                {m.role}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500">
                              Joined {new Date(m.joinedAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>

                        {(selectedOrg?.role === "owner" || selectedOrg?.role === "admin") &&
                          m.role !== "owner" &&
                          m.uid !== user.uid && (
                            <button
                              onClick={() => { void handleRemoveMember(m.uid); }}
                              className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 rounded-lg px-2.5 py-1"
                            >
                              Remove
                            </button>
                          )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : selectedOrgTab === "invites" ? (
                /* Invites Tab */
                <div className="space-y-6">
                  {/* Create Invite Box */}
                  <div className="rounded-2xl border border-[#2d3734] bg-[#0d1614] p-6">
                    <h3 className="text-base font-medium text-white mb-2">Create Single-Use Invitation</h3>
                    <p className="text-xs text-slate-400 mb-4">
                      Generates a cryptographically random 256-bit secret token. Only the SHA-256 digest is stored server-side.
                    </p>
                    <form onSubmit={(e) => { void handleGenerateInvite(e); }} className="flex flex-wrap items-center gap-4">
                      <select
                        value={inviteRole}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "admin" || val === "member" || val === "viewer") {
                            setInviteRole(val);
                          }
                        }}
                        className="rounded-xl border border-[#2d3734] bg-[#060d0b] px-4 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
                      >
                        <option value="member">Role: Member</option>
                        <option value="admin">Role: Admin</option>
                        <option value="viewer">Role: Viewer</option>
                      </select>

                      <button
                        type="submit"
                        disabled={inviteBusy}
                        className="rounded-xl bg-teal-600 px-5 py-2 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50"
                      >
                        {inviteBusy ? "Generating…" : "Generate Token"}
                      </button>
                    </form>

                    {generatedToken && (
                      <div className="mt-4 rounded-xl border border-teal-500/40 bg-teal-950/40 p-4">
                        <div className="text-xs font-semibold uppercase tracking-wider text-teal-400 mb-1">
                          Generated Token (Single-Use, Expires in 7 Days):
                        </div>
                        <div className="flex items-center gap-3">
                          <input
                            readOnly
                            value={generatedToken}
                            className="flex-1 bg-[#060d0b] px-3 py-1.5 rounded text-xs font-mono text-teal-200 border border-teal-500/30"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(generatedToken);
                              setCopyFeedback(true);
                              setTimeout(() => setCopyFeedback(false), 2000);
                            }}
                            className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-500"
                          >
                            {copyFeedback ? "Copied!" : "Copy Token"}
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-2">
                          Share this token securely. The recipient can click "Join with Code" and paste this token to join.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Invites List */}
                  <div className="rounded-2xl border border-[#2d3734] bg-[#0d1614] overflow-hidden">
                    <div className="p-4 border-b border-[#16201d]">
                      <h3 className="text-sm font-semibold text-slate-300">Invitation History</h3>
                    </div>
                    {invites.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">No active or historical invitations.</div>
                    ) : (
                      <div className="divide-y divide-[#16201d]">
                        {invites.map((inv) => (
                          <div key={inv.id} className="flex items-center justify-between p-4 text-xs">
                            <div>
                              <div className="flex items-center gap-2 font-medium text-white">
                                <span>Invite ID: {inv.id.slice(0, 10)}…</span>
                                <span className="rounded bg-teal-500/10 px-2 py-0.5 font-semibold text-teal-300 uppercase">
                                  {inv.role}
                                </span>
                                <span
                                  className={`rounded px-1.5 py-0.5 font-semibold ${
                                    inv.status === "pending"
                                      ? "bg-amber-500/20 text-amber-300"
                                      : inv.status === "accepted"
                                      ? "bg-emerald-500/20 text-emerald-300"
                                      : "bg-red-500/20 text-red-300"
                                  }`}
                                >
                                  {inv.status}
                                </span>
                              </div>
                              <div className="text-slate-500 mt-0.5">
                                Expires: {new Date(inv.expiresAt).toLocaleDateString()}
                              </div>
                            </div>

                            {inv.status === "pending" && (
                              <button
                                onClick={() => { void handleRevokeInvite(inv.id); }}
                                className="text-red-400 hover:text-red-300 border border-red-500/30 rounded px-2 py-1"
                              >
                                Revoke
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Audit Trail Tab */
                <div className="rounded-2xl border border-[#2d3734] bg-[#0d1614] overflow-hidden">
                  <div className="p-4 border-b border-[#16201d]">
                    <h3 className="text-sm font-semibold text-slate-300">Security Audit Trail</h3>
                    <p className="text-xs text-slate-500">Immutable server-authoritative log of organization events.</p>
                  </div>
                  {auditEvents.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">No audit events recorded yet.</div>
                  ) : (
                    <div className="divide-y divide-[#16201d]">
                      {auditEvents.map((evt) => (
                        <div key={evt.id} className="p-4 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-teal-400 font-mono">{evt.eventType}</span>
                            <span className="text-slate-500">{new Date(evt.createdAt).toLocaleString()}</span>
                          </div>
                          <div className="text-slate-300">
                            Target: <span className="font-mono text-slate-400">{evt.targetType} ({evt.targetId.slice(0, 12)})</span>
                          </div>
                          {evt.reason && <div className="text-slate-400">{evt.reason}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Create Org Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-[#2d3734] bg-[#0d1614] p-6 shadow-2xl">
            <h2 className="text-lg font-medium text-white mb-4">Create Organization</h2>
            <form onSubmit={(e) => { void handleCreate(e); }}>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Organization Name</label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full rounded-xl border border-[#2d3734] bg-[#060d0b] px-4 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
                    placeholder="e.g. Acme Research Group"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Description (Optional)</label>
                  <textarea
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    rows={2}
                    className="w-full rounded-xl border border-[#2d3734] bg-[#060d0b] px-4 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
                    placeholder="Brief description of the workspace"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createBusy || !newName.trim()}
                  className="rounded-xl bg-teal-600 px-6 py-2 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50"
                >
                  {createBusy ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join with Invite Token Modal */}
      {showJoin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowJoin(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-[#2d3734] bg-[#0d1614] p-6 shadow-2xl">
            <h2 className="text-lg font-medium text-white mb-2">Join Organization</h2>
            <p className="text-xs text-slate-400 mb-4">
              Enter the single-use invitation secret token provided by your organization administrator.
            </p>
            <form onSubmit={(e) => { void handleJoinInvite(e); }}>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Invitation Token</label>
                  <input
                    type="text"
                    required
                    value={joinToken}
                    onChange={(e) => setJoinToken(e.target.value)}
                    className="w-full rounded-xl border border-[#2d3734] bg-[#060d0b] px-4 py-2 text-sm font-mono text-white focus:outline-none focus:border-teal-500"
                    placeholder="Paste 64-character token"
                  />
                </div>
                {joinMessage && (
                  <div
                    className={`rounded-xl p-3 text-xs ${
                      joinMessage.startsWith("Error")
                        ? "bg-red-500/10 border border-red-500/30 text-red-300"
                        : "bg-teal-500/10 border border-teal-500/30 text-teal-300"
                    }`}
                  >
                    {joinMessage}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowJoin(false)}
                  className="px-4 py-2 text-sm text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={joinBusy || !joinToken.trim()}
                  className="rounded-xl bg-teal-600 px-6 py-2 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50"
                >
                  {joinBusy ? "Joining…" : "Accept & Join"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
