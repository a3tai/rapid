/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MCP_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Wails bindings
declare global {
  interface Window {
    go?: {
      main?: {
        App?: {
          GetDaemonStatus(): Promise<unknown>
          GetAgents(): Promise<unknown>
          GetTasks(status: string): Promise<unknown>
          GetMessages(limit: number): Promise<unknown>
          CreateTask(title: string, description: string, priority: string, tags: string[]): Promise<unknown>
          SpawnAgent(persona: string, worktree: string): Promise<void>
          StopAgent(agentID: string): Promise<void>
          GetConfig(): Promise<Record<string, unknown>>
          SaveConfig(config: Record<string, unknown>): Promise<void>
        }
      }
    }
  }
}
