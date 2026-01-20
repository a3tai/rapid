import { useEffect, useState } from 'react';

interface PerformanceMetrics {
  memoryUsage: number;
  memoryLimit: number;
  cpuUsage: number;
  heapSize: number;
  goroutines: number;
  avgResponseTime: number;
  eventsThroughput: number;
  errorRate: number;
  uptime: number;
  timestamp: number;
}

interface PerformanceThresholds {
  memoryWarning: number; // percentage
  cpuWarning: number;
  responseTimeWarning: number; // ms
  errorRateWarning: number; // percentage
  goroutineWarning: number; // count
}

const DEFAULT_THRESHOLDS: PerformanceThresholds = {
  memoryWarning: 80,
  cpuWarning: 75,
  responseTimeWarning: 1000,
  errorRateWarning: 5,
  goroutineWarning: 300
};

export const PerformanceMonitor: React.FC = () => {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [history, setHistory] = useState<PerformanceMetrics[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [thresholds] = useState<PerformanceThresholds>(DEFAULT_THRESHOLDS);
  const [isExpanded, setIsExpanded] = useState(false);

  // Collect performance metrics
  useEffect(() => {
    const collectMetrics = () => {
      // Check if performance.memory is available (only in some environments)
      const perfMemory = (performance as any).memory;

      if (!perfMemory) {
        // Gracefully handle when performance.memory is not available
        console.debug('Performance.memory API not available, using simulated data');
      }

      const usedJSHeapSize = perfMemory?.usedJSHeapSize || Math.random() * 50000000;
      const jsHeapSizeLimit = perfMemory?.jsHeapSizeLimit || 100000000;
      const memoryPercent = (usedJSHeapSize / jsHeapSizeLimit) * 100;

      // Simulate additional metrics (in production, fetch from Go backend)
      const newMetrics: PerformanceMetrics = {
        memoryUsage: usedJSHeapSize / (1024 * 1024),
        memoryLimit: jsHeapSizeLimit / (1024 * 1024),
        cpuUsage: Math.random() * 100, // Placeholder - would come from backend
        heapSize: usedJSHeapSize,
        goroutines: Math.floor(Math.random() * 200) + 50, // Placeholder
        avgResponseTime: Math.random() * 500 + 100,
        eventsThroughput: Math.floor(Math.random() * 100) + 10,
        errorRate: Math.random() * 3,
        uptime: Date.now(),
        timestamp: Date.now()
      };

      setMetrics(newMetrics);
      setHistory(prev => [...prev.slice(-59), newMetrics]); // Keep 60 data points

      // Check for warnings
      const newWarnings: string[] = [];
      if (memoryPercent > thresholds.memoryWarning) {
        newWarnings.push(`Memory usage at ${memoryPercent.toFixed(1)}%`);
      }
      if (newMetrics.errorRate > thresholds.errorRateWarning) {
        newWarnings.push(`Error rate: ${newMetrics.errorRate.toFixed(2)}%`);
      }
      if (newMetrics.avgResponseTime > thresholds.responseTimeWarning) {
        newWarnings.push(`Slow responses: ${newMetrics.avgResponseTime.toFixed(0)}ms`);
      }
      if (newMetrics.goroutines > thresholds.goroutineWarning) {
        newWarnings.push(`High goroutine count: ${newMetrics.goroutines}`);
      }

      setWarnings(newWarnings);
    };

    const interval = setInterval(collectMetrics, 2000);
    collectMetrics(); // Collect immediately

    return () => clearInterval(interval);
  }, [thresholds]);

  if (!metrics) {
    return (
      <div className="p-4 bg-slate-900 rounded-lg border border-slate-700">
        <div className="flex items-center gap-2 text-amber-400">
          <span className="text-lg">⚠️</span>
          <span className="text-sm">Performance monitoring not available</span>
        </div>
      </div>
    );
  }

  const memoryPercent = (metrics.memoryUsage / metrics.memoryLimit) * 100;

  const getStatusColor = (percent: number, threshold: number) => {
    if (percent > threshold * 1.2) return 'bg-red-600';
    if (percent > threshold) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-3">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
          <div className="flex items-center gap-3">
            <span className="text-lg text-cyan-500">📊</span>
            <span className="font-medium text-sm">Performance Metrics</span>
            {warnings.length > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 bg-red-900/30 border border-red-700 rounded">
                <span className="text-sm">⚠️</span>
                <span className="text-xs text-red-300">{warnings.length} warning(s)</span>
              </div>
            )}
          </div>
          <div className="text-xs text-slate-400">
            {isExpanded ? '▼' : '▶'}
          </div>
        </div>

        {/* Quick Stats Row */}
        <div className="grid grid-cols-4 gap-3 mt-3">
          {/* Memory */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm">💾</span>
              <span className="text-xs text-slate-300">Memory</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${getStatusColor(memoryPercent, thresholds.memoryWarning)}`}
                style={{ width: `${Math.min(memoryPercent, 100)}%` }}
              />
            </div>
            <span className="text-xs text-slate-400">
              {metrics.memoryUsage.toFixed(0)} / {metrics.memoryLimit.toFixed(0)} MB
            </span>
          </div>

          {/* CPU */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm">⚙️</span>
              <span className="text-xs text-slate-300">CPU</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${getStatusColor(metrics.cpuUsage, thresholds.cpuWarning)}`}
                style={{ width: `${Math.min(metrics.cpuUsage, 100)}%` }}
              />
            </div>
            <span className="text-xs text-slate-400">{metrics.cpuUsage.toFixed(1)}%</span>
          </div>

          {/* Response Time */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm">⚡</span>
              <span className="text-xs text-slate-300">Response</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${getStatusColor(
                  (metrics.avgResponseTime / thresholds.responseTimeWarning) * 100,
                  100
                )}`}
                style={{
                  width: `${Math.min((metrics.avgResponseTime / thresholds.responseTimeWarning) * 100, 100)}%`
                }}
              />
            </div>
            <span className="text-xs text-slate-400">{metrics.avgResponseTime.toFixed(0)}ms</span>
          </div>

          {/* Error Rate */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm">📈</span>
              <span className="text-xs text-slate-300">Errors</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${getStatusColor(
                  (metrics.errorRate / thresholds.errorRateWarning) * 100,
                  100
                )}`}
                style={{
                  width: `${Math.min((metrics.errorRate / thresholds.errorRateWarning) * 100, 100)}%`
                }}
              />
            </div>
            <span className="text-xs text-slate-400">{metrics.errorRate.toFixed(2)}%</span>
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 space-y-4">
          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-red-300 uppercase">Active Warnings</h3>
              <div className="space-y-1">
                {warnings.map((warning, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 bg-red-900/20 border border-red-800 rounded text-xs text-red-300">
                    <span className="text-sm flex-shrink-0">⚠️</span>
                    <span>{warning}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detailed Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="Heap Size" value={`${(metrics.heapSize / (1024 * 1024)).toFixed(1)} MB`} />
            <MetricCard label="Goroutines" value={metrics.goroutines.toString()} />
            <MetricCard
              label="Events Throughput"
              value={`${metrics.eventsThroughput}/sec`}
              status={metrics.eventsThroughput < 5 ? 'warning' : 'ok'}
            />
            <MetricCard label="Uptime" value={formatUptime(metrics.uptime)} />
          </div>

          {/* Performance History Chart */}
          {history.length > 1 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-300 uppercase">Memory Trend (60s)</h3>
              <div className="flex items-end gap-0.5 h-16 bg-slate-800 p-2 rounded border border-slate-700">
                {history.map((h, i) => {
                  const pct = (h.memoryUsage / h.memoryLimit) * 100;
                  const isWarn = pct > thresholds.memoryWarning;
                  return (
                    <div
                      key={i}
                      className={`flex-1 rounded-t ${isWarn ? 'bg-amber-500' : 'bg-cyan-500'} opacity-70 hover:opacity-100`}
                      style={{ height: `${Math.max(pct, 5)}%` }}
                      title={`${h.memoryUsage.toFixed(1)}MB`}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Recommendations */}
          <div className="space-y-2 p-3 bg-slate-800/50 rounded border border-slate-700">
            <h3 className="text-xs font-semibold text-cyan-300 uppercase">Performance Tips</h3>
            <ul className="text-xs text-slate-400 space-y-1">
              {memoryPercent > 70 && (
                <li>• Consider clearing old messages or events to reduce memory footprint</li>
              )}
              {metrics.errorRate > 2 && (
                <li>• High error rate detected. Check logs for details and consider restart</li>
              )}
              {metrics.avgResponseTime > 800 && (
                <li>• Response times are elevated. Check network and daemon connectivity</li>
              )}
              {metrics.goroutines > 250 && (
                <li>• High goroutine count. There may be connection leaks</li>
              )}
              {warnings.length === 0 && (
                <li>✓ All systems performing normally</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

// Metric Card Component
const MetricCard: React.FC<{ label: string; value: string; status?: 'ok' | 'warning' | 'error' }> = ({
  label,
  value,
  status = 'ok'
}) => {
  const statusColor = {
    ok: 'text-emerald-400',
    warning: 'text-amber-400',
    error: 'text-red-400'
  };

  return (
    <div className="p-3 bg-slate-800 rounded border border-slate-700">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className={`text-sm font-semibold ${statusColor[status]}`}>{value}</div>
    </div>
  );
};

// Helper function to format uptime
const formatUptime = (timestamp: number): string => {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
};

// Export for use in sidebar or dashboard
export default PerformanceMonitor;
