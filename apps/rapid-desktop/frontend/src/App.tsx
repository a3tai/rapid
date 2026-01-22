import { useEffect, useState } from 'react';
import { useAppStore, useActiveView, useDaemonStatus } from './stores/app';
import { useData, useDataPolling } from './hooks/useData';
import { useWailsEvents } from './hooks/useWailsEvents';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { CommandPalette, useCommandPalette } from './components/CommandPalette';
import { SpawnAgentModal } from './components/SpawnAgentModal';
import { Dashboard } from './pages/Dashboard';
import { AgentsPage } from './pages/Agents';
import { AgentDetailPage } from './pages/AgentDetail';
import { TasksPage } from './pages/Tasks';
import { EventsPage } from './pages/Events';
import { KnowledgePage } from './pages/Knowledge';
import { Suggestions } from './pages/Suggestions';
import { ApprovalsPage } from './pages/Approvals';
import { ConfigPage } from './pages/Config';
import { ChatPage } from './pages/Chat';

function App() {
  const activeView = useActiveView();
  const daemonStatus = useDaemonStatus();
  const isConnecting = useAppStore((s) => s.isConnecting);
  const { initialize } = useData();
  const commandPalette = useCommandPalette();
  const [spawnAgentModal, setSpawnAgentModal] = useState<{
    isOpen: boolean;
    type?: 'worker' | 'orchestrator';
  }>({ isOpen: false });

  // Enable Wails event listening
  useWailsEvents();

  // Initialize data on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Poll for updates
  useDataPolling(5000);

  // Render active view
  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <Dashboard />;
      case 'agents':
        return <AgentsPage />;
      case 'agent-detail':
        return <AgentDetailPage />;
      case 'tasks':
        return <TasksPage />;
      case 'events':
        return <EventsPage />;
      case 'chat':
        return <ChatPage />;
      case 'knowledge':
        return <KnowledgePage />;
      case 'suggestions':
        return <Suggestions />;
      case 'approvals':
        return <ApprovalsPage />;
      case 'config':
        return <ConfigPage />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-rapid-bg">
      {/* Spawn Agent Modal */}
      <SpawnAgentModal
        isOpen={spawnAgentModal.isOpen}
        onClose={() => setSpawnAgentModal({ isOpen: false })}
        type={spawnAgentModal.type}
      />

      {/* Command Palette */}
      <CommandPalette
        isOpen={commandPalette.isOpen}
        onClose={commandPalette.close}
        onSpawnAgent={(type) => {
          setSpawnAgentModal({ isOpen: true, type });
          commandPalette.close();
        }}
      />

      {/* Sidebar navigation */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header with title bar */}
        <Header />

        {/* Connection status banner */}
        {isConnecting && (
          <div className="bg-rapid-accent/20 border-b border-rapid-accent/30 px-4 py-2 text-sm text-rapid-accent">
            Connecting to RAPID daemon...
          </div>
        )}

        {daemonStatus && !daemonStatus.running && (
          <div className="bg-rapid-warning/20 border-b border-rapid-warning/30 px-4 py-2 text-sm text-rapid-warning flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            Daemon is not running. Run{' '}
            <code className="bg-rapid-bg px-1 rounded">rapid daemon start</code> to start it.
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-auto p-6">{renderView()}</main>

        {/* Status bar */}
        <div className="h-6 bg-rapid-surface border-t border-rapid-border px-4 flex items-center justify-between text-xs text-rapid-muted">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${daemonStatus?.running ? 'bg-green-400' : 'bg-red-400'}`}
              />
              {daemonStatus?.running ? 'Connected' : 'Offline'}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={commandPalette.open}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-rapid-elevated hover:bg-rapid-border transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <kbd className="text-[10px]">⌘K</kbd>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
