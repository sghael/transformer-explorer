// Browser checks and the review panel read these globals. Public builds skip
// them, including the scene report that is otherwise rebuilt every frame.
export const diagnosticsEnabled =
  import.meta.env.VITE_REVIEW === "1" || import.meta.env.DEV;

declare global {
  interface Window {
    __explorer?: object;
    __explorerScene?: object;
    __explorerRender?: object;
    __explorerInspect?: () => object;
  }
}
