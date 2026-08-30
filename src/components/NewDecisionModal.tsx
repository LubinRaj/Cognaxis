import React, { useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { X, CheckCircle2, Building2 } from 'lucide-react';
import { DecisionRecord } from '../types';

interface NewDecisionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewDecisionModal: React.FC<NewDecisionModalProps> = ({ isOpen, onClose }) => {
  const { activeOrgId, organizations, addDecision } = useWorkspace();
  const [title, setTitle] = useState('');
  const [contextText, setContextText] = useState('');
  const [decisionText, setDecisionText] = useState('');
  const [rationaleText, setRationaleText] = useState('');
  const [impactArea, setImpactArea] = useState('Core Architecture & Security');
  const [status, setStatus] = useState<DecisionRecord['status']>('approved');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !decisionText.trim()) return;

    addDecision({
      title: title.trim(),
      context: contextText.trim(),
      decision: decisionText.trim(),
      rationale: rationaleText.trim(),
      impactArea,
      status,
      sourceMemoryIds: [],
      verificationNotes: 'Enforced by runtime architectural authorization rules.'
    });

    setTitle('');
    setContextText('');
    setDecisionText('');
    setRationaleText('');
    onClose();
  };

  const activeOrg = organizations.find(o => o.orgId === activeOrgId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-bold text-white">
              Log RFC Decision for {activeOrg?.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-300">Decision Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Enforce Pre-Query Vector Scope Filtering on Firestore"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-300">Impact Area</label>
              <input
                type="text"
                value={impactArea}
                onChange={(e) => setImpactArea(e.target.value)}
                placeholder="e.g. Backend API, Storage, AI"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-300">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="draft">Draft</option>
                <option value="proposed">Proposed</option>
                <option value="approved">Approved</option>
                <option value="implemented">Implemented</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-300">Context & Problem Statement</label>
            <textarea
              rows={2}
              value={contextText}
              onChange={(e) => setContextText(e.target.value)}
              placeholder="Describe why this decision was evaluated..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-300">Agreed Decision</label>
            <textarea
              required
              rows={2}
              value={decisionText}
              onChange={(e) => setDecisionText(e.target.value)}
              placeholder="The precise technical or organizational policy agreed upon..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-300">Rationale</label>
            <textarea
              rows={2}
              value={rationaleText}
              onChange={(e) => setRationaleText(e.target.value)}
              placeholder="Why this option was chosen over alternatives..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
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
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors shadow-sm"
            >
              Log Decision RFC
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
