import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorBoundary } from '../../components/ErrorBoundary'

// Component that throws an error
function ThrowError() {
  throw new Error('Test error message')
}

// Component that renders successfully
function SafeComponent() {
  return <div>Safe content</div>
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // Suppress console.error for error boundary tests
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('should render children when there is no error', () => {
    render(
      <ErrorBoundary>
        <SafeComponent />
      </ErrorBoundary>
    )

    expect(screen.getByText('Safe content')).toBeInTheDocument()
  })

  it('should render error UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('Test error message')).toBeInTheDocument()
  })

  it('should provide retry functionality', async () => {
    const user = userEvent.setup()

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    )

    const retryButton = screen.getByRole('button', { name: /try again/i })
    expect(retryButton).toBeInTheDocument()

    // After clicking retry, error should still be shown (child still throws)
    await user.click(retryButton)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('should provide reload page button', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    )

    const reloadButton = screen.getByRole('button', { name: /reload page/i })
    expect(reloadButton).toBeInTheDocument()
  })

  it('should use custom fallback when provided', () => {
    const fallback = (error: Error, retry: () => void) => (
      <div>
        <p>Custom error: {error.message}</p>
        <button onClick={retry}>Custom retry</button>
      </div>
    )

    render(
      <ErrorBoundary fallback={fallback}>
        <ThrowError />
      </ErrorBoundary>
    )

    expect(screen.getByText('Custom error: Test error message')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /custom retry/i })).toBeInTheDocument()
  })

  it('should show stack trace in development mode', () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    )

    expect(screen.getByText('Stack trace')).toBeInTheDocument()

    process.env.NODE_ENV = originalEnv
  })

  it('should hide stack trace in production mode', () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    )

    expect(screen.queryByText('Stack trace')).not.toBeInTheDocument()

    process.env.NODE_ENV = originalEnv
  })
})
