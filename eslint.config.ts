import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import { defineConfig } from "eslint/config";

const ignoredGlobs = [
  "docs/.docusaurus/**",
  "docs/build/**",
  ".treq/**",
  "target/**",
  "src-tauri/target/**",
  "dist/**",
  "node_modules/**",
];

export default defineConfig([
  {
    ignores: ignoredGlobs,
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    ignores: ignoredGlobs,
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.browser },
  },
  {
    extends: [tseslint.configs.recommended],
  },
  pluginReact.configs.flat.recommended,
  {
    settings: {
      react: { version: "detect" },
    },
  },
  {
    rules: {
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react/display-name": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["*.config.{js,ts}", "tailwind.config.js"],
    languageOptions: {
      globals: {
        ...globals.node,
        require: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "no-undef": "off",
    },
  },
  {
    files: ["eslint-rules/**/*.js", "scripts/**/*.js"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["test/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);
