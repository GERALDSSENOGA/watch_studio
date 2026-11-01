"use client"

import * as React from "react"

/**
 * Error Boundary: catches JavaScript errors anywhere in its child component
 * tree, logs them, and displays a fallback UI instead of crashing the whole
 * page. Used around RoomPlayer, ScreenShare, RoomChat, and other critical
 * watch-room components so a single component failure doesn't take down the
 * entire room.
 */
interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("[WatchStudio Error Boundary] Caught error:", error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      return (
        <div
          className="flex flex-col items-center justify-center p-6 text-center"
        >
          <h2 className="text-lg font-semibold text-destructive">
            Something went wrong
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {this.state.error?.message ?? "An unexpected error occurred."}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null })
            }}
            className="mt-4 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-hover"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

/**
 * Hook for functional components that want to opt into error boundary behavior.
 * Wraps a component with ErrorBoundary automatically.
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: React.ReactNode
): React.ComponentType<P> {
  const WithErrorBoundary = (props: P) => (
    <ErrorBoundary fallback={fallback}>
      <Component {...props} />
    </ErrorBoundary>
  )
  WithErrorBoundary.displayName = `withErrorBoundary(${Component.displayName ?? Component.name})`
  return WithErrorBoundary
}
