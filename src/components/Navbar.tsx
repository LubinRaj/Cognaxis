import React from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  Shield,
  User,
  Building2,
  Lock,
  Search,
  Activity,
  FileCheck2,
  ChevronDown
} from 'lucide-react';

interface NavbarProps {
  currentTab: 'workspace' | 'semantic' | 'security' | 'audit';
  setCurrentTab: (tab: 'workspace' | 'semantic' | 'security' | 'audit') => void;
  onOpenNewMemory: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, setCurrentTab, onOpenNewMemory }) => {
  const {
    currentUser,
    activeScope,
    setActiveScope,
    organizations,
    activeOrgId,
    setActiveOrgId,
  } = useWorkspace();

  const activeOrg = organizations.find(o => o.orgId === activeOrgId) || organizations[0];

  return (
    <header className="bg-slate-900/90 backdrop-blur border-b border-slate-800 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-lg text-white tracking-tight">Cognaxis</span>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-semibold">
                    v1.0 Security Baseline
                  </span>
                </div>
              </div>
            </div>

            {/* Scope Switcher Pill */}
            <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                id="btn-scope-personal"
                onClick={() => setActiveScope('personal')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  activeScope === 'personal'
                    ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Personal Scope</span>
              </button>

              <button
                id="btn-scope-organization"
                onClick={() => setActiveScope('organization')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  activeScope === 'organization'
                    ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Organization Scope</span>
              </button>
            </div>

            {/* Org Selector dropdown when in org scope */}
            {activeScope === 'organization' && (
              <div className="relative">
                <select
                  id="select-active-org"
                  value={activeOrgId}
                  onChange={(e) => setActiveOrgId(e.target.value)}
                  className="bg-slate-950 text-xs font-medium text-slate-200 border border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
                >
                  {organizations.map(org => (
                    <option key={org.orgId} value={org.orgId}>
                      {org.name} ({org.slug})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center space-x-1">
            <button
              id="tab-nav-workspace"
              onClick={() => setCurrentTab('workspace')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                currentTab === 'workspace'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Workspace</span>
            </button>

            <button
              id="tab-nav-semantic"
              onClick={() => setCurrentTab('semantic')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                currentTab === 'semantic'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Search className="w-3.5 h-3.5 text-sky-400" />
              <span>Semantic Search</span>
            </button>

            <button
              id="tab-nav-security"
              onClick={() => setCurrentTab('security')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                currentTab === 'security'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span>Security & Threats (T01-T27)</span>
            </button>

            <button
              id="tab-nav-audit"
              onClick={() => setCurrentTab('audit')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                currentTab === 'audit'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <FileCheck2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>Audit Trail</span>
            </button>
          </nav>

          {/* User Profile & Quick Action */}
          <div className="flex items-center space-x-3">
            <button
              id="btn-quick-new-entry"
              onClick={onOpenNewMemory}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-all shadow-sm flex items-center space-x-1.5"
            >
              <span>+ Log Memory</span>
            </button>

            <div className="flex items-center space-x-2 pl-2 border-l border-slate-800">
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.displayName}
                className="w-7 h-7 rounded-full object-cover border border-slate-700"
              />
              <div className="hidden md:block text-left">
                <div className="text-xs font-medium text-slate-200">{currentUser.displayName}</div>
                <div className="text-[10px] font-mono text-slate-500">{currentUser.uid.substring(0, 10)}...</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
