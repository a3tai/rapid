import { useState, useEffect } from 'react'
import { clsx } from 'clsx'

export function ConfigPage() {
  const [config, setConfig] = useState<Record<string, unknown> | null>(null)
  const [activeTab, setActiveTab] = useState<'general' | 'personas' | 'mcp' | 'raw'>('general')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Load config from backend or use mock
    setLoading(true)
    setTimeout(() => {
      setConfig({
        $schema: './packages/schema/rapid.schema.json',
        project: {
          name: 'rapid',
          root: '.',
        },
        sandbox: {
          enabled: true,
          preset: 'balanced',
          allowNetwork: true,
        },
        secrets: {
          provider: 'env',
        },
        personas: {
          orchestrator: {
            systemPrompt: 'You are the orchestrator agent...',
            capabilities: ['coordination', 'planning', 'task-assignment'],
          },
          worker: {
            systemPrompt: 'You are a worker agent...',
            capabilities: ['coding', 'testing', 'debugging'],
          },
          designer: {
            systemPrompt: 'You are a designer agent...',
            capabilities: ['research', 'architecture', 'documentation'],
          },
        },
        mcp: {
          servers: {
            rapid: {
              command: 'pnpm',
              args: ['rapid-mcp'],
            },
            context7: {
              command: 'npx',
              args: ['-y', '@context7/mcp'],
            },
          },
        },
      })
      setLoading(false)
    }, 500)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-rapid-muted">Loading configuration...</div>
      </div>
    )
  }

  const personas = (config?.personas || {}) as Record<string, { systemPrompt?: string; capabilities?: string[] }>
  const mcpServers = (config?.mcp as { servers?: Record<string, unknown> })?.servers || {}

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Configuration</h2>
          <p className="text-rapid-muted text-sm mt-1">
            Manage your rapid.json settings
          </p>
        </div>
        <button className="btn btn-primary">
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
          Save Changes
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-rapid-border">
        {(['general', 'personas', 'mcp', 'raw'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={clsx(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize',
              activeTab === tab
                ? 'border-rapid-accent text-rapid-accent'
                : 'border-transparent text-rapid-muted hover:text-rapid-text'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="card p-6">
        {activeTab === 'general' && (
          <GeneralSettings config={config} />
        )}
        {activeTab === 'personas' && (
          <PersonaSettings personas={personas} />
        )}
        {activeTab === 'mcp' && (
          <McpSettings servers={mcpServers} />
        )}
        {activeTab === 'raw' && (
          <RawConfig config={config} />
        )}
      </div>
    </div>
  )
}

function GeneralSettings({ config }: { config: Record<string, unknown> | null }) {
  const project = (config?.project || {}) as { name?: string; root?: string }
  const sandbox = (config?.sandbox || {}) as { enabled?: boolean; preset?: string; allowNetwork?: boolean }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-4">Project</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Name</label>
            <input
              type="text"
              defaultValue={project.name}
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Root Directory</label>
            <input
              type="text"
              defaultValue={project.root}
              className="input w-full"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-rapid-border pt-6">
        <h3 className="font-semibold mb-4">Sandbox</h3>
        <div className="space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              defaultChecked={sandbox.enabled}
              className="rounded border-rapid-border bg-rapid-elevated"
            />
            <span className="text-sm">Enable sandboxing</span>
          </label>

          <div>
            <label className="block text-sm font-medium mb-2">Preset</label>
            <select defaultValue={sandbox.preset} className="input w-full max-w-xs">
              <option value="strict">Strict</option>
              <option value="balanced">Balanced</option>
              <option value="permissive">Permissive</option>
              <option value="none">None</option>
            </select>
          </div>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              defaultChecked={sandbox.allowNetwork}
              className="rounded border-rapid-border bg-rapid-elevated"
            />
            <span className="text-sm">Allow network access</span>
          </label>
        </div>
      </div>
    </div>
  )
}

function PersonaSettings({ personas }: { personas: Record<string, { systemPrompt?: string; capabilities?: string[] }> }) {
  const [selectedPersona, setSelectedPersona] = useState<string | null>(
    Object.keys(personas)[0] || null
  )

  const persona = selectedPersona ? personas[selectedPersona] : null

  return (
    <div className="flex gap-6">
      {/* Persona list */}
      <div className="w-48 space-y-2">
        {Object.keys(personas).map((name) => (
          <button
            key={name}
            onClick={() => setSelectedPersona(name)}
            className={clsx(
              'w-full text-left px-3 py-2 rounded-lg transition-colors capitalize',
              selectedPersona === name
                ? 'bg-rapid-accent text-white'
                : 'hover:bg-rapid-elevated'
            )}
          >
            {name}
          </button>
        ))}
        <button className="w-full text-left px-3 py-2 rounded-lg text-rapid-muted hover:bg-rapid-elevated">
          + Add Persona
        </button>
      </div>

      {/* Persona editor */}
      {persona && (
        <div className="flex-1 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">System Prompt</label>
            <textarea
              defaultValue={persona.systemPrompt}
              rows={6}
              className="input w-full resize-none font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Capabilities</label>
            <div className="flex flex-wrap gap-2">
              {persona.capabilities?.map((cap) => (
                <span key={cap} className="badge badge-info">
                  {cap}
                  <button className="ml-1.5 hover:text-white">×</button>
                </span>
              ))}
              <button className="badge badge-neutral cursor-pointer hover:bg-rapid-border">
                + Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function McpSettings({ servers }: { servers: Record<string, unknown> }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-rapid-muted">
        Configure MCP (Model Context Protocol) servers for extended capabilities.
      </p>

      <div className="space-y-3">
        {Object.entries(servers).map(([name, config]) => {
          const serverConfig = config as { command?: string; args?: string[] }
          return (
            <div key={name} className="p-4 bg-rapid-elevated rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-rapid-accent/20 flex items-center justify-center">
                    <span className="text-rapid-accent font-medium text-sm">
                      {name[0].toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="font-medium">{name}</div>
                    <div className="text-xs text-rapid-muted font-mono">
                      {serverConfig.command} {serverConfig.args?.join(' ')}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="status-dot status-dot-active" />
                  <span className="text-sm text-green-400">Connected</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <button className="btn btn-secondary">
        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
        Add MCP Server
      </button>
    </div>
  )
}

function RawConfig({ config }: { config: Record<string, unknown> | null }) {
  return (
    <div>
      <p className="text-sm text-rapid-muted mb-4">
        Raw rapid.json configuration (read-only view)
      </p>
      <pre className="p-4 bg-rapid-bg rounded-lg overflow-auto text-sm font-mono text-rapid-text max-h-[500px]">
        {JSON.stringify(config, null, 2)}
      </pre>
    </div>
  )
}
