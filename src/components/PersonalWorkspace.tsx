import React, { useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { MemoryItem } from '../types';
import {
  Lock,
  Sparkles,
  Send,
  Share2,
  Trash2,
  Tag,
  ShieldCheck,
  Calendar,
  AlertCircle,
  FileText,
  Lightbulb,
  Bookmark
} from 'lucide-react';

interface PersonalWorkspaceProps {
  onOpenShareModal: (memory: MemoryItem) => void;
  onOpenNewMemory: () => void;
}

export const PersonalWorkspace: React.FC<PersonalWorkspaceProps> = ({
  onOpenShareModal,
  onOpenNewMemory,
}) => {
  const {
    currentUser,
    personalMemories,
    deleteMemory,
    chatMessages,
    sendChatMessage,
  } = useWorkspace();

  const [inputPrompt, setInputPrompt] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredMemories = personalMemories.filter(mem => {
    const matchCategory = selectedCategory === 'all' || mem.category === selectedCategory;
    const matchSearch =
      mem.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mem.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mem.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchCategory && matchSearch;
  });

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
      {/* Scope Security Guarantee Banner */}
      <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-xl p-4 flex items-start space-x-3.5 text-slate-200">
        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 mt-0.5 border border-emerald-500/20">
          <Lock className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center space-x-2">
            <h3 className="text-sm font-semibold text-emerald-300">Personal Intelligence Scope</h3>
            <span className="text-[10px] font-mono bg-emerald-900/60 text-emerald-400 px-2 py-0.5 rounded border border-emerald-700/40">
              users/{currentUser.uid}/personalMemories
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            <strong>Security Invariant T07 Enforced:</strong> Your personal reflections, private notes, and derived summaries are strictly confidential. Organization administrators and employers have zero access to this workspace. Items can only enter an organization through an explicit, verified confirmation flow.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Private Memories Stream (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Action and Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-300">Category:</span>
              <div className="flex space-x-1">
                {['all', 'reflection', 'note', 'insight'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1 rounded-lg text-xs capitalize transition-colors ${
                      selectedCategory === cat
                        ? 'bg-emerald-600 text-white font-medium'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search reflections..."
                className="bg-slate-950 text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-200 focus:outline-none focus:border-emerald-500 w-44"
              />
              <button
                onClick={onOpenNewMemory}
                className="bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
              >
                + New
              </button>
            </div>
          </div>

          {/* Memory Items List */}
          <div className="space-y-3">
            {filteredMemories.length === 0 ? (
              <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-xl p-8 text-center text-slate-500">
                <FileText className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                <p className="text-sm font-medium">No personal reflections found.</p>
                <p className="text-xs text-slate-500 mt-1">Create your first private reflection or note above.</p>
              </div>
            ) : (
              filteredMemories.map(mem => (
                <div
                  key={mem.id}
                  className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all space-y-3 group"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded font-semibold ${
                          mem.category === 'reflection'
                            ? 'bg-purple-950 text-purple-300 border border-purple-800/50'
                            : mem.category === 'insight'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800/50'
                            : 'bg-slate-800 text-slate-300'
                        }`}>
                          {mem.category}
                        </span>
                        <span className="text-xs text-slate-400 flex items-center space-x-1">
                          <Calendar className="w-3 h-3" />
                          <span>{new Date(mem.createdAt).toLocaleDateString()}</span>
                        </span>
                        {mem.isSharedToOrg && (
                          <span className="text-[10px] font-medium text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                            Shared to Org Copy
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-semibold text-slate-100">{mem.title}</h4>
                    </div>

                    <div className="flex items-center space-x-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        title="Explicitly Share Copy to Organization (Section 7 Flow)"
                        onClick={() => onOpenShareModal(mem)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                      <button
                        title="Delete (Cascades to Derived Summaries & Embeddings)"
                        onClick={() => deleteMemory(mem.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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
        </div>

        {/* Right Column: Interactive Personal Intelligence Companion (5 cols) */}
        <div className="lg:col-span-5 flex flex-col h-[650px] bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden">
          {/* Header */}
          <div className="p-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-200">Personal AI Reflection Engine</h3>
                <p className="text-[10px] text-slate-500 font-mono">Fenced context | Zero cross-tenant leakage</p>
              </div>
            </div>
            <span className="text-[10px] font-mono bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded border border-emerald-800/40">
              Verified UID
            </span>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3.5 text-xs">
            {chatMessages
              .filter(m => m.scopeType === 'personal')
              .map(msg => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[90%] p-3 rounded-xl ${
                      msg.sender === 'user'
                        ? 'bg-emerald-600 text-white rounded-br-none'
                        : 'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-bl-none'
                    }`}
                  >
                    <div className="leading-relaxed whitespace-pre-wrap">{msg.content}</div>

                    {/* Attestation Pill if generated by assistant */}
                    {msg.securityAttestation && (
                      <div className="mt-2 pt-2 border-t border-slate-700/50 flex flex-wrap items-center gap-1.5 text-[9px] font-mono text-emerald-400">
                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                        <span>Scope: users/{currentUser.uid.substring(0, 8)}...</span>
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
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Evaluating bounded personal context...</span>
              </div>
            )}
          </div>

          {/* Chat Input */}
          <form onSubmit={handleSendMessage} className="p-3 bg-slate-950 border-t border-slate-800 flex items-center space-x-2">
            <input
              type="text"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              placeholder="Ask reflections or synthesize private insights..."
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={isSending || !inputPrompt.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white p-2 rounded-lg transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
