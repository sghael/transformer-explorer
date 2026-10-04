import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Split vendor code so app changes do not invalidate the large three.js chunk.
const vendorChunk = (id: string): string | undefined => {
  // The entry needs Vite's preload helper to import the lazy scene. Left to
  // Rollup it can land in the r3f chunk, which would load the 3D libraries
  // before the explanation UI; keep it with React, which the entry loads.
  if (id.includes("vite/preload-helper")) return "react";
  if (!id.includes("node_modules")) return undefined;
  if (/node_modules\/three\//.test(id)) return "three";
  if (
    /node_modules\/(@react-three|three-|camera-controls|maath|troika-|meshline|stats)/.test(
      id,
    )
  )
    return "r3f";
  if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react";
  return "vendor";
};

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: { output: { manualChunks: vendorChunk } },
  },
});
