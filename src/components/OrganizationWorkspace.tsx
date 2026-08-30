import React, { useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  Building2,
  Users,
  CheckCircle2,
  FileCode2,
  Sparkles,
  Send,
  Calendar,
  Tag,
  ShieldAlert,
  ShieldCheck,
  Plus,
  GitBranch,
  Layers
} from 'lucide-react';

interface OrganizationWorkspaceProps {
  onOpenNewDecision: () => void;
  onOpenNewMemory: () => void;
}

export const OrganizationWorkspace: React.FC<OrganizationWorkspaceProps> = ({
  onOpenNewDecision,
  onOpenNewMemory,
}) => {
  const {
    currentUser,
    organizations,
    activeOrgId,
    setActiveOrgId,
    memberships,
    orgMemories,
    decisions,
    chatMessages,
    sendChatMessage,
  } = useWorkspace();

  const [activeSubTab, setActiveSubTab] = useState<'memories' | 'decisions' | 'members'>('memories');
  const [inputPrompt, setInputPrompt] = useState('');
  const [isSending, setIsSending] = useState(false);

  const activeOrg = organizations.find(o => o.orgId === activeOrgId) || organizations[0];
  const userMembership = memberships.find(m => m.orgId === activeOrgId && m.uid === currentUser.uid);

  // Filter items specifically for the active organization
  const currentOrgMemories = orgMemories.filter(m => m.scopeId === activeOrgId);
  const currentOrgDecisions = decisions.filter(d => d.orgId === activeOrgId);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPrompt.trim() || isSending) return;

    const msg = inputPrompt.trim();
    setInputPrompt('');
    setIsSending(true);
    try {
      await sendChatMessage(msg);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Organization Header & Authorization Banner */}
      <div className="bg-indigo-950/40 border border-indigo-800/50 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-slate-200">
        <div className="flex items-start space-x-3.5">
          <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400 mt-0.5 border border-indigo-500/20">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-white">{activeOrg.name}</h3>
              <span className="text-[10px] font-mono bg-indigo-900/60 text-indigo-300 px-2 py-0.5 rounded border border-indigo-700/40 font-semibold">
                organizations/{activeOrg.orgId}
              </span>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-bold">
                Your Role: {userMembership?.role || 'member'}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">{activeOrg.description}</p>
          </div>
        </div>

        {/* Org Quick Actions */}
        <div className="flex items-center space-x-2">
          <button
            onClick={onOpenNewDecision}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex items-center space-x-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Log Decision</span>
          </button>
          <button
            onClick={onOpenNewMemory}
            className="bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex items-center space-x-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Org Knowledge</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Left Tabs & Right AI Assistant */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Sub Navigation Bar */}
          <div className="flex items-center justify-between bg-slate-900/80 p-2 rounded-xl border border-slate-800">
            <div className="flex space-x-1">
              <button
                onClick={() => setActiveSubTab('memories')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeSubTab === 'memories'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Organizational Knowledge ({currentOrgMemories.length})
              </button>

              <button
                onClick={() => setActiveSubTab('decisions')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeSubTab === 'decisions'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                RFC Decisions ({currentOrgDecisions.length})
              </button>

              <button
                onClick={() => setActiveSubTab('members')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeSubTab === 'members'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Members & RBAC
              </button>
            </div>
          </div>

          {/* Sub-tab 1: Organizational Memories */}
          {activeSubTab === 'memories' && (
            <div className="space-y-3">
              {currentOrgMemories.length === 0 ? (
                <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-xl p-8 text-center text-slate-500">
                  <Layers className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                  <p className="text-sm font-medium">No organizational memories in this workspace yet.</p>
                </div>
              ) : (
                currentOrgMemories.map(mem => (
                  <div
                    key={mem.id}
                    className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all space-y-2.5"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800/50">
                            {mem.category}
                          </span>
                          {mem.provenanceId && (
                            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                              Provenance: {mem.provenanceId}
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-semibold text-slate-100">{mem.title}</h4>
                      </div>
                      <span className="text-xs text-slate-500 font-mono">
                        {new Date(mem.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {mem.content}
                    </p>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {mem.tags.map(tag => (
                        <span
                          key={tag}
                          className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Sub-tab 2: RFC Decisions Board */}
          {activeSubTab === 'decisions' && (
            <div className="space-y-3">
              {currentOrgDecisions.length === 0 ? (
                <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-xl p-8 text-center text-slate-500">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                  <p className="text-sm font-medium">No decision records logged yet.</p>
                </div>
              ) : (
                currentOrgDecisions.map(dec => (
                  <div
                    key={dec.id}
                    className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded font-bold bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                            {dec.status}
                          </span>
                          <span className="text-xs font-mono text-slate-400">
                            Area: {dec.impactArea}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-100">{dec.title}</h4>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">
                        RFC #{dec.id}
                      </span>
                    </div>

                    <div className="space-y-2 bg-slate-950/70 p-3 rounded-lg border border-slate-800/80 text-xs">
                      <div>
                        <span className="font-semibold text-slate-300">Context: </span>
                        <span className="text-slate-400">{dec.context}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-emerald-300">Decision: </span>
                        <span className="text-slate-200">{dec.decision}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-300">Rationale: </span>
                        <span className="text-slate-400">{dec.rationale}</span>
                      </div>
                      {dec.verificationNotes && (
                        <div className="text-[11px] text-emerald-400 font-mono pt-1">
                          ✓ Verification: {dec.verificationNotes}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Sub-tab 3: Members & Role-Based Access Control */}
          {activeSubTab === 'members' && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Active Tenant Memberships (Zero-Trust Model)
              </h4>
              <div className="space-y-2">
                {memberships
                  .filter(m => m.orgId === activeOrgId)
                  .map(m => (
                    <div
                      key={m.uid}
                      className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-xs text-indigo-400">
                          {m.uid === currentUser.uid ? 'YOU' : 'USR'}
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-200">
                            {m.uid === currentUser.uid ? currentUser.displayName : 'Authorized Organization Member'}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500">{m.uid}</div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-mono font-bold uppercase bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded">
                          Role: {m.role}
                        </span>
                        <span className="text-[10px] text-emerald-400 font-medium bg-emerald-950/60 px-2 py-0.5 rounded">
                          Active
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Organization AI Intelligence Assistant (5 cols) */}
        <div className="lg:col-span-5 flex flex-col h-[650px] bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden">
          {/* Header */}
          <div className="p-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-200">Organization Intelligence Sentinel</h3>
                <p className="text-[10px] text-slate-500 font-mono">Scoped to {activeOrg.name}</p>
              </div>
            </div>
            <span className="text-[10px] font-mono bg-indigo-950 text-indigo-400 px-2 py-0.5 rounded border border-indigo-800/40">
              Role: {userMembership?.role}
            </span>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3.5 text-xs">
            {chatMessages
              .filter(m => m.scopeType === 'organization' && m.scopeId === activeOrgId)
              .map(msg => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[90%] p-3 rounded-xl ${
                      msg.sender === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-none'
                        : 'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-bl-none'
                    }`}
                  >
                    <div className="leading-relaxed whitespace-pre-wrap">{msg.content}</div>

                    {msg.securityAttestation && (
                      <div className="mt-2 pt-2 border-t border-slate-700/50 flex flex-wrap items-center gap-1.5 text-[9px] font-mono text-indigo-300">
                        <ShieldCheck className="w-3 h-3 text-indigo-400" />
                        <span>Scope: organizations/{activeOrgId}</span>
                        <span>•</span>
                        <span>{msg.securityAttestation.model}</span>
                      </div>
                    )}
                  </div>
                  <span className="text-[9px] text-slate-500 mt-1 font-mono">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            {isSending && (
              <div className="flex items-center space-x-2 text-slate-400 text-xs italic">
                <div className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                <span>Evaluating bounded organization context...</span>
              </div>
            )}
          </div>

          {/* Chat Input */}
          <form onSubmit={handleSendMessage} className="p-3 bg-slate-950 border-t border-slate-800 flex items-center space-x-2">
            <input
              type="text"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              placeholder="Query organizational memory, RFCs, or decisions..."
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={isSending || !inputPrompt.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white p-2 rounded-lg transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
