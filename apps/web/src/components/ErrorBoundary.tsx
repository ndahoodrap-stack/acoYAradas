import { Component, type ReactNode, type ErrorInfo } from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, componentStack: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log a consola donde los sourcemaps SÍ funcionan
    console.error('[ErrorBoundary] Error capturado:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    // Guardar componentStack en estado para mostrarlo en UI
    this.setState({ componentStack: errorInfo.componentStack });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="container-app py-8">
          <div className="card p-6 max-w-2xl mx-auto">
            <h2 className="text-xl font-bold text-red-600 mb-4">Error en la aplicación</h2>
            <pre className="bg-red-50 p-4 rounded text-sm text-red-800 overflow-auto max-h-96">
              {this.state.error?.message}\n\n{this.state.error?.stack}
            </pre>
            {this.state.componentStack && (
              <details className="mt-4">
                <summary className="text-sm text-ink-500 cursor-pointer">Ver component stack (React)</summary>
                <pre className="mt-2 bg-ink-50 p-3 rounded text-xs text-ink-700 overflow-auto max-h-64">
                  {this.state.componentStack}
                </pre>
              </details>
            )}
            <button
              onClick={() => this.setState({ hasError: false, error: null, componentStack: null })}
              className="btn-primary mt-4"
            >
              Reintentar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}