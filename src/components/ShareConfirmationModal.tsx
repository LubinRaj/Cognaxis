import React, { useState } from 'react';
import { MemoryItem, Organization } from '../types';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  ShieldAlert,
  ArrowRight,
  Check,
  X,
  AlertTriangle,
  FileText,
  Lock,
  Building2,
  Receipt
} from 'lucide-react';

interface ShareConfirmationModalProps {
  memory: MemoryItem | null;
  onClose: () => void;
}

export const ShareConfirmationModal: React.FC<ShareConfirmationModalProps> = ({
  memory,
  onClose,
}) => {
  const { organizations, memberships, currentUser, sharePersonalToOrg } = useWorkspace();
  const [targetOrgId, setTargetOrgId] = useState<string>(organizations[0]?.orgId || '');
  const [customNote, setCustomNote] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!memory) return null;

  const targetOrg = organizations.find(o => o.orgId === targetOrgId);
  const userMembership = memberships.find(m => m.orgId === targetOrgId && m.uid === currentUser.uid);

  const handleConfirmShare = async () => {
    setIsSubmitting(true);
    try {
      const success = await sharePersonalToOrg(memory.id, targetOrgId, customNote);
      if (success) {
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Explicit Cross-Scope Promotion (Section 7 Protocol)
              </h3>
              <p className="text-xs text-slate-400">
                Personal intelligence → Organization workspace copy
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 1 ? (
          <div className="space-y-4">
            {/* Warning Box */}
            <div className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-3.5 flex items-start space-x-3 text-xs text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <span className="font-bold block">Invariant T20 Enforced: Zero Background Synchronization</span>
                <p className="text-slate-300">
                  Sharing creates an independent, immutable organization record. Future edits or deletions in your personal workspace will <strong>NOT</strong> silently sync to the organization.
                </p>
              </div>
            </div>

            {/* Source preview */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-300">Source Personal Item:</span>
                <span className="font-mono text-[10px]">users/{currentUser.uid}</span>
              </div>
              <h4 className="text-sm font-bold text-slate-100">{memory.title}</h4>
              <p className="text-xs text-slate-300 max-h-28 overflow-y-auto leading-relaxed whitespace-pre-wrap">
                {memory.content}
              </p>
            </div>

            {/* Target Org Selection */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Select Destination Organization:
              </label>
              <select
                value={targetOrgId}
                onChange={(e) => setTargetOrgId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                {organizations.map(org => (
                  <option key={org.orgId} value={org.orgId}>
                    {org.name} (Role: {memberships.find(m => m.orgId === org.orgId)?.role || 'None'})
                  </option>
                ))}
              </select>
            </div>

            {/* Optional Author Note */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Optional Context / Promotion Note:
              </label>
              <input
                type="text"
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                placeholder="e.g. Promoting this post-mortem for Q3 architectural roadmap..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end space-x-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center space-x-1.5"
              >
                <span>Review & Verify</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          /* Step 2: Final Verification & Provenance Receipt Preview */
          <div className="space-y-4">
            <div className="bg-slate-950 p-4 rounded-xl border border-indigo-900/60 space-y-3">
              <div className="flex items-center space-x-2 text-indigo-400 font-mono text-xs font-bold">
                <Receipt className="w-4 h-4" />
                <span>Auditable Provenance Receipt Preview</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="bg-slate-900 p-2 rounded">
                  <span className="text-slate-500 block text-[10px]">Source Scope</span>
                  <span className="text-slate-200">users/{currentUser.uid}</span>
                </div>
                <div className="bg-slate-900 p-2 rounded">
                  <span className="text-slate-500 block text-[10px]">Destination Org</span>
                  <span className="text-indigo-300">{targetOrg?.name}</span>
                </div>
                <div className="bg-slate-900 p-2 rounded">
                  <span className="text-slate-500 block text-[10px]">Effective Role</span>
                  <span className="text-emerald-400 font-bold uppercase">{userMembership?.role}</span>
                </div>
                <div className="bg-slate-900 p-2 rounded">
                  <span className="text-slate-500 block text-[10px]">Receipt ID</span>
                  <span className="text-amber-400">share_rec_{Date.now().toString().substring(6)}</span>
                </div>
              </div>

              <p className="text-xs text-slate-300 pt-1">
                By clicking <strong>Authorize Copy Creation</strong>, a new record is created under <code className="text-indigo-300 font-mono">organizations/{targetOrgId}/memories</code> with an immutable lineage tag linking back to this action.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200"
              >
                Back
              </button>

              <button
                type="button"
                onClick={handleConfirmShare}
                disabled={isSubmitting}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-xs font-bold transition-all shadow-md flex items-center space-x-2"
              >
                <Check className="w-4 h-4" />
                <span>{isSubmitting ? 'Verifying & Committing...' : 'Authorize Copy Creation'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
