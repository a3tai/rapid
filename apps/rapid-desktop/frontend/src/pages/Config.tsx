import { useState, useEffect } from 'react'
import { clsx } from 'clsx'
import { Skeleton } from '../components/Skeleton'
import { useConfig, useConfigValidation, type RapidConfig } from '../hooks/useConfig'

/**
 * Configuration management page
 *
 * Features:
 * - Loads config from Go backend (GetConfig)
 * - Real-time form validation
 * - Saves config to backend (SaveConfig)
 * - Multiple config tabs (general, personas, mcp, raw)
 * - Error handling and user feedback
 */
export function ConfigPage() {
  const { config, loading, error, saving, saveError, isDirty, saveConfig } = useConfig()
  const { validate } = useConfigValidation()
  const [activeTab, setActiveTab] = useState<'general' | 'personas' | 'mcp' | 'raw'>('general')
  const [formData, setFormData] = useState<RapidConfig | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Initialize form when config loads
  useEffect(() => {
    if (config && !formData) {
      setFormData(config)
    }
  }, [config, formData])

  const handleSave = async () => {
    if (!formData) return

    // Validate
    const validationErrors = validate(formData)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    // Save
    const success = await saveConfig(formData)
    if (!success && saveError) {
      setErrors({ _form: saveError.message })
    }
  }

  const handleFieldChange = (path: string, value: unknown) => {
    if (!formData) return

    setErrors((prev) => {
      const newErrors = { ...prev }
      delete newErrors[path]
      return newErrors
    })

    // Deep set value in formData
    const keys = path.split('.')
    const updated = JSON.parse(JSON.stringify(formData))
    let obj = updated
    for (let i = 0; i < keys.length - 1; i++) {
      obj = obj[keys[i]] = obj[keys[i]] || {}
    }
    obj[keys[keys.length - 1]] = value
    setFormData(updated)
  }

  if (loading) {
    return <ConfigSkeleton />
  }

  if (error && !config) {
    return (
      <div className="space-y-6">
        <div className="p-4 bg-red-500/10 border border-red-700 rounded-lg">
          <p className="text-red-300">Failed to load configuration</p>
          <p className="text-sm text-red-400 mt-1">{error.message}</p>
        </div>
      </div>
    )
  }

  if (!formData) {
    return null
  }

  const personas = formData?.personas || {}
  const mcpServers = formData?.mcp?.servers || {}

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
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          className={clsx(
            'btn btn-primary flex items-center gap-2 disabled:opacity-50',
            saving && 'animate-pulse'
          )}
        >
          {saving ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Saving...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              Save Changes
            </>
          )}
        </button>
      </div>

      {/* Error message */}
      {errors._form && (
        <div className="p-4 bg-red-500/10 border border-red-700 rounded-lg">
          <p className="text-red-300">{errors._form}</p>
        </div>
      )}

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
          <GeneralSettings
            config={formData}
            errors={errors}
            onChange={handleFieldChange}
          />
        )}
        {activeTab === 'personas' && (
          <PersonaSettings
            personas={personas}
            errors={errors}
            onChange={handleFieldChange}
          />
        )}
        {activeTab === 'mcp' && (
          <McpSettings
            servers={mcpServers}
          />
        )}
        {activeTab === 'raw' && (
          <RawConfig config={formData} />
        )}
      </div>
    </div>
  )
}

function ConfigSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton height={24} width={180} className="mb-2" />
          <Skeleton height={14} width={220} />
        </div>
        <Skeleton height={40} width={140} />
      </div>
      <div className="flex gap-1 border-b border-rapid-border pb-2">
        <Skeleton height={32} width={80} />
        <Skeleton height={32} width={80} />
        <Skeleton height={32} width={60} />
        <Skeleton height={32} width={60} />
      </div>
      <div className="card p-6 space-y-6">
        <Skeleton height={200} width="100%" />
      </div>
    </div>
  )
}

interface GeneralSettingsProps {
  config: RapidConfig
  errors: Record<string, string>
  onChange: (path: string, value: unknown) => void
}

function GeneralSettings({ config, errors, onChange }: GeneralSettingsProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-4">Project</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Name</label>
            <input
              type="text"
              value={config.project?.name || ''}
              onChange={(e) => onChange('project.name', e.target.value)}
              className={clsx(
                'input w-full',
                errors['project.name'] && 'border-red-500'
              )}
            />
            {errors['project.name'] && (
              <p className="text-xs text-red-400 mt-1">{errors['project.name']}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Root Directory</label>
            <input
              type="text"
              value={config.project?.root || ''}
              onChange={(e) => onChange('project.root', e.target.value)}
              className={clsx(
                'input w-full',
                errors['project.root'] && 'border-red-500'
              )}
            />
            {errors['project.root'] && (
              <p className="text-xs text-red-400 mt-1">{errors['project.root']}</p>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-rapid-border pt-6">
        <h3 className="font-semibold mb-4">Sandbox</h3>
        <div className="space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={config.sandbox?.enabled || false}
              onChange={(e) => onChange('sandbox.enabled', e.target.checked)}
              className="rounded border-rapid-border bg-rapid-elevated"
            />
            <span className="text-sm">Enable sandboxing</span>
          </label>

          <div>
            <label className="block text-sm font-medium mb-2">Preset</label>
            <select
              value={config.sandbox?.preset || 'balanced'}
              onChange={(e) => onChange('sandbox.preset', e.target.value)}
              className="input w-full max-w-xs"
            >
              <option value="strict">Strict</option>
              <option value="balanced">Balanced</option>
              <option value="permissive">Permissive</option>
              <option value="none">None</option>
            </select>
          </div>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={config.sandbox?.allowNetwork || false}
              onChange={(e) => onChange('sandbox.allowNetwork', e.target.checked)}
              className="rounded border-rapid-border bg-rapid-elevated"
            />
            <span className="text-sm">Allow network access</span>
          </label>
        </div>
      </div>
    </div>
  )
}

interface PersonaSettingsProps {
  personas: Record<string, { systemPrompt?: string; capabilities?: string[] }>
  errors: Record<string, string>
  onChange: (path: string, value: unknown) => void
}

function PersonaSettings({ personas, errors, onChange }: PersonaSettingsProps) {
  const [selectedPersona, setSelectedPersona] = useState<string | null>(
    Object.keys(personas)[0] || null
  )

  const persona = selectedPersona ? personas[selectedPersona] : null

  return (
    <div>
      <p className="text-sm text-rapid-muted mb-4">
        Configure AI persona definitions and capabilities
      </p>
      {!Object.keys(personas).length ? (
        <div className="text-center py-8 text-rapid-muted">
          <p>No personas configured</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Select Persona</label>
            <select
              value={selectedPersona || ''}
              onChange={(e) => setSelectedPersona(e.target.value)}
              className="input w-full max-w-xs"
            >
              {Object.keys(personas).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {persona && (
            <div className="space-y-4 mt-6 p-4 bg-rapid-elevated rounded-lg">
              <div>
                <label className="block text-sm font-medium mb-2">System Prompt</label>
                <textarea
                  value={persona.systemPrompt || ''}
                  onChange={(e) =>
                    onChange(`personas.${selectedPersona}.systemPrompt`, e.target.value)
                  }
                  className={clsx(
                    'input w-full h-24',
                    errors[`personas.${selectedPersona}.systemPrompt`] && 'border-red-500'
                  )}
                />
                {errors[`personas.${selectedPersona}.systemPrompt`] && (
                  <p className="text-xs text-red-400 mt-1">
                    {errors[`personas.${selectedPersona}.systemPrompt`]}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Capabilities</label>
                <input
                  type="text"
                  value={(persona.capabilities || []).join(', ')}
                  onChange={(e) =>
                    onChange(
                      `personas.${selectedPersona}.capabilities`,
                      e.target.value.split(',').map((s) => s.trim())
                    )
                  }
                  placeholder="e.g., coding, testing, debugging"
                  className={clsx(
                    'input w-full',
                    errors[`personas.${selectedPersona}.capabilities`] && 'border-red-500'
                  )}
                />
                <p className="text-xs text-rapid-muted mt-1">Comma-separated list</p>
                {errors[`personas.${selectedPersona}.capabilities`] && (
                  <p className="text-xs text-red-400 mt-1">
                    {errors[`personas.${selectedPersona}.capabilities`]}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface McpSettingsProps {
  servers: Record<string, { command?: string; args?: string[] }>
}

function McpSettings({ servers }: McpSettingsProps) {
  const [mcpStatus, setMcpStatus] = useState<{
    connected: boolean
    toolCount: number
    checking: boolean
    lastChecked: Date | null
  }>({
    connected: false,
    toolCount: 0,
    checking: false,
    lastChecked: null,
  })

  const checkMcpConnection = async () => {
    setMcpStatus(prev => ({ ...prev, checking: true }))
    try {
      const endpoint = import.meta.env.VITE_MCP_URL || 'http://localhost:3100/mcp'
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setMcpStatus({
          connected: true,
          toolCount: data.result?.tools?.length || 0,
          checking: false,
          lastChecked: new Date(),
        })
      } else {
        setMcpStatus({
          connected: false,
          toolCount: 0,
          checking: false,
          lastChecked: new Date(),
        })
      }
    } catch {
      setMcpStatus({
        connected: false,
        toolCount: 0,
        checking: false,
        lastChecked: new Date(),
      })
    }
  }

  // Check on mount
  useEffect(() => {
    checkMcpConnection()
  }, [])

  return (
    <div>
      {/* MCP Server Status */}
      <div className="mb-6 p-4 bg-rapid-bg rounded-lg border border-rapid-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={clsx(
              'w-3 h-3 rounded-full',
              mcpStatus.checking && 'bg-yellow-400 animate-pulse',
              !mcpStatus.checking && mcpStatus.connected && 'bg-green-400',
              !mcpStatus.checking && !mcpStatus.connected && 'bg-red-400'
            )} />
            <span className="font-medium">RAPID MCP Server</span>
          </div>
          <button
            onClick={checkMcpConnection}
            disabled={mcpStatus.checking}
            className="btn btn-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            <svg
              className={clsx('w-4 h-4', mcpStatus.checking && 'animate-spin')}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {mcpStatus.checking ? 'Checking...' : 'Check'}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-rapid-muted">Status: </span>
            <span className={mcpStatus.connected ? 'text-green-400' : 'text-red-400'}>
              {mcpStatus.checking ? 'Checking...' : mcpStatus.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div>
            <span className="text-rapid-muted">Tools: </span>
            <span>{mcpStatus.toolCount}</span>
          </div>
          <div>
            <span className="text-rapid-muted">Last Check: </span>
            <span>{mcpStatus.lastChecked ? mcpStatus.lastChecked.toLocaleTimeString() : 'Never'}</span>
          </div>
        </div>
      </div>

      <p className="text-sm text-rapid-muted mb-4">
        Configured MCP servers from rapid.json
      </p>

      {!Object.keys(servers).length ? (
        <div className="text-center py-8 text-rapid-muted">
          <p>No MCP servers configured in rapid.json</p>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(servers).map(([name, config]) => (
            <div
              key={name}
              className="flex items-center justify-between p-4 bg-rapid-elevated rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-rapid-accent/20 flex items-center justify-center">
                  <span className="text-rapid-accent font-medium text-sm">
                    {name[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="font-medium">{name}</div>
                  <div className="text-xs text-rapid-muted font-mono">
                    {config.command} {config.args?.join(' ')}
                  </div>
                </div>
              </div>
              <span className="badge badge-neutral text-xs">Configured</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RawConfig({ config }: { config: RapidConfig }) {
  return (
    <div>
      <p className="text-sm text-rapid-muted mb-4">
        Raw rapid.json configuration
      </p>
      <pre className="p-4 bg-rapid-bg rounded-lg overflow-auto text-sm font-mono text-rapid-text max-h-[500px]">
        {JSON.stringify(config, null, 2)}
      </pre>
    </div>
  )
}
