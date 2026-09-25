import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist/**", "node_modules/**"]),
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    // Only the classic hooks rules: the plugin's recommended presets also
    // enable the React Compiler rule set, which this project does not use.
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Leading underscores mark parameters kept for signature compatibility.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["*.mjs", "vite.config.ts", "eslint.config.js"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["vite.config.ts"],
    extends: [tseslint.configs.recommended],
  },
  {
    // Playwright scripts pass callbacks to page.evaluate that run in the page.
    files: ["*.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
]);
