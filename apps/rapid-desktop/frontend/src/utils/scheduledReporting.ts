/**
 * Scheduled Reporting Utility
 *
 * Manages automatic report generation and export on configured schedules:
 * - Daily reports
 * - Weekly reports
 * - Custom intervals
 *
 * Stores configuration in localStorage and manages scheduling via browser APIs
 */

export interface ReportScheduleConfig {
  enabled: boolean;
  reportType: 'cost' | 'tasks' | 'metrics' | 'summary';
  format: 'csv' | 'json' | 'jsonl';
  frequency: 'daily' | 'weekly' | 'monthly' | 'custom';
  customIntervalHours?: number;
  timeOfDay?: string; // 'HH:MM' format
  dayOfWeek?: number; // 0-6 for weekly
  exportPath?: string; // Where to save reports
  lastRun?: string; // ISO timestamp
  nextRun?: string; // ISO timestamp
}

const STORAGE_KEY = 'rapid-report-schedule';

/**
 * Get all scheduled report configurations
 */
export function getScheduledReports(): ReportScheduleConfig[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to load scheduled reports:', error);
    return [];
  }
}

/**
 * Save a report schedule configuration
 */
export function saveReportSchedule(config: ReportScheduleConfig): void {
  try {
    const reports = getScheduledReports();
    const existingIndex = reports.findIndex((r) => r.reportType === config.reportType);

    if (existingIndex >= 0) {
      reports[existingIndex] = config;
    } else {
      reports.push(config);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  } catch (error) {
    console.error('Failed to save scheduled report:', error);
  }
}

/**
 * Delete a report schedule
 */
export function deleteReportSchedule(reportType: string): void {
  try {
    const reports = getScheduledReports().filter((r) => r.reportType !== reportType);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  } catch (error) {
    console.error('Failed to delete scheduled report:', error);
  }
}

/**
 * Calculate next run time for a schedule
 */
export function calculateNextRun(config: ReportScheduleConfig): Date {
  const now = new Date();
  const [hours, minutes] = (config.timeOfDay || '09:00').split(':').map(Number);

  let nextRun = new Date(now);
  nextRun.setHours(hours, minutes, 0, 0);

  // If the time has already passed today, schedule for next occurrence
  if (nextRun <= now) {
    switch (config.frequency) {
      case 'daily':
        nextRun.setDate(nextRun.getDate() + 1);
        break;
      case 'weekly': {
        const daysUntil = ((config.dayOfWeek || 0) - nextRun.getDay() + 7) % 7 || 7;
        nextRun.setDate(nextRun.getDate() + daysUntil);
        break;
      }
      case 'monthly':
        nextRun.setMonth(nextRun.getMonth() + 1);
        break;
      case 'custom':
        if (config.customIntervalHours) {
          nextRun.setHours(nextRun.getHours() + config.customIntervalHours);
        }
        break;
    }
  }

  return nextRun;
}

/**
 * Check if a report is due to run
 */
export function isReportDue(config: ReportScheduleConfig): boolean {
  if (!config.enabled) return false;

  const now = new Date();
  const lastRun = config.lastRun ? new Date(config.lastRun) : null;
  const nextRun = config.nextRun ? new Date(config.nextRun) : calculateNextRun(config);

  if (!lastRun) {
    // Never run before
    return now >= nextRun;
  }

  switch (config.frequency) {
    case 'daily':
      return now.getTime() - lastRun.getTime() >= 24 * 60 * 60 * 1000;
    case 'weekly':
      return now.getTime() - lastRun.getTime() >= 7 * 24 * 60 * 60 * 1000;
    case 'monthly':
      // Check if a month has passed
      return (
        now.getMonth() !== lastRun.getMonth() || now.getFullYear() !== lastRun.getFullYear()
      );
    case 'custom':
      if (!config.customIntervalHours) return false;
      return now.getTime() - lastRun.getTime() >= config.customIntervalHours * 60 * 60 * 1000;
  }

  return false;
}

/**
 * Mark a report as having been run
 */
export function markReportAsRun(reportType: string): void {
  try {
    const reports = getScheduledReports();
    const config = reports.find((r) => r.reportType === reportType);

    if (config) {
      config.lastRun = new Date().toISOString();
      config.nextRun = calculateNextRun(config).toISOString();
      saveReportSchedule(config);
    }
  } catch (error) {
    console.error('Failed to mark report as run:', error);
  }
}

/**
 * Format a schedule configuration to human-readable text
 */
export function formatSchedule(config: ReportScheduleConfig): string {
  if (!config.enabled) return 'Disabled';

  const timeStr = config.timeOfDay || '09:00';

  switch (config.frequency) {
    case 'daily':
      return `Daily at ${timeStr}`;
    case 'weekly': {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = days[config.dayOfWeek || 0];
      return `Every ${dayName} at ${timeStr}`;
    }
    case 'monthly':
      return `Monthly at ${timeStr}`;
    case 'custom':
      if (!config.customIntervalHours) return 'Custom (invalid)';
      return `Every ${config.customIntervalHours} hours`;
  }

  return 'Unknown';
}

/**
 * Validate a schedule configuration
 */
export function validateScheduleConfig(config: Partial<ReportScheduleConfig>): string | null {
  if (!config.reportType) return 'Report type is required';
  if (!config.format) return 'Export format is required';
  if (!config.frequency) return 'Frequency is required';

  if (config.frequency === 'custom' && !config.customIntervalHours) {
    return 'Custom interval hours is required for custom frequency';
  }

  if (config.timeOfDay) {
    const [hours, minutes] = config.timeOfDay.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return 'Invalid time format. Use HH:MM';
    }
  }

  if (config.frequency === 'weekly') {
    const dayOfWeek = config.dayOfWeek ?? 0;
    if (dayOfWeek < 0 || dayOfWeek > 6) {
      return 'Day of week must be between 0 (Sunday) and 6 (Saturday)';
    }
  }

  return null;
}

/**
 * Get default schedule configuration
 */
export function getDefaultScheduleConfig(): ReportScheduleConfig {
  return {
    enabled: false,
    reportType: 'cost',
    format: 'csv',
    frequency: 'daily',
    timeOfDay: '09:00',
    dayOfWeek: 1, // Monday
    customIntervalHours: 24,
  };
}

/**
 * Setup automatic report checking (typically called in a useEffect)
 *
 * Returns a cleanup function to stop checking
 */
export function setupReportScheduler(
  onReportDue: (config: ReportScheduleConfig) => void,
  checkIntervalMs: number = 60000 // Check every minute by default
): () => void {
  const intervalId = setInterval(() => {
    const schedules = getScheduledReports();

    for (const config of schedules) {
      if (isReportDue(config)) {
        onReportDue(config);
      }
    }
  }, checkIntervalMs);

  return () => clearInterval(intervalId);
}
