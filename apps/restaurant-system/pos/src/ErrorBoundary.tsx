import React from 'react';
import { UtensilsCrossed } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('POS Runtime Caught Exception:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-jaman-cream p-6 text-center select-none">
          <div className="bg-white p-8 rounded-3xl border border-jaman-border shadow-2xl max-w-md w-full space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-[#FFF4ED] text-jaman-saffron flex items-center justify-center mx-auto shadow-sm">
              <UtensilsCrossed className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-black text-jaman-navy">JAMANVAAR POS Recovered</h2>
            <p className="text-xs text-slate-500">
              An unexpected UI exception was safely intercepted. Your database, cart items, and shift transactions are completely safe.
            </p>
            {this.state.error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-left text-xs font-mono text-rose-800 max-h-32 overflow-auto whitespace-pre-wrap select-text">
                <strong className="block font-bold">{this.state.error.name}: {this.state.error.message}</strong>
              </div>
            )}
            <div className="pt-2 flex gap-2 justify-center">
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: undefined });
                  window.location.reload();
                }}
                className="px-5 py-2.5 bg-jaman-saffron hover:bg-[#EA580C] text-white text-xs font-black rounded-xl shadow-lg shadow-jaman-saffron/30 transition-all cursor-pointer"
              >
                Restore POS Workspace
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
