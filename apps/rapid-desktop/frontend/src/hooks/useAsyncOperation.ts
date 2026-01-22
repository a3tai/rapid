import { useState, useCallback, useRef, useEffect } from 'react';
import {
  AppError,
  retryWithBackoff,
  handleFetchError,
  isRetryable,
  type RetryOptions,
} from '../utils/errorHandling';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: AppError | null;
  isRetrying: boolean;
}

interface UseAsyncOperationOptions extends RetryOptions {
  onError?: (error: AppError) => void;
  onSuccess?: (data: unknown) => void;
}

/**
 * Hook for handling async operations with automatic retry, error handling, and state management
 *
 * @example
 * const { data, loading, error, execute, retry } = useAsyncOperation(
 *   () => fetchUser(userId),
 *   { maxAttempts: 3 }
 * )
 *
 * useEffect(() => {
 *   execute()
 * }, [userId])
 */
export function useAsyncOperation<T>(
  operation: () => Promise<T>,
  options: UseAsyncOperationOptions = {}
) {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: false,
    error: null,
    isRetrying: false,
  });

  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const updateState = useCallback((updates: Partial<AsyncState<T>>) => {
    if (!isMountedRef.current) return;
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const execute = useCallback(async () => {
    // Prevent concurrent executions
    if (state.loading) return;

    updateState({ loading: true, error: null });

    try {
      abortControllerRef.current = new AbortController();

      const data = await retryWithBackoff(
        () =>
          Promise.race([
            operation(),
            new Promise<T>((_, reject) =>
              abortControllerRef.current?.signal.addEventListener('abort', () =>
                reject(new Error('Operation cancelled'))
              )
            ),
          ]),
        options
      );

      updateState({ data, loading: false, error: null });
      options.onSuccess?.(data);
      return data;
    } catch (error) {
      const appError = handleFetchError(error);
      updateState({ loading: false, error: appError, isRetrying: false });
      options.onError?.(appError);
      throw appError;
    }
  }, [operation, state.loading, updateState, options]);

  const retry = useCallback(async () => {
    if (!state.error || !isRetryable(state.error)) {
      return;
    }

    updateState({ isRetrying: true, error: null });

    try {
      const data = await retryWithBackoff(operation, { ...options, maxAttempts: 2 });
      updateState({ data, loading: false, error: null, isRetrying: false });
      options.onSuccess?.(data);
      return data;
    } catch (error) {
      const appError = handleFetchError(error);
      updateState({ loading: false, error: appError, isRetrying: false });
      options.onError?.(appError);
      throw appError;
    }
  }, [operation, state.error, updateState, options]);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    updateState({ data: null, loading: false, error: null, isRetrying: false });
  }, [updateState]);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    updateState({ loading: false, isRetrying: false });
  }, [updateState]);

  return {
    ...state,
    execute,
    retry,
    reset,
    cancel,
  };
}

/**
 * Hook for executing operation on mount or when dependencies change
 */
export function useAsyncOperationEffect<T>(
  operation: () => Promise<T>,
  dependencies: React.DependencyList = [],
  options: UseAsyncOperationOptions = {}
) {
  const { execute, ...result } = useAsyncOperation(operation, options);

  useEffect(() => {
    execute();
  }, dependencies);

  return result;
}
