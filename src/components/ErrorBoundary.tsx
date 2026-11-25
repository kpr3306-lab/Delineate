import { Component, type ReactNode } from 'react';

type Props = { area: string; children: ReactNode };
type State = { error: Error | null };

/** Keeps one tab's failure inside that tab: a calm message and a retry instead of a blank app. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.area}]`, error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // a lazily loaded tab that couldn't be fetched (offline before it was ever cached)
    const offline = /dynamically imported module|Failed to fetch|Loading chunk|Importing a module script failed/i.test(error.message);
    return (
      <div className="crash" role="alert">
        <span className="eyebrow">{this.props.area}</span>
        <h2>{offline ? 'This part couldn’t load.' : 'Something went wrong here.'}</h2>
        <p>
          {offline
            ? 'It needs a connection the first time it opens. Your photos are safe — everything already saved stays on this device.'
            : 'Your photos are safe — everything already saved stays on this device. Try again, or reload the app.'}
        </p>
        <div className="hero-actions">
          <button type="button" className="button button-dark" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
          <button type="button" className="button button-outline" onClick={() => window.location.reload()}>
            Reload the app
          </button>
        </div>
        <details>
          <summary>Details</summary>
          <code>{error.message}</code>
        </details>
      </div>
    );
  }
}
