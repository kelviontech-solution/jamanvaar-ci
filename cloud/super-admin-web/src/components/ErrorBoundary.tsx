import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from './ui';

interface Props {
  children: ReactNode;
  /** Label shown in the console log so a crash can be traced to the boundary that caught it. */
  boundaryName: string;
}

interface State {
  error: Error | null;
}

/**
 * A prop-shape bug or a bad API response should never blank the whole app —
 * before this existed, one broken screen (see FilterTabs mismatches fixed
 * alongside this) took down its entire route with a white page and no way
 * back except a manual reload.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.boundaryName}] render error:`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32 }}>
          <ErrorState
            message={`Something went wrong loading this page (${this.state.error.message}). Try reloading — if it keeps happening, contact platform support.`}
            onRetry={() => {
              this.setState({ error: null });
              window.location.reload();
            }}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
