import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallbackLabel?: string;
}
interface State {
  error: Error | null;
}

/**
 * Catches render-time exceptions so a single broken subtree (Cesium tile
 * fetch, R3F frame error, etc.) doesn't blank the whole app. Without this,
 * any thrown error during render bubbles to React's top-level handler and
 * unmounts the entire tree, which the user sees as a white screen.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Surface the error in the console so the next debugging round has signal.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] caught render error:", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 space-y-4">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-white/60">
            {this.props.fallbackLabel ?? "The view hit an unexpected error and was stopped to keep the app responsive."}
          </p>
          <pre className="text-[11px] text-red-300/80 whitespace-pre-wrap break-words bg-black/40 p-3 rounded-lg max-h-40 overflow-auto">
            {this.state.error.message}
          </pre>
          <div className="flex gap-2">
            <button
              onClick={this.reset}
              className="px-3 py-1.5 rounded-xl bg-primary/20 text-primary border border-primary/30 text-sm hover:bg-primary/30 transition-colors"
            >
              Try again
            </button>
            <button
              onClick={() => (window.location.href = "/")}
              className="px-3 py-1.5 rounded-xl bg-white/[0.06] border border-white/[0.08] text-sm hover:bg-white/[0.1] transition-colors"
            >
              Go home
            </button>
          </div>
        </div>
      </div>
    );
  }
}