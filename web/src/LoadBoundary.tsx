import { Component, type ReactNode } from "react";
export class WebGLUnavailableError extends Error {
  name = "WebGLUnavailableError";
}
// The scene boundary replaces only the 3D view, so explanations, numbers and
// tour controls stay usable when the model or WebGL is unavailable.
const messages = {
  exhibit: {
    title: "The exhibit stopped",
    body: "Reload this page to try again.",
  },
  scene: {
    title: "The model could not load",
    body: "Check your connection and reload. The explanations and numbers beside the model still work.",
  },
  webgl: {
    title: "3D view unavailable",
    body: "This browser could not start WebGL, so the model cannot be drawn. The explanations, numbers and tour controls still work.",
  },
};
export default class LoadBoundary extends Component<
  {
    children: ReactNode;
    scope: "exhibit" | "scene";
    onError?: (error: Error) => void;
  },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    this.props.onError?.(error);
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const message =
      error instanceof WebGLUnavailableError
        ? messages.webgl
        : messages[this.props.scope];
    return (
      <div className={`load-error ${this.props.scope}`} role="alert">
        <h2>{message.title}</h2>
        <p>{message.body}</p>
        {!(error instanceof WebGLUnavailableError) && (
          <button onClick={() => location.reload()}>Reload exhibit</button>
        )}
      </div>
    );
  }
}
