import { useEffect } from 'react'
import { useAppStore, useActiveView, useDaemonStatus } from './stores/app'
import { useWails, useDataPolling } from './hooks/useWails'
import { Sidebar } from './components/Sidebar'
import { Header } from './components/Header'
import { Dashboard } from './pages/Dashboard'
import { AgentsPage } from './pages/Agents'
import { TasksPage } from './pages/Tasks'
import { EventsPage } from './pages/Events'
import { ConfigPage } from './pages/Config'

function App() {
  const activeView = useActiveView()
  const daemonStatus = useDaemonStatus()
  const isConnecting = useAppStore((s) => s.isConnecting)
  const { initialize } = useWails()

  // Initialize data on mount
  useEffect(() => {
    initialize()
  }, [initialize])

  // Poll for updates
  useDataPolling(5000)

  // Render active view
  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <Dashboard />
      case 'agents':
        return <AgentsPage />
      case 'tasks':
        return <TasksPage />
      case 'events':
        return <EventsPage />
      case 'config':
        return <ConfigPage />
      default:
        return <Dashboard />
    }
  }

  return (
    <div className="flex h-screen bg-rapid-bg">
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Daemon is not running. Run <code className="bg-rapid-bg px-1 rounded">rapid daemon start</code> to start it.
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-auto p-6">
          {renderView()}
        </main>
      </div>
    </div>
  )
}

export default App
