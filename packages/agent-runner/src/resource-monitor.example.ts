/**
 * Example: Using ResourceMonitor for Agent Resource Tracking
 *
 * This file demonstrates how to use the ResourceMonitor class
 * to track and enforce resource limits during agent execution.
 */

import { ResourceMonitor } from './resource-monitor.js';

// Example 1: Basic Usage
console.log('=== Example 1: Basic Usage ===');
const monitor = new ResourceMonitor({
  maxMemoryMb: 512,
  maxCostUsd: 10,
  maxErrors: 5,
  maxTokensPerIteration: 100000,
});

// Simulate an API call with token usage
monitor.trackTokens(
  {
    inputTokens: 1000,
    outputTokens: 500,
  },
  'sonnet'
);

// Check current metrics
let metrics = monitor.getMetrics();
console.log('Current metrics:', {
  inputTokens: metrics.totalInputTokens,
  outputTokens: metrics.totalOutputTokens,
  estimatedCost: monitor.formatCost(metrics.estimatedCostUsd),
  errors: metrics.errorCount,
});

// Example 2: Monitoring for Limit Violations
console.log('\n=== Example 2: Limit Monitoring ===');
const expensiveMonitor = new ResourceMonitor({
  maxCostUsd: 5, // Very low limit for demo
  maxErrors: 3,
});

// Simulate expensive API calls
for (let i = 0; i < 3; i++) {
  expensiveMonitor.trackTokens(
    {
      inputTokens: 1_000_000,
      outputTokens: 500_000,
    },
    'opus' // Expensive model
  );
}

// Check limit status
let status = expensiveMonitor.checkLimits();
console.log('Limit status:', {
  withinLimits: status.withinLimits,
  violations: status.violations.map((v) => ({
    type: v.type,
    current: v.current,
    limit: v.limit,
  })),
});

// Example 3: Error Tracking
console.log('\n=== Example 3: Error Tracking ===');
const errorMonitor = new ResourceMonitor({
  maxErrors: 3,
});

// Simulate API calls with errors
for (let i = 0; i < 2; i++) {
  errorMonitor.trackApiCall(true);
}
for (let i = 0; i < 1; i++) {
  errorMonitor.trackApiCall(false);
}
errorMonitor.trackError();

metrics = errorMonitor.getMetrics();
console.log('Error metrics:', {
  total_api_calls: metrics.apiCallCount,
  successful: metrics.successfulApiCalls,
  failed: metrics.failedApiCalls,
  error_rate: metrics.errorRate + '%',
  errors_counted: metrics.errorCount,
});

status = errorMonitor.checkLimits();
console.log('Approaching error limit?', status.warnings.length > 0);

// Example 4: Cost Tracking by Model
console.log('\n=== Example 4: Cost Breakdown by Model ===');
const multiModelMonitor = new ResourceMonitor();

// Mix of different models
const usage = [
  { model: 'haiku', input: 10000, output: 5000, count: 3 },
  { model: 'sonnet', input: 50000, output: 20000, count: 5 },
  { model: 'opus', input: 100000, output: 50000, count: 1 },
];

for (const u of usage) {
  for (let i = 0; i < u.count; i++) {
    multiModelMonitor.trackTokens(
      {
        inputTokens: u.input,
        outputTokens: u.output,
      },
      u.model
    );
  }
}

const costByModel = multiModelMonitor.getCostByModel();
console.log('Cost breakdown by model:');
for (const [model, info] of Object.entries(costByModel)) {
  console.log(
    `  ${model}: ${multiModelMonitor.formatTokens(info.tokenCount)} tokens = ${multiModelMonitor.formatCost(info.totalCost)}`
  );
}

// Example 5: Warning Thresholds
console.log('\n=== Example 5: Warning Detection ===');
const warningMonitor = new ResourceMonitor({
  maxCostUsd: 10,
  maxErrors: 10,
});

// Use 80% of cost limit
warningMonitor.trackTokens(
  {
    inputTokens: 2_000_000,
    outputTokens: 2_000_000,
  },
  'sonnet'
);

status = warningMonitor.checkLimits();
console.log('Warnings detected:', status.warnings.length > 0);
console.log('Warning details:', status.warnings[0]);

// Example 6: Reset for New Session
console.log('\n=== Example 6: Session Reset ===');
const sessionMonitor = new ResourceMonitor();

console.log('Before tracking:');
let m = sessionMonitor.getMetrics();
console.log('  input tokens:', m.totalInputTokens);

sessionMonitor.trackTokens({ inputTokens: 1000, outputTokens: 500 }, 'sonnet');
sessionMonitor.trackError();

console.log('After tracking:');
m = sessionMonitor.getMetrics();
console.log('  input tokens:', m.totalInputTokens);
console.log('  errors:', m.errorCount);

sessionMonitor.reset();

console.log('After reset:');
m = sessionMonitor.getMetrics();
console.log('  input tokens:', m.totalInputTokens);
console.log('  errors:', m.errorCount);
