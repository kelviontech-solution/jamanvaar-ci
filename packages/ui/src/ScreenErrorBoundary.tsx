import React from 'react';

interface Props {
  /** Change this (e.g. to the current tab) to clear the error and try the new screen. */
  resetKey?: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Keeps one broken screen from blanking the whole app (BUG-162). Without a boundary, an exception thrown while
 * rendering any tab unmounted everything - sidebar included - and the next clicks had nothing to click. With it,
 * the rest of the app stays usable, the screen says what happened, and moving to another tab clears the error.
 */
export class ScreenErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Screen failed to render:', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto mt-10 max-w-xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
        <h2 className="text-lg font-black text-rose-800">This screen could not be shown</h2>
        <p className="mt-2 text-sm text-rose-700">Something went wrong while opening it. The rest of the app is still working: pick another screen from the menu, or try again.</p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="mt-4 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700"
        >
          Try again
        </button>
      </div>
    );
  }
}
