import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    // three.js core ships as one module of roughly 700 kB minified.
    chunkSizeWarningLimit: 750,
    rollupOptions: {
      output: {
        // Long-lived vendor chunks keep their hashes across app releases. The
        // three chunk loads only with the lazily imported scene.
        manualChunks(id) {
          if (/node_modules\/three\//.test(id)) return "three";
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id))
            return "react";
        },
      },
    },
  },
});
