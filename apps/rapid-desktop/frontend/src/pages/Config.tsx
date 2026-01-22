import { useState, useEffect } from 'react';
import { Loader2, Save, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '../components/Skeleton';
import { McpServerManager } from '../components/McpServerManager';
import { useConfig, useConfigValidation, type RapidConfig, type SecretsConfig } from '../hooks/useConfig';
import { cn } from '@/lib/utils';

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
  const { config, loading, error, saving, saveError, isDirty, saveConfig } = useConfig();
  const { validate } = useConfigValidation();
  const [activeTab, setActiveTab] = useState<string>('general');
  const [formData, setFormData] = useState<RapidConfig | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize form when config loads
  useEffect(() => {
    if (config && !formData) {
      setFormData(config);
    }
  }, [config, formData]);

  const handleSave = async () => {
    if (!formData) return;

    // Validate
    const validationErrors = validate(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    // Save
    const success = await saveConfig(formData);
    if (!success && saveError) {
      setErrors({ _form: saveError.message });
    }
  };

  const handleFieldChange = (path: string, value: unknown) => {
    if (!formData) return;

    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[path];
      return newErrors;
    });

    // Deep set value in formData
    const keys = path.split('.');
    const updated = JSON.parse(JSON.stringify(formData));
    let obj = updated;
    for (let i = 0; i < keys.length - 1; i++) {
      obj = obj[keys[i]] = obj[keys[i]] || {};
    }
    obj[keys[keys.length - 1]] = value;
    setFormData(updated);
  };

  if (loading) {
    return <ConfigSkeleton />;
  }

  if (error && !config) {
    return (
      <div className="space-y-6">
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">Failed to load configuration</p>
            <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!formData) {
    return null;
  }

  const mcpServers = formData?.mcp?.servers || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Configuration</h2>
          <p className="text-muted-foreground text-sm mt-1">Manage your rapid.json settings</p>
        </div>
        <Button onClick={handleSave} disabled={!isDirty || saving}>
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      {/* Error message */}
      {errors._form && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{errors._form}</p>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="secrets">Secrets</TabsTrigger>
          <TabsTrigger value="mcp">MCP</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="raw">Raw JSON</TabsTrigger>
        </TabsList>

        <Card className="mt-4">
          <CardContent className="pt-6">
            <TabsContent value="general" className="mt-0">
              <GeneralSettings config={formData} errors={errors} onChange={handleFieldChange} />
            </TabsContent>
            <TabsContent value="agents" className="mt-0">
              <AgentsSettings config={formData} errors={errors} onChange={handleFieldChange} />
            </TabsContent>
            <TabsContent value="secrets" className="mt-0">
              <SecretsSettings config={formData} errors={errors} onChange={handleFieldChange} />
            </TabsContent>
            <TabsContent value="mcp" className="mt-0">
              <McpServerManager servers={mcpServers} />
            </TabsContent>
            <TabsContent value="security" className="mt-0">
              <SecuritySettings config={formData} errors={errors} onChange={handleFieldChange} />
            </TabsContent>
            <TabsContent value="raw" className="mt-0">
              <RawConfig config={formData} onChange={handleFieldChange} />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
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
      <div className="flex gap-1 border-b border-border pb-2">
        <Skeleton height={32} width={80} />
        <Skeleton height={32} width={80} />
        <Skeleton height={32} width={60} />
        <Skeleton height={32} width={60} />
      </div>
      <Card>
        <CardContent className="pt-6">
          <Skeleton height={200} width="100%" />
        </CardContent>
      </Card>
    </div>
  );
}

interface GeneralSettingsProps {
  config: RapidConfig;
  errors: Record<string, string>;
  onChange: (path: string, value: unknown) => void;
}

function GeneralSettings({ config, errors, onChange }: GeneralSettingsProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-4">Project</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={config.name || ''}
              onChange={(e) => onChange('name', e.target.value)}
              className={cn(errors['name'] && 'border-destructive')}
            />
            {errors['name'] && (
              <p className="text-xs text-destructive">{errors['name']}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="version">Version</Label>
            <Input
              id="version"
              value={config.version || ''}
              onChange={(e) => onChange('version', e.target.value)}
              placeholder="1.0"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-6">
        <h3 className="font-semibold mb-4">Gateway</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Gateway</Label>
              <p className="text-sm text-muted-foreground">
                Use RAPID gateway for API routing
              </p>
            </div>
            <Switch
              checked={config.gateway?.enabled || false}
              onCheckedChange={(checked) => onChange('gateway.enabled', checked)}
            />
          </div>

          <div className="space-y-2">
            <Label>Mode</Label>
            <Select
              value={config.gateway?.mode || 'managed'}
              onValueChange={(value) => onChange('gateway.mode', value)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="managed">Managed</SelectItem>
                <SelectItem value="proxy">Proxy</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-6">
        <h3 className="font-semibold mb-4">Event Bus</h3>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Enable Event Bus</Label>
            <p className="text-sm text-muted-foreground">
              Inter-agent communication via Redis streams
            </p>
          </div>
          <Switch
            checked={config.eventBus?.enabled || false}
            onCheckedChange={(checked) => onChange('eventBus.enabled', checked)}
          />
        </div>
      </div>

      <div className="border-t border-border pt-6">
        <h3 className="font-semibold mb-4">Context Files</h3>
        <div className="space-y-2">
          <Label htmlFor="context-files">Files to include in agent context</Label>
          <Input
            id="context-files"
            value={(config.context?.files || []).join(', ')}
            onChange={(e) => onChange('context.files', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            placeholder="README.md, CLAUDE.md, AGENTS.md"
          />
          <p className="text-xs text-muted-foreground">Comma-separated list of files</p>
        </div>
      </div>
    </div>
  );
}

// Agents Settings Component
interface AgentsSettingsProps {
  config: RapidConfig;
  errors: Record<string, string>;
  onChange: (path: string, value: unknown) => void;
}

function AgentsSettings({ config, errors, onChange }: AgentsSettingsProps) {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(
    Object.keys(config.agents?.available || {})[0] || null
  );

  const agents = config.agents?.available || {};
  const agent = selectedAgent ? agents[selectedAgent] : null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Default Agent</Label>
        <Select
          value={config.agents?.default || 'claude'}
          onValueChange={(value) => onChange('agents.default', value)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(agents).map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Agent to use by default when spawning</p>
      </div>

      <div className="border-t border-border pt-6">
        <h3 className="font-semibold mb-4">Available Agents</h3>

        {Object.keys(agents).length === 0 ? (
          <p className="text-muted-foreground">No agents configured</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select Agent to Edit</Label>
              <Select value={selectedAgent || ''} onValueChange={setSelectedAgent}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(agents).map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {agent && selectedAgent && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{selectedAgent}</CardTitle>
                  <CardDescription>Configure the {selectedAgent} agent</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>CLI Command</Label>
                      <Input
                        value={agent.cli || ''}
                        onChange={(e) => onChange(`agents.available.${selectedAgent}.cli`, e.target.value)}
                        className={cn(errors[`agents.available.${selectedAgent}.cli`] && 'border-destructive')}
                      />
                      {errors[`agents.available.${selectedAgent}.cli`] && (
                        <p className="text-xs text-destructive">{errors[`agents.available.${selectedAgent}.cli`]}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Instruction File</Label>
                      <Input
                        value={agent.instructionFile || ''}
                        onChange={(e) => onChange(`agents.available.${selectedAgent}.instructionFile`, e.target.value)}
                        placeholder="CLAUDE.md"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>YOLO Mode</Label>
                      <p className="text-sm text-muted-foreground">
                        Skip confirmation prompts
                      </p>
                    </div>
                    <Switch
                      checked={agent.yolo || false}
                      onCheckedChange={(checked) => onChange(`agents.available.${selectedAgent}.yolo`, checked)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Arguments</Label>
                    <Input
                      value={(agent.args || []).join(' ')}
                      onChange={(e) => onChange(`agents.available.${selectedAgent}.args`, e.target.value.split(' ').filter(Boolean))}
                      placeholder="--model claude-3-5-sonnet"
                    />
                    <p className="text-xs text-muted-foreground">Space-separated CLI arguments</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Environment Variables</Label>
                    <Input
                      value={(agent.envVars || []).join(', ')}
                      onChange={(e) => onChange(`agents.available.${selectedAgent}.envVars`, e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                      placeholder="ANTHROPIC_API_KEY, OPENAI_API_KEY"
                    />
                    <p className="text-xs text-muted-foreground">Comma-separated list of env vars to pass</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Secrets Settings Component
interface SecretsSettingsProps {
  config: RapidConfig;
  errors: Record<string, string>;
  onChange: (path: string, value: unknown) => void;
}

function SecretsSettings({ config, onChange }: SecretsSettingsProps) {
  const secrets: SecretsConfig = config.secrets || { provider: '1password' };
  const items: Record<string, string> = secrets.items || {};

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Provider</Label>
          <Select
            value={secrets.provider || '1password'}
            onValueChange={(value) => onChange('secrets.provider', value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1password">1Password</SelectItem>
              <SelectItem value="vault">HashiCorp Vault</SelectItem>
              <SelectItem value="env">Environment Variables</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {secrets.provider === '1password' && (
          <div className="space-y-2">
            <Label>Vault Name</Label>
            <Input
              value={secrets.vault || ''}
              onChange={(e) => onChange('secrets.vault', e.target.value)}
              placeholder="MyVault"
            />
          </div>
        )}
      </div>

      <div className="border-t border-border pt-6">
        <h3 className="font-semibold mb-4">Secret Mappings</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Map environment variable names to their secret references
        </p>

        <div className="space-y-3">
          {Object.entries(items).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <Input
                value={key}
                className="w-48"
                readOnly
                placeholder="Variable name"
              />
              <span className="text-muted-foreground">=</span>
              <Input
                value={String(value)}
                className="flex-1"
                onChange={(e) => {
                  const newItems = { ...items, [key]: e.target.value };
                  onChange('secrets.items', newItems);
                }}
                placeholder="op://vault/item/field"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const newItems = { ...items };
                  delete newItems[key];
                  onChange('secrets.items', newItems);
                }}
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => {
            const newKey = `NEW_SECRET_${Object.keys(items).length + 1}`;
            onChange('secrets.items', { ...items, [newKey]: '' });
          }}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Secret
        </Button>
      </div>
    </div>
  );
}

// Security Settings Component
interface SecuritySettingsProps {
  config: RapidConfig;
  errors: Record<string, string>;
  onChange: (path: string, value: unknown) => void;
}

function SecuritySettings({ config, errors, onChange }: SecuritySettingsProps) {
  const security = config.security || {};

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Trust Level</Label>
          <Select
            value={security.trustLevel || 'development'}
            onValueChange={(value) => onChange('security.trustLevel', value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="development">Development</SelectItem>
              <SelectItem value="staging">Staging</SelectItem>
              <SelectItem value="production">Production</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Strict Mode</Label>
            <p className="text-sm text-muted-foreground">
              Enforce stricter security checks
            </p>
          </div>
          <Switch
            checked={security.strictMode || false}
            onCheckedChange={(checked) => onChange('security.strictMode', checked)}
          />
        </div>
      </div>

      <div className="border-t border-border pt-6">
        <h3 className="font-semibold mb-4">Budgets</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Per-Agent Budget ($)</Label>
            <Input
              type="number"
              value={security.perAgentBudget || 50}
              onChange={(e) => onChange('security.perAgentBudget', parseFloat(e.target.value) || 0)}
              className={cn(errors['security.perAgentBudget'] && 'border-destructive')}
            />
            {errors['security.perAgentBudget'] && (
              <p className="text-xs text-destructive">{errors['security.perAgentBudget']}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Per-Session Budget ($)</Label>
            <Input
              type="number"
              value={security.perSessionBudget || 500}
              onChange={(e) => onChange('security.perSessionBudget', parseFloat(e.target.value) || 0)}
              className={cn(errors['security.perSessionBudget'] && 'border-destructive')}
            />
            {errors['security.perSessionBudget'] && (
              <p className="text-xs text-destructive">{errors['security.perSessionBudget']}</p>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-6">
        <h3 className="font-semibold mb-4">Human Approval</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Require Human Approval</Label>
              <p className="text-sm text-muted-foreground">
                Some actions require human approval before executing
              </p>
            </div>
            <Switch
              checked={security.humanApproval?.enabled || false}
              onCheckedChange={(checked) => onChange('security.humanApproval.enabled', checked)}
            />
          </div>

          {security.humanApproval?.enabled && (
            <>
              <div className="space-y-2">
                <Label>Timeout (seconds)</Label>
                <Input
                  type="number"
                  value={security.humanApproval?.timeout || 300}
                  onChange={(e) => onChange('security.humanApproval.timeout', parseInt(e.target.value) || 300)}
                  className="w-32"
                />
              </div>

              <div className="space-y-2">
                <Label>Timeout Behavior</Label>
                <Select
                  value={security.humanApproval?.timeoutBehavior || 'deny'}
                  onValueChange={(value) => onChange('security.humanApproval.timeoutBehavior', value)}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deny">Deny (safer)</SelectItem>
                    <SelectItem value="allow">Allow</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="border-t border-border pt-6">
        <h3 className="font-semibold mb-4">Audit Logging</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Audit Logs</Label>
              <p className="text-sm text-muted-foreground">
                Log security-relevant events
              </p>
            </div>
            <Switch
              checked={security.audit?.enabled || false}
              onCheckedChange={(checked) => onChange('security.audit.enabled', checked)}
            />
          </div>

          {security.audit?.enabled && (
            <>
              <div className="space-y-2">
                <Label>Destination</Label>
                <Select
                  value={security.audit?.destination || 'both'}
                  onValueChange={(value) => onChange('security.audit.destination', value)}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="file">File only</SelectItem>
                    <SelectItem value="redis">Redis only</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Retention (days)</Label>
                <Input
                  type="number"
                  value={security.audit?.retentionDays || 30}
                  onChange={(e) => onChange('security.audit.retentionDays', parseInt(e.target.value) || 30)}
                  className="w-32"
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface RawConfigProps {
  config: RapidConfig;
  onChange: (path: string, value: unknown) => void;
}

function RawConfig({ config, onChange }: RawConfigProps) {
  const [rawText, setRawText] = useState(JSON.stringify(config, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);

  // Update raw text when config changes externally
  useEffect(() => {
    setRawText(JSON.stringify(config, null, 2));
  }, [config]);

  const handleRawChange = (text: string) => {
    setRawText(text);
    try {
      const parsed = JSON.parse(text);
      setParseError(null);
      // Update the entire config object
      Object.keys(parsed).forEach((key) => {
        onChange(key, parsed[key]);
      });
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Edit rapid.json directly. Changes are validated in real-time.
        </p>
        {parseError && (
          <span className="text-xs text-destructive">{parseError}</span>
        )}
      </div>
      <Textarea
        value={rawText}
        onChange={(e) => handleRawChange(e.target.value)}
        className={cn(
          'font-mono text-sm min-h-[500px] resize-y',
          parseError && 'border-destructive'
        )}
        spellCheck={false}
      />
    </div>
  );
}
