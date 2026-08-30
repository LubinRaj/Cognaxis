import { X, ShieldCheck, Moon, Sun, Sparkles, Lock, RefreshCw } from "lucide-react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onResetMockData: () => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  theme,
  onToggleTheme,
  onResetMockData,
}: SettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#0f172a] text-slate-800 dark:text-slate-100 transition-all animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-sky-500" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Vault & App Preferences
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4 text-xs">
          {/* Appearance Switch */}
          <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white">Theme Mode</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Switch between curated porcelain light and obsidian dark
              </p>
            </div>
            <button
              type="button"
              onClick={onToggleTheme}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {theme === "light" ? (
                <>
                  <Sun className="h-3.5 w-3.5 text-amber-500" />
                  <span>Light</span>
                </>
              ) : (
                <>
                  <Moon className="h-3.5 w-3.5 text-sky-400" />
                  <span>Dark</span>
                </>
              )}
            </button>
          </div>

          {/* Privacy & Security Model */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
              <Lock className="h-3.5 w-3.5 text-sky-500" />
              <span>Personal Vault Isolation</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Zero cross-tenant data leaks. All personal reflections, extracted memories, and AI
              synthesized summaries remain strictly bounded within your private verified identity.
            </p>
          </div>

          {/* Intelligence Engine */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
              <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
              <span>Gemini Reflection Model</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              High-assurance personal reflection engine powered by Google DeepMind Gemini models with
              provenance tagging and local vault caching.
            </p>
          </div>

          {/* Reset Mock Data */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                onResetMockData();
                onClose();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <RefreshCw className="h-3.5 w-3.5 text-slate-400" />
              <span>Reset to Curated Sample Reflections</span>
            </button>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 dark:bg-sky-500 dark:text-slate-950"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
