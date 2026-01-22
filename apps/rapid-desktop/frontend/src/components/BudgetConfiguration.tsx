/**
 * Budget Configuration Component
 *
 * Provides UI for configuring budget limits and alert thresholds:
 * - Daily budget limit
 * - Per-agent budget limits
 * - Alert thresholds (70%, 90%, 100%)
 * - Budget progress bar visualization
 *
 * Can be used standalone or integrated into the Config page.
 */

import { useState, useCallback, useEffect } from 'react';
import { clsx } from 'clsx';
import { useMcp } from '../hooks/useMcp';

// Default budget configuration
const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  dailyLimit: 50,
  warningThreshold: 70,
  highThreshold: 90,
  criticalThreshold: 100,
  perAgentLimits: {},
  enabled: true,
};

export interface BudgetConfig {
  /** Daily budget limit in dollars */
  dailyLimit: number;
  /** Warning alert threshold percentage */
  warningThreshold: number;
  /** High alert threshold percentage */
  highThreshold: number;
  /** Critical alert threshold percentage */
  criticalThreshold: number;
  /** Per-agent budget limits */
  perAgentLimits: Record<string, number>;
  /** Whether budget tracking is enabled */
  enabled: boolean;
}

interface BudgetConfigurationProps {
  /** Initial config to load */
  initialConfig?: Partial<BudgetConfig>;
  /** Callback when config is saved */
  onSave?: (config: BudgetConfig) => Promise<void>;
  /** Current cost for progress visualization */
  currentCost?: number;
  /** Whether save is in progress */
  saving?: boolean;
  /** Additional CSS class */
  className?: string;
}

/**
 * Budget Configuration Form Component
 */
export function BudgetConfiguration({
  initialConfig,
  onSave,
  currentCost = 0,
  saving = false,
  className,
}: BudgetConfigurationProps) {
  const [config, setConfig] = useState<BudgetConfig>({
    ...DEFAULT_BUDGET_CONFIG,
    ...initialConfig,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Update when initial config changes
  useEffect(() => {
    if (initialConfig) {
      setConfig((prev) => ({ ...prev, ...initialConfig }));
    }
  }, [initialConfig]);

  // Validate thresholds
  const validateThresholds = useCallback((values: BudgetConfig): Record<string, string> => {
    const errors: Record<string, string> = {};

    if (values.dailyLimit <= 0) {
      errors.dailyLimit = 'Daily limit must be greater than 0';
    }

    if (values.warningThreshold <= 0 || values.warningThreshold > 100) {
      errors.warningThreshold = 'Warning threshold must be between 1 and 100';
    }

    if (values.highThreshold <= values.warningThreshold) {
      errors.highThreshold = 'High threshold must be greater than warning threshold';
    }

    if (values.criticalThreshold <= values.highThreshold) {
      errors.criticalThreshold = 'Critical threshold must be greater than high threshold';
    }

    // Validate per-agent limits
    for (const [agentId, limit] of Object.entries(values.perAgentLimits)) {
      if (limit <= 0) {
        errors[`perAgentLimits.${agentId}`] = 'Agent limit must be greater than 0';
      }
    }

    return errors;
  }, []);

  // Handle field change
  const handleChange = useCallback(
    (field: keyof BudgetConfig, value: unknown) => {
      setConfig((prev) => ({ ...prev, [field]: value }));
      setIsDirty(true);
      // Clear error for this field
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    },
    []
  );

  // Handle per-agent limit change
  const handleAgentLimitChange = useCallback((agentId: string, value: number) => {
    setConfig((prev) => ({
      ...prev,
      perAgentLimits: {
        ...prev.perAgentLimits,
        [agentId]: value,
      },
    }));
    setIsDirty(true);
  }, []);

  // Remove per-agent limit
  const removeAgentLimit = useCallback((agentId: string) => {
    setConfig((prev) => {
      const newLimits = { ...prev.perAgentLimits };
      delete newLimits[agentId];
      return { ...prev, perAgentLimits: newLimits };
    });
    setIsDirty(true);
  }, []);

  // Handle save with validation
  const handleSave = useCallback(async () => {
    const validationErrors = validateThresholds(config);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setShowConfirmDialog(true);
  }, [config, validateThresholds]);

  // Confirm and save
  const confirmSave = useCallback(async () => {
    setShowConfirmDialog(false);
    if (onSave) {
      await onSave(config);
      setIsDirty(false);
    }
  }, [config, onSave]);

  // Calculate progress percentage
  const progressPercent = config.dailyLimit > 0 ? (currentCost / config.dailyLimit) * 100 : 0;
  const progressColor =
    progressPercent >= config.criticalThreshold
      ? 'bg-red-500'
      : progressPercent >= config.highThreshold
        ? 'bg-yellow-500'
        : progressPercent >= config.warningThreshold
          ? 'bg-yellow-400'
          : 'bg-green-500';

  return (
    <div className={clsx('space-y-6', className)}>
      {/* Budget Progress Bar */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-medium">Daily Budget Progress</h4>
          <span className="text-sm text-rapid-muted">
            ${currentCost.toFixed(2)} / ${config.dailyLimit.toFixed(2)}
          </span>
        </div>
        <div className="h-3 bg-rapid-elevated rounded-full overflow-hidden">
          <div
            className={clsx('h-full transition-all duration-500', progressColor)}
            style={{ width: `${Math.min(progressPercent, 100)}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-rapid-muted">
          <span>{progressPercent.toFixed(1)}% used</span>
          <span>${(config.dailyLimit - currentCost).toFixed(2)} remaining</span>
        </div>

        {/* Threshold markers */}
        <div className="relative h-2 mt-2">
          <div
            className="absolute w-0.5 h-full bg-yellow-400/50"
            style={{ left: `${config.warningThreshold}%` }}
            title={`Warning: ${config.warningThreshold}%`}
          />
          <div
            className="absolute w-0.5 h-full bg-yellow-500/50"
            style={{ left: `${config.highThreshold}%` }}
            title={`High: ${config.highThreshold}%`}
          />
          <div
            className="absolute w-0.5 h-full bg-red-500/50"
            style={{ left: `${Math.min(config.criticalThreshold, 100)}%` }}
            title={`Critical: ${config.criticalThreshold}%`}
          />
        </div>
      </div>

      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between p-4 bg-rapid-elevated rounded-lg">
        <div>
          <h4 className="font-medium">Budget Tracking</h4>
          <p className="text-sm text-rapid-muted">Enable or disable budget monitoring</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => handleChange('enabled', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-rapid-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rapid-accent"></div>
        </label>
      </div>

      {/* Daily Limit */}
      <div>
        <label className="block text-sm font-medium mb-2">Daily Budget Limit ($)</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-rapid-muted">$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={config.dailyLimit}
            onChange={(e) => handleChange('dailyLimit', parseFloat(e.target.value) || 0)}
            className={clsx(
              'input w-full pl-7',
              errors.dailyLimit && 'border-red-500'
            )}
          />
        </div>
        {errors.dailyLimit && (
          <p className="text-xs text-red-400 mt-1">{errors.dailyLimit}</p>
        )}
      </div>

      {/* Alert Thresholds */}
      <div className="border-t border-rapid-border pt-6">
        <h4 className="font-medium mb-4">Alert Thresholds</h4>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Warning (%)</label>
            <input
              type="number"
              min="1"
              max="100"
              value={config.warningThreshold}
              onChange={(e) => handleChange('warningThreshold', parseInt(e.target.value) || 0)}
              className={clsx(
                'input w-full',
                errors.warningThreshold && 'border-red-500'
              )}
            />
            {errors.warningThreshold && (
              <p className="text-xs text-red-400 mt-1">{errors.warningThreshold}</p>
            )}
            <p className="text-xs text-yellow-400 mt-1">Info alert</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">High (%)</label>
            <input
              type="number"
              min="1"
              max="100"
              value={config.highThreshold}
              onChange={(e) => handleChange('highThreshold', parseInt(e.target.value) || 0)}
              className={clsx(
                'input w-full',
                errors.highThreshold && 'border-red-500'
              )}
            />
            {errors.highThreshold && (
              <p className="text-xs text-red-400 mt-1">{errors.highThreshold}</p>
            )}
            <p className="text-xs text-yellow-500 mt-1">Warning alert</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Critical (%)</label>
            <input
              type="number"
              min="1"
              max="150"
              value={config.criticalThreshold}
              onChange={(e) => handleChange('criticalThreshold', parseInt(e.target.value) || 0)}
              className={clsx(
                'input w-full',
                errors.criticalThreshold && 'border-red-500'
              )}
            />
            {errors.criticalThreshold && (
              <p className="text-xs text-red-400 mt-1">{errors.criticalThreshold}</p>
            )}
            <p className="text-xs text-red-400 mt-1">Critical alert</p>
          </div>
        </div>
      </div>

      {/* Per-Agent Limits */}
      <div className="border-t border-rapid-border pt-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-medium">Per-Agent Limits</h4>
          <button
            onClick={() => handleAgentLimitChange(`agent-${Date.now()}`, 10)}
            className="text-sm text-rapid-accent hover:text-rapid-accent/80 transition-colors"
          >
            + Add Limit
          </button>
        </div>

        {Object.keys(config.perAgentLimits).length === 0 ? (
          <p className="text-sm text-rapid-muted text-center py-4">
            No per-agent limits configured. Add one to set individual agent budgets.
          </p>
        ) : (
          <div className="space-y-3">
            {Object.entries(config.perAgentLimits).map(([agentId, limit]) => (
              <div key={agentId} className="flex items-center gap-3 p-3 bg-rapid-elevated rounded-lg">
                <input
                  type="text"
                  value={agentId}
                  placeholder="Agent ID or name"
                  onChange={(e) => {
                    const newLimits = { ...config.perAgentLimits };
                    delete newLimits[agentId];
                    newLimits[e.target.value] = limit;
                    setConfig((prev) => ({ ...prev, perAgentLimits: newLimits }));
                    setIsDirty(true);
                  }}
                  className="input flex-1"
                />
                <div className="relative w-32">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-rapid-muted">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={limit}
                    onChange={(e) => handleAgentLimitChange(agentId, parseFloat(e.target.value) || 0)}
                    className={clsx(
                      'input w-full pl-7',
                      errors[`perAgentLimits.${agentId}`] && 'border-red-500'
                    )}
                  />
                </div>
                <button
                  onClick={() => removeAgentLimit(agentId)}
                  className="p-2 text-rapid-muted hover:text-red-400 transition-colors"
                  title="Remove limit"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save Button */}
      {onSave && (
        <div className="flex justify-end pt-4 border-t border-rapid-border">
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className={clsx(
              'btn btn-primary flex items-center gap-2',
              (!isDirty || saving) && 'opacity-50 cursor-not-allowed'
            )}
          >
            {saving ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Saving...
              </>
            ) : (
              'Save Budget Settings'
            )}
          </button>
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card p-6 max-w-md mx-4">
            <h3 className="font-semibold text-lg mb-2">Confirm Budget Changes</h3>
            <p className="text-rapid-muted mb-4">
              Are you sure you want to save these budget settings? This will affect budget alerts and monitoring.
            </p>
            <div className="bg-rapid-elevated rounded-lg p-3 mb-4 text-sm">
              <p>Daily limit: <strong>${config.dailyLimit.toFixed(2)}</strong></p>
              <p>Alerts at: <strong>{config.warningThreshold}%</strong> / <strong>{config.highThreshold}%</strong> / <strong>{config.criticalThreshold}%</strong></p>
              {Object.keys(config.perAgentLimits).length > 0 && (
                <p>Per-agent limits: <strong>{Object.keys(config.perAgentLimits).length}</strong> configured</p>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirmDialog(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={confirmSave}
                className="btn btn-primary"
              >
                Confirm & Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact Budget Progress Bar for Dashboard
 */
export interface BudgetProgressBarProps {
  /** Current cost */
  currentCost: number;
  /** Daily limit */
  dailyLimit: number;
  /** Warning threshold percentage */
  warningThreshold?: number;
  /** High threshold percentage */
  highThreshold?: number;
  /** Critical threshold percentage */
  criticalThreshold?: number;
  /** Show labels */
  showLabels?: boolean;
  /** Additional CSS class */
  className?: string;
}

export function BudgetProgressBar({
  currentCost,
  dailyLimit,
  warningThreshold = 70,
  highThreshold = 90,
  criticalThreshold = 100,
  showLabels = true,
  className,
}: BudgetProgressBarProps) {
  const progressPercent = dailyLimit > 0 ? (currentCost / dailyLimit) * 100 : 0;
  const progressColor =
    progressPercent >= criticalThreshold
      ? 'bg-red-500'
      : progressPercent >= highThreshold
        ? 'bg-yellow-500'
        : progressPercent >= warningThreshold
          ? 'bg-yellow-400'
          : 'bg-green-500';

  return (
    <div className={className}>
      {showLabels && (
        <div className="flex items-center justify-between mb-1 text-xs">
          <span className="text-rapid-muted">Budget</span>
          <span className={clsx(
            'font-mono',
            progressPercent >= criticalThreshold ? 'text-red-400' :
            progressPercent >= highThreshold ? 'text-yellow-400' :
            'text-rapid-text'
          )}>
            ${currentCost.toFixed(2)} / ${dailyLimit.toFixed(2)}
          </span>
        </div>
      )}
      <div className="h-2 bg-rapid-elevated rounded-full overflow-hidden">
        <div
          className={clsx('h-full transition-all duration-500', progressColor)}
          style={{ width: `${Math.min(progressPercent, 100)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Hook to manage budget configuration
 */
export function useBudgetConfig() {
  const [config, setConfig] = useState<BudgetConfig>(DEFAULT_BUDGET_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [currentCost, setCurrentCost] = useState(0);
  const { callTool } = useMcp();

  // Load config from storage/MCP
  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      // Try to fetch from MCP or local storage
      // For now, use local storage as fallback
      const stored = localStorage.getItem('rapid-budget-config');
      if (stored) {
        setConfig(JSON.parse(stored));
      }

      // Fetch current cost
      const costResult = await callTool('get_cost_summary', { hours: 24 });
      const costData = costResult.structuredContent as { totalCost?: number } | null;
      setCurrentCost(costData?.totalCost || 0);
    } catch (err) {
      console.error('Failed to load budget config:', err);
    } finally {
      setIsLoading(false);
    }
  }, [callTool]);

  // Save config
  const saveConfig = useCallback(async (newConfig: BudgetConfig) => {
    try {
      // Save to local storage
      localStorage.setItem('rapid-budget-config', JSON.stringify(newConfig));
      setConfig(newConfig);

      // TODO: Save to .rapid/config via MCP or backend
      // await callTool('config_set', { path: 'budget', value: newConfig });
    } catch (err) {
      console.error('Failed to save budget config:', err);
      throw err;
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  return {
    config,
    currentCost,
    isLoading,
    saveConfig,
    refresh: loadConfig,
  };
}

export default BudgetConfiguration;
