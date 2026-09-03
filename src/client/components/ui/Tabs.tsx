import { useId, useRef, type ReactNode } from "react";

export type TabDefinition = {
  id: string;
  label: string;
};

export type TabsProps = {
  label: string;
  tabs: TabDefinition[];
  activeId: string;
  onChange: (id: string) => void;
  children: ReactNode;
};

// A compact accessible tab strip with roving tabindex and arrow-key movement. The caller renders
// the active panel as children inside the matching tabpanel container.
export function Tabs({ label, tabs, activeId, onChange, children }: TabsProps) {
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  function focusTab(index: number) {
    const target = tabs[(index + tabs.length) % tabs.length];
    if (!target) return;
    onChange(target.id);
    window.requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-tab-id="${target.id}"]`)
        ?.focus();
    });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeId);
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusTab(currentIndex + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusTab(currentIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusTab(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusTab(tabs.length - 1);
    }
  }

  return (
    <div>
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="border-outline-variant flex gap-1 overflow-x-auto border-b"
      >
        {tabs.map((tab) => {
          const selected = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              data-tab-id={tab.id}
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${activeId}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              className={`focus-visible:outline-focus-ring min-h-11 shrink-0 border-b-2 px-4 text-sm font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 motion-safe:transition-colors motion-safe:duration-feedback ${
                selected
                  ? "border-primary text-primary"
                  : "text-on-surface-variant hover:text-on-surface border-transparent"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel-${activeId}`}
        aria-labelledby={`${baseId}-tab-${activeId}`}
        tabIndex={0}
        className="focus-visible:outline-focus-ring pt-4 focus-visible:outline-2 focus-visible:-outline-offset-2"
      >
        {children}
      </div>
    </div>
  );
}
