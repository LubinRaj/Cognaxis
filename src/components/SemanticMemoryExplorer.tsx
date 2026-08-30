import React, { useState, useMemo } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { searchSemanticMemories } from '../lib/semanticEngine';
import {
  Search,
  ShieldCheck,
  Cpu,
  Layers,
  Sparkles,
  GitBranch,
  Lock,
  Building2,
  Calendar,
  AlertTriangle
} from 'lucide-react';

export const SemanticMemoryExplorer: React.FC = () => {
  const {
    currentUser,
    activeScope,
    activeOrgId,
    allMemories,
    organizations,
  } = useWorkspace();

  const [query, setQuery] = useState('zero trust gateway token verification');

  const scopeId = activeScope === 'personal' ? currentUser.uid : activeOrgId;
  const activeOrg = organizations.find(o => o.orgId === activeOrgId);

  const searchOutcome = useMemo(() => {
    return searchSemanticMemories(query, allMemories, activeScope, scopeId);
  }, [query, allMemories, activeScope, scopeId]);

  return (
    <div className="space-y-6">
      {/* Header & Verification Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Tenant-Scoped Semantic Retrieval Engine
              </h2>
              <p className="text-xs text-slate-400">
                Mathematical proof & vector similarity ranking with pre-query partition enforcement
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono bg-sky-950 text-sky-300 px-3 py-1.5 rounded-lg border border-sky-800/60 font-semibold flex items-center space-x-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Invariant T10: Scope Bound</span>
            </span>
          </div>
        </div>

        {/* Search Query Input */}
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a semantic question or concept (e.g. 'zero trust architecture', 'zk proofs')..."
            className="w-full bg-slate-950 text-slate-100 placeholder-slate-500 border border-slate-700 rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:border-sky-500 transition-colors font-medium shadow-inner"
          />
          <Search className="w-5 h-5 text-slate-500 absolute left-3.5 top-3.5" />
        </div>

        {/* Scope Partition Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <span className="text-slate-500 block text-[10px] uppercase font-mono">Active Retrieval Scope</span>
            <span className="font-mono text-sky-300 font-semibold truncate block mt-0.5">
              {searchOutcome.scopePath}
            </span>
          </div>
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <span className="text-slate-500 block text-[10px] uppercase font-mono">Authorized Candidates</span>
            <span className="font-mono text-emerald-400 font-semibold text-sm block mt-0.5">
              {searchOutcome.totalCandidatesEvaluated} memory documents
            </span>
          </div>
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <span className="text-slate-500 block text-[10px] uppercase font-mono">Cross-Tenant Isolation</span>
            <span className="font-mono text-slate-300 font-semibold text-sm block mt-0.5">
              {searchOutcome.crossScopeFilteredOutCount} foreign scopes blocked
            </span>
          </div>
        </div>
      </div>

      {/* Retrieval Results Matrix */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
          <Cpu className="w-4 h-4 text-sky-400" />
          <span>Ranked Semantic Context (Cosine Distance Metric)</span>
        </h3>

        {searchOutcome.results.length === 0 ? (
          <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-xl p-8 text-center text-slate-500">
            <p className="text-sm font-medium">No semantic memories found in this authorized partition.</p>
          </div>
        ) : (
          searchOutcome.results.map(({ item, similarityScore, provenanceTag }, index) => (
            <div
              key={item.id}
              className="bg-slate-900 border border-slate-800 hover:border-sky-500/50 rounded-xl p-4 transition-all space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-md bg-sky-500/10 text-sky-400 text-xs font-bold flex items-center justify-center border border-sky-500/20">
                    #{index + 1}
                  </span>
                  <h4 className="text-sm font-bold text-slate-100">{item.title}</h4>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    {item.category}
                  </span>
                </div>

                {/* Similarity Score Badge */}
                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 text-xs font-mono">
                    <span className="text-slate-500 text-[10px]">SIMILARITY:</span>
                    <span className={`font-bold ${
                      similarityScore > 0.6 ? 'text-emerald-400' : similarityScore > 0.3 ? 'text-sky-400' : 'text-slate-400'
                    }`}>
                      {(similarityScore * 100).toFixed(1)}%
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-1 rounded border border-emerald-800/40">
                    Scoped: {item.scopeType}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-lg border border-slate-800/60">
                {item.content}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-400">
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-[10px] text-slate-500">
                    ID: {item.id}
                  </span>
                  <span>•</span>
                  <span className="font-mono text-[10px] text-sky-400">
                    Provenance: {provenanceTag}
                  </span>
                </div>
                <div className="flex items-center space-x-1">
                  <Calendar className="w-3 h-3 text-slate-500" />
                  <span>{new Date(item.createdAt).toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
