import React, { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, retry: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary Component
 *
 * Catches React errors and displays a fallback UI with retry capability.
 * Prevents entire app crash from component errors.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleRetry);
      }

      return (
        <div className="flex items-center justify-center min-h-screen bg-slate-950 p-4">
          <div className="max-w-md w-full space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <svg
                className="w-8 h-8 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <h1 className="text-lg font-semibold">Something went wrong</h1>
            </div>

            <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
              <p className="text-sm text-slate-300 font-mono break-words">
                {this.state.error.message}
              </p>
              {process.env.NODE_ENV === 'development' && (
                <details className="mt-4 pt-4 border-t border-slate-700">
                  <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-300">
                    Stack trace
                  </summary>
                  <pre className="mt-2 text-xs text-slate-500 overflow-auto max-h-48 bg-slate-950 p-2 rounded">
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
            </div>

            <div className="flex gap-2 pt-4">
              <button
                onClick={this.handleRetry}
                className="flex-1 px-4 py-2 bg-rapid-accent text-slate-950 rounded-lg font-medium hover:bg-rapid-accent/90 transition-colors"
              >
                Try again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 px-4 py-2 bg-slate-800 text-slate-100 rounded-lg font-medium hover:bg-slate-700 transition-colors"
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
