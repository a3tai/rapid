import { clsx } from 'clsx';
import type { ReactNode } from 'react';

// Error severity types
type ErrorSeverity = 'warning' | 'error' | 'info';

// SVG icons for different error types
const Icons: Record<string, ReactNode> = {
  connection: (
    <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  ),
  server: (
    <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
    </svg>
  ),
  network: (
    <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
    </svg>
  ),
  permission: (
    <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  ),
  timeout: (
    <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  generic: (
    <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  ),
};

type IconType = keyof typeof Icons;

// Severity color configurations
const severityColors: Record<ErrorSeverity, {
  bg: string;
  border: string;
  iconBg: string;
  iconColor: string;
  buttonBg: string;
}> = {
  error: {
    bg: 'bg-red-500/5',
    border: 'border-red-500/20',
    iconBg: 'bg-red-500/10',
    iconColor: 'text-red-400',
    buttonBg: 'bg-red-500 hover:bg-red-600',
  },
  warning: {
    bg: 'bg-yellow-500/5',
    border: 'border-yellow-500/20',
    iconBg: 'bg-yellow-500/10',
    iconColor: 'text-yellow-400',
    buttonBg: 'bg-yellow-500 hover:bg-yellow-600 text-black',
  },
  info: {
    bg: 'bg-blue-500/5',
    border: 'border-blue-500/20',
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-400',
    buttonBg: 'bg-blue-500 hover:bg-blue-600',
  },
};

interface ErrorStateProps {
  /** Error title */
  title?: string;
  /** Error message/description */
  message?: string;
  /** Detailed error info (shown in expandable section) */
  details?: string;
  /** Icon type to display */
  icon?: IconType | ReactNode;
  /** Error severity */
  severity?: ErrorSeverity;
  /** Retry action */
  onRetry?: () => void;
  /** Custom retry button label */
  retryLabel?: string;
  /** Whether retry is currently in progress */
  isRetrying?: boolean;
  /** Alternative action */
  alternativeAction?: {
    label: string;
    onClick: () => void;
  };
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show as inline (card style) vs full page */
  inline?: boolean;
  /** Additional className */
  className?: string;
}

const sizeConfigs = {
  sm: {
    container: 'py-4 px-4',
    iconWrapper: 'w-12 h-12',
    title: 'text-sm',
    message: 'text-xs',
    button: 'px-3 py-1.5 text-xs',
  },
  md: {
    container: 'py-8 px-6',
    iconWrapper: 'w-16 h-16',
    title: 'text-base',
    message: 'text-sm',
    button: 'px-4 py-2 text-sm',
  },
  lg: {
    container: 'py-12 px-8',
    iconWrapper: 'w-20 h-20',
    title: 'text-lg',
    message: 'text-sm',
    button: 'px-5 py-2.5 text-sm',
  },
};

export function ErrorState({
  title = 'Something went wrong',
  message,
  details,
  icon = 'generic',
  severity = 'error',
  onRetry,
  retryLabel = 'Try Again',
  isRetrying = false,
  alternativeAction,
  size = 'md',
  inline = false,
  className,
}: ErrorStateProps) {
  const colors = severityColors[severity];
  const sizeConfig = sizeConfigs[size];

  const iconElement =
    typeof icon === 'string' ? (
      <div className={colors.iconColor}>{Icons[icon]}</div>
    ) : (
      icon
    );

  const content = (
    <div
      className={clsx(
        'flex flex-col items-center justify-center text-center',
        sizeConfig.container,
        className
      )}
    >
      {/* Icon container */}
      <div
        className={clsx(
          'rounded-2xl flex items-center justify-center mb-4',
          colors.iconBg,
          sizeConfig.iconWrapper
        )}
      >
        {iconElement}
      </div>

      {/* Title */}
      <h3 className={clsx('font-mono text-rapid-text mb-2', sizeConfig.title)}>
        {title}
      </h3>

      {/* Message */}
      {message && (
        <p className={clsx('text-rapid-muted max-w-md mb-4', sizeConfig.message)}>
          {message}
        </p>
      )}

      {/* Actions */}
      {(onRetry || alternativeAction) && (
        <div className="flex items-center gap-3 mt-2">
          {onRetry && (
            <button
              onClick={onRetry}
              disabled={isRetrying}
              className={clsx(
                'inline-flex items-center gap-2 font-mono text-white rounded-lg transition-all duration-200',
                !isRetrying && 'hover:-translate-y-0.5',
                colors.buttonBg,
                sizeConfig.button,
                isRetrying && 'opacity-70 cursor-not-allowed'
              )}
            >
              {isRetrying ? (
                <>
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
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
                  Retrying...
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                    />
                  </svg>
                  {retryLabel}
                </>
              )}
            </button>
          )}
          {alternativeAction && (
            <button
              onClick={alternativeAction.onClick}
              className={clsx(
                'font-mono text-rapid-muted hover:text-rapid-text transition-colors',
                sizeConfig.button
              )}
            >
              {alternativeAction.label}
            </button>
          )}
        </div>
      )}

      {/* Details (expandable) */}
      {details && (
        <details className="mt-4 w-full max-w-md">
          <summary className="cursor-pointer text-xs text-rapid-muted hover:text-rapid-text font-mono">
            Show details
          </summary>
          <pre className="mt-2 p-3 bg-rapid-elevated rounded-lg text-xs text-rapid-muted font-mono overflow-auto text-left">
            {details}
          </pre>
        </details>
      )}
    </div>
  );

  if (inline) {
    return (
      <div
        className={clsx(
          'rounded-lg border',
          colors.bg,
          colors.border
        )}
      >
        {content}
      </div>
    );
  }

  return content;
}

// Pre-configured error states for common scenarios

interface ConnectionErrorProps {
  onRetry?: () => void;
  isRetrying?: boolean;
  inline?: boolean;
}

export function ConnectionError({ onRetry, isRetrying, inline }: ConnectionErrorProps) {
  return (
    <ErrorState
      icon="connection"
      title="Connection Error"
      message="Unable to connect to the RAPID daemon. Please check that the service is running."
      severity="error"
      onRetry={onRetry}
      isRetrying={isRetrying}
      inline={inline}
    />
  );
}

export function NetworkError({ onRetry, isRetrying, inline }: ConnectionErrorProps) {
  return (
    <ErrorState
      icon="network"
      title="Network Unavailable"
      message="Check your network connection and try again."
      severity="warning"
      onRetry={onRetry}
      isRetrying={isRetrying}
      inline={inline}
    />
  );
}

export function ServerError({ onRetry, isRetrying, inline }: ConnectionErrorProps) {
  return (
    <ErrorState
      icon="server"
      title="Server Error"
      message="The server encountered an error processing your request."
      severity="error"
      onRetry={onRetry}
      isRetrying={isRetrying}
      inline={inline}
    />
  );
}

export function TimeoutError({ onRetry, isRetrying, inline }: ConnectionErrorProps) {
  return (
    <ErrorState
      icon="timeout"
      title="Request Timed Out"
      message="The operation took too long to complete. Please try again."
      severity="warning"
      onRetry={onRetry}
      isRetrying={isRetrying}
      inline={inline}
    />
  );
}

export function PermissionError({ inline }: { inline?: boolean }) {
  return (
    <ErrorState
      icon="permission"
      title="Access Denied"
      message="You don't have permission to perform this action."
      severity="warning"
      inline={inline}
    />
  );
}

interface LoadingErrorProps {
  what?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  inline?: boolean;
}

export function LoadingError({ what = 'data', onRetry, isRetrying, inline }: LoadingErrorProps) {
  return (
    <ErrorState
      icon="generic"
      title={`Failed to load ${what}`}
      message="There was a problem loading the requested information."
      severity="error"
      onRetry={onRetry}
      isRetrying={isRetrying}
      inline={inline}
      size="md"
    />
  );
}

// Inline error banner for showing errors within content areas
interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
  onRetry?: () => void;
  severity?: ErrorSeverity;
}

export function ErrorBanner({ message, onDismiss, onRetry, severity = 'error' }: ErrorBannerProps) {
  const colors = severityColors[severity];

  return (
    <div
      className={clsx(
        'flex items-center gap-3 px-4 py-3 rounded-lg border',
        colors.bg,
        colors.border
      )}
    >
      <div className={clsx(colors.iconColor)}>
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <span className={clsx('flex-1 text-sm', colors.iconColor)}>{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className={clsx('text-xs font-mono underline', colors.iconColor)}
        >
          Retry
        </button>
      )}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-rapid-muted hover:text-rapid-text transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
