import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  AppError,
  retryWithBackoff,
  handleFetchError,
  safeJsonParse,
  isRetryable,
} from '../../utils/errorHandling'

describe('AppError', () => {
  it('should create an AppError with message and code', () => {
    const error = new AppError('Test error', 'TEST_ERROR')

    expect(error.message).toBe('Test error')
    expect(error.code).toBe('TEST_ERROR')
    expect(error.severity).toBe('error')
    expect(error.retryable).toBe(false)
  })

  it('should support severity levels', () => {
    const critical = new AppError('Critical', 'CRITICAL', 'critical')
    const warning = new AppError('Warning', 'WARNING', 'warning')

    expect(critical.severity).toBe('critical')
    expect(warning.severity).toBe('warning')
  })

  it('should track retryability', () => {
    const retryable = new AppError('Network error', 'NETWORK', 'warning', true)
    const nonRetryable = new AppError('Auth error', 'AUTH', 'error', false)

    expect(retryable.retryable).toBe(true)
    expect(nonRetryable.retryable).toBe(false)
  })
})

describe('retryWithBackoff', () => {
  it('should succeed on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success')

    const result = await retryWithBackoff(fn)

    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should retry on failure', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockResolvedValueOnce('success')

    const result = await retryWithBackoff(fn, { maxAttempts: 2, initialDelayMs: 1 })

    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('should throw after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Permanent failure'))

    await expect(
      retryWithBackoff(fn, { maxAttempts: 2, initialDelayMs: 1 })
    ).rejects.toThrow('Permanent failure')

    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('should apply exponential backoff', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValueOnce('success')

    const start = Date.now()
    await retryWithBackoff(fn, {
      maxAttempts: 3,
      initialDelayMs: 10,
      backoffMultiplier: 2,
    })
    const elapsed = Date.now() - start

    // Should have delays: 10ms + 20ms = 30ms minimum
    expect(elapsed).toBeGreaterThanOrEqual(25)
  })

  it('should respect shouldRetry predicate', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Retryable'))
      .mockRejectedValueOnce(new Error('Non-retryable'))

    const shouldRetry = (err: unknown) =>
      err instanceof Error && err.message === 'Retryable'

    await expect(
      retryWithBackoff(fn, { maxAttempts: 3, initialDelayMs: 1, shouldRetry })
    ).rejects.toThrow('Non-retryable')

    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('handleFetchError', () => {
  it('should categorize network errors', () => {
    const error = new TypeError('Failed to fetch')
    const appError = handleFetchError(error)

    expect(appError.code).toBe('NETWORK_ERROR')
    expect(appError.retryable).toBe(true)
    expect(appError.severity).toBe('warning')
  })

  it('should categorize auth errors', () => {
    const error = new Error('401 Unauthorized')
    const appError = handleFetchError(error)

    expect(appError.code).toBe('AUTH_ERROR')
    expect(appError.retryable).toBe(false)
  })

  it('should categorize permission errors', () => {
    const error = new Error('403 Forbidden')
    const appError = handleFetchError(error)

    expect(appError.code).toBe('PERMISSION_ERROR')
    expect(appError.retryable).toBe(false)
  })

  it('should categorize server errors as retryable', () => {
    const error = new Error('500 Server Error')
    const appError = handleFetchError(error)

    expect(appError.code).toBe('SERVER_ERROR')
    expect(appError.retryable).toBe(true)
  })

  it('should pass through AppError unchanged', () => {
    const originalError = new AppError('Original', 'ORIGINAL', 'critical', false)
    const appError = handleFetchError(originalError)

    expect(appError).toBe(originalError)
  })
})

describe('safeJsonParse', () => {
  it('should parse valid JSON', () => {
    const result = safeJsonParse('{"key": "value"}', {})

    expect(result).toEqual({ key: 'value' })
  })

  it('should return fallback on invalid JSON', () => {
    const fallback = { default: true }
    const result = safeJsonParse('invalid json', fallback)

    expect(result).toBe(fallback)
  })

  it('should handle empty strings', () => {
    const fallback = { empty: true }
    const result = safeJsonParse('', fallback)

    expect(result).toBe(fallback)
  })
})

describe('isRetryable', () => {
  it('should identify retryable AppError', () => {
    const error = new AppError('Network', 'NETWORK', 'warning', true)
    expect(isRetryable(error)).toBe(true)
  })

  it('should identify non-retryable AppError', () => {
    const error = new AppError('Auth', 'AUTH', 'error', false)
    expect(isRetryable(error)).toBe(false)
  })

  it('should identify retryable TypeError', () => {
    const error = new TypeError('Failed to fetch')
    expect(isRetryable(error)).toBe(true)
  })

  it('should identify retryable error messages', () => {
    const error = new Error('Request timeout')
    expect(isRetryable(error)).toBe(true)
  })

  it('should return false for unknown error types', () => {
    expect(isRetryable('string error')).toBe(false)
    expect(isRetryable(null)).toBe(false)
  })
})
