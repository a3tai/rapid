/**
 * Error Handling Utilities
 *
 * Provides consistent error handling across the application with:
 * - Exponential backoff retry logic
 * - Error categorization
 * - User-friendly error messages
 * - Error logging and tracking
 */

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public severity: 'info' | 'warning' | 'error' | 'critical' = 'error',
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: unknown) => boolean;
}

/**
 * Exponential backoff retry logic
 *
 * @example
 * const result = await retryWithBackoff(
 *   () => fetchData(),
 *   { maxAttempts: 3, initialDelayMs: 100 }
 * )
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 100,
    maxDelayMs = 10000,
    backoffMultiplier = 2,
    shouldRetry = () => true,
  } = options;

  let lastError: unknown;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!shouldRetry(error) || attempt === maxAttempts - 1) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * backoffMultiplier, maxDelayMs);
    }
  }

  throw lastError;
}

/**
 * Categorize and normalize fetch errors
 */
export function handleFetchError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof TypeError) {
    if (error.message.includes('fetch')) {
      return new AppError(
        'Network connection failed. Check your internet connection.',
        'NETWORK_ERROR',
        'warning',
        true
      );
    }
  }

  if (error instanceof Error) {
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      return new AppError('Session expired. Please log in again.', 'AUTH_ERROR', 'warning', false);
    }

    if (error.message.includes('403') || error.message.includes('Forbidden')) {
      return new AppError(
        'You do not have permission to perform this action.',
        'PERMISSION_ERROR',
        'warning',
        false
      );
    }

    if (error.message.includes('404')) {
      return new AppError(
        'The requested resource was not found.',
        'NOT_FOUND_ERROR',
        'warning',
        false
      );
    }

    if (error.message.includes('500')) {
      return new AppError('Server error. Please try again later.', 'SERVER_ERROR', 'error', true);
    }

    return new AppError(
      error.message || 'An unexpected error occurred',
      'UNKNOWN_ERROR',
      'error',
      false
    );
  }

  return new AppError('An unexpected error occurred', 'UNKNOWN_ERROR', 'error', false);
}

/**
 * Safely parse JSON with error handling
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch (error) {
    console.warn('JSON parse error:', error);
    return fallback;
  }
}

/**
 * Safe function invocation with error handling
 */
export async function safeInvoke<T>(
  fn: () => Promise<T>,
  onError?: (error: AppError) => void
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    const appError = handleFetchError(error);
    onError?.(appError);
    return undefined;
  }
}

/**
 * Create error summary for display
 */
export function getErrorSummary(error: AppError | Error): string {
  if (error instanceof AppError) {
    return error.message;
  }
  return error?.message || 'An unexpected error occurred';
}

/**
 * Check if error is retryable
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.retryable;
  }

  if (error instanceof TypeError) {
    return error.message.includes('fetch');
  }

  if (error instanceof Error) {
    return (
      error.message.includes('500') ||
      error.message.includes('timeout') ||
      error.message.includes('Network')
    );
  }

  return false;
}
