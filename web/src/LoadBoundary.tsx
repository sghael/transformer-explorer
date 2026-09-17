import { Component, type ReactNode } from "react";
export default class LoadBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="load-error" role="alert">
        <h2>The model could not load</h2>
        <p>
          Check your connection and reload this page. The tutorial needs its
          generated GLB asset.
        </p>
        <button onClick={() => location.reload()}>Reload exhibit</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
