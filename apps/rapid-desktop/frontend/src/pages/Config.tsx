import { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
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
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '../components/Skeleton';
import { McpServerManager } from '../components/McpServerManager';
import { useConfig, useConfigValidation, type RapidConfig } from '../hooks/useConfig';
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

  const personas = formData?.personas || {};
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
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="personas">Personas</TabsTrigger>
          <TabsTrigger value="mcp">MCP</TabsTrigger>
          <TabsTrigger value="raw">Raw</TabsTrigger>
        </TabsList>

        <Card className="mt-4">
          <CardContent className="pt-6">
            <TabsContent value="general" className="mt-0">
              <GeneralSettings config={formData} errors={errors} onChange={handleFieldChange} />
            </TabsContent>
            <TabsContent value="personas" className="mt-0">
              <PersonaSettings personas={personas} errors={errors} onChange={handleFieldChange} />
            </TabsContent>
            <TabsContent value="mcp" className="mt-0">
              <McpServerManager servers={mcpServers} />
            </TabsContent>
            <TabsContent value="raw" className="mt-0">
              <RawConfig config={formData} />
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
              value={config.project?.name || ''}
              onChange={(e) => onChange('project.name', e.target.value)}
              className={cn(errors['project.name'] && 'border-destructive')}
            />
            {errors['project.name'] && (
              <p className="text-xs text-destructive">{errors['project.name']}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-root">Root Directory</Label>
            <Input
              id="project-root"
              value={config.project?.root || ''}
              onChange={(e) => onChange('project.root', e.target.value)}
              className={cn(errors['project.root'] && 'border-destructive')}
            />
            {errors['project.root'] && (
              <p className="text-xs text-destructive">{errors['project.root']}</p>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-6">
        <h3 className="font-semibold mb-4">Sandbox</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable sandboxing</Label>
              <p className="text-sm text-muted-foreground">
                Run agents in isolated sandbox environments
              </p>
            </div>
            <Switch
              checked={config.sandbox?.enabled || false}
              onCheckedChange={(checked) => onChange('sandbox.enabled', checked)}
            />
          </div>

          <div className="space-y-2">
            <Label>Preset</Label>
            <Select
              value={config.sandbox?.preset || 'balanced'}
              onValueChange={(value) => onChange('sandbox.preset', value)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="strict">Strict</SelectItem>
                <SelectItem value="balanced">Balanced</SelectItem>
                <SelectItem value="permissive">Permissive</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Allow network access</Label>
              <p className="text-sm text-muted-foreground">
                Allow agents to make network requests
              </p>
            </div>
            <Switch
              checked={config.sandbox?.allowNetwork || false}
              onCheckedChange={(checked) => onChange('sandbox.allowNetwork', checked)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface PersonaSettingsProps {
  personas: Record<string, { systemPrompt?: string; capabilities?: string[] }>;
  errors: Record<string, string>;
  onChange: (path: string, value: unknown) => void;
}

function PersonaSettings({ personas, errors, onChange }: PersonaSettingsProps) {
  const [selectedPersona, setSelectedPersona] = useState<string | null>(
    Object.keys(personas)[0] || null
  );

  const persona = selectedPersona ? personas[selectedPersona] : null;

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">
        Configure AI persona definitions and capabilities
      </p>
      {!Object.keys(personas).length ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>No personas configured</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Select Persona</Label>
            <Select value={selectedPersona || ''} onValueChange={setSelectedPersona}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(personas).map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {persona && (
            <Card className="mt-6">
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="system-prompt">System Prompt</Label>
                  <Textarea
                    id="system-prompt"
                    value={persona.systemPrompt || ''}
                    onChange={(e) =>
                      onChange(`personas.${selectedPersona}.systemPrompt`, e.target.value)
                    }
                    className={cn(
                      'h-24',
                      errors[`personas.${selectedPersona}.systemPrompt`] && 'border-destructive'
                    )}
                  />
                  {errors[`personas.${selectedPersona}.systemPrompt`] && (
                    <p className="text-xs text-destructive">
                      {errors[`personas.${selectedPersona}.systemPrompt`]}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="capabilities">Capabilities</Label>
                  <Input
                    id="capabilities"
                    value={(persona.capabilities || []).join(', ')}
                    onChange={(e) =>
                      onChange(
                        `personas.${selectedPersona}.capabilities`,
                        e.target.value.split(',').map((s) => s.trim())
                      )
                    }
                    placeholder="e.g., coding, testing, debugging"
                    className={cn(
                      errors[`personas.${selectedPersona}.capabilities`] && 'border-destructive'
                    )}
                  />
                  <p className="text-xs text-muted-foreground">Comma-separated list</p>
                  {errors[`personas.${selectedPersona}.capabilities`] && (
                    <p className="text-xs text-destructive">
                      {errors[`personas.${selectedPersona}.capabilities`]}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function RawConfig({ config }: { config: RapidConfig }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">Raw rapid.json configuration</p>
      <pre className="p-4 bg-background rounded-lg overflow-auto text-sm font-mono text-foreground max-h-[500px] border">
        {JSON.stringify(config, null, 2)}
      </pre>
    </div>
  );
}
