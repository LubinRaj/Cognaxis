import React, { useState } from 'react';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';
import { Navbar } from './components/Navbar';
import { PersonalWorkspace } from './components/PersonalWorkspace';
import { OrganizationWorkspace } from './components/OrganizationWorkspace';
import { SemanticMemoryExplorer } from './components/SemanticMemoryExplorer';
import { SecurityConsole } from './components/SecurityConsole';
import { AuditLogViewer } from './components/AuditLogViewer';
import { ShareConfirmationModal } from './components/ShareConfirmationModal';
import { NewMemoryModal } from './components/NewMemoryModal';
import { NewDecisionModal } from './components/NewDecisionModal';
import { MemoryItem } from './types';

const MainApp: React.FC = () => {
  const { activeScope } = useWorkspace();
  const [currentTab, setCurrentTab] = useState<'workspace' | 'semantic' | 'security' | 'audit'>('workspace');
  
  // Modals state
  const [sharingMemory, setSharingMemory] = useState<MemoryItem | null>(null);
  const [isNewMemoryOpen, setIsNewMemoryOpen] = useState(false);
  const [isNewDecisionOpen, setIsNewDecisionOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        onOpenNewMemory={() => setIsNewMemoryOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentTab === 'workspace' && (
          <>
            {activeScope === 'personal' ? (
              <PersonalWorkspace
                onOpenShareModal={(mem) => setSharingMemory(mem)}
                onOpenNewMemory={() => setIsNewMemoryOpen(true)}
              />
            ) : (
              <OrganizationWorkspace
                onOpenNewDecision={() => setIsNewDecisionOpen(true)}
                onOpenNewMemory={() => setIsNewMemoryOpen(true)}
              />
            )}
          </>
        )}

        {currentTab === 'semantic' && <SemanticMemoryExplorer />}
        {currentTab === 'security' && <SecurityConsole />}
        {currentTab === 'audit' && <AuditLogViewer />}
      </main>

      {/* Modals */}
      <ShareConfirmationModal
        memory={sharingMemory}
        onClose={() => setSharingMemory(null)}
      />

      <NewMemoryModal
        isOpen={isNewMemoryOpen}
        onClose={() => setIsNewMemoryOpen(false)}
      />

      <NewDecisionModal
        isOpen={isNewDecisionOpen}
        onClose={() => setIsNewDecisionOpen(false)}
      />

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500 font-mono">
        Cognaxis Security Architecture v1.0 • Phase 1 Baseline • Multi-Tenant Zero-Trust Intelligence
      </footer>
    </div>
  );
};

export function App() {
  return (
    <WorkspaceProvider>
      <MainApp />
    </WorkspaceProvider>
  );
}

export default App;
