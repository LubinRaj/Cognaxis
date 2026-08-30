import React, { useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { X, Lock, Building2, Plus, Tag } from 'lucide-react';
import { MemoryItem } from '../types';

interface NewMemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewMemoryModal: React.FC<NewMemoryModalProps> = ({ isOpen, onClose }) => {
  const { activeScope, activeOrgId, organizations, addMemory } = useWorkspace();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<MemoryItem['category']>('reflection');
  const [tagsInput, setTagsInput] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    const tags = tagsInput
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(Boolean);

    addMemory({
      title: title.trim(),
      content: content.trim(),
      category,
      tags: tags.length > 0 ? tags : ['general'],
      isSharedToOrg: false,
    });

    setTitle('');
    setContent('');
    setTagsInput('');
    onClose();
  };

  const activeOrg = organizations.find(o => o.orgId === activeOrgId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            {activeScope === 'personal' ? (
              <Lock className="w-5 h-5 text-emerald-400" />
            ) : (
              <Building2 className="w-5 h-5 text-indigo-400" />
            )}
            <h3 className="text-base font-bold text-white">
              Log {activeScope === 'personal' ? 'Personal Memory' : 'Organization Knowledge'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="text-xs text-slate-400 bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono">
          Target Scope: {activeScope === 'personal' ? 'users/{verified_uid}/personalMemories' : `organizations/${activeOrgId}/memories`}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-300">Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Zero-Trust API Key Rotation Protocol..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-300">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              >
                <option value="reflection">Reflection</option>
                <option value="insight">Insight</option>
                <option value="decision">Decision</option>
                <option value="note">Note</option>
                <option value="update">Update</option>
                <option value="meeting">Meeting Note</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-300">Tags (comma-separated)</label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="security, architecture, q3"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-300">Content</label>
            <textarea
              required
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Document your observations, technical rationale, or reflections..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors shadow-sm"
            >
              Save Record
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
