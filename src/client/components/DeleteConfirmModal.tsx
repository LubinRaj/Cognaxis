import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, Trash2, X } from "lucide-react";

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  isBusy: boolean;
}

export function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  isBusy,
}: DeleteConfirmModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 backdrop-blur-xs"
            onClick={!isBusy ? onClose : undefined}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-md rounded-2xl border border-red-500/20 bg-[#0c1815] p-6 shadow-2xl z-10"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-500/10 text-red-400 border border-red-500/20">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={isBusy}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200 transition-colors"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4">
              <h3 id="modal-title" className="text-lg font-semibold text-zinc-100">
                Delete Reflection
              </h3>
              <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                Are you sure you want to delete <span className="text-zinc-200 font-medium">"{title}"</span>?
                This permanently purges all messages and its derived personal memory from your private workspace.
              </p>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isBusy}
                className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white rounded-lg border border-zinc-700/50 hover:bg-zinc-800/50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isBusy}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600/90 hover:bg-red-500 rounded-lg border border-red-500/30 transition-all shadow-sm disabled:opacity-50"
              >
                {isBusy ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {isBusy ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
