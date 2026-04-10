import { defineConfig } from "eslint/config";
import globals from "globals";
import js from "@eslint/js";
import noInlineCommentsRule from "./eslint-rules/no-inline-comments.js";
import preferFindByTextRule from "./eslint-rules/prefer-find-by-text.js";
import userEventSetupInSetupRule from "./eslint-rules/user-event-setup-in-setup.js";
import pluginReact from "eslint-plugin-react";
import tseslint from "typescript-eslint";

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
    extends: ["js/recommended"],
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    ignores: ignoredGlobs,
    languageOptions: { globals: globals.browser },
    plugins: { js },
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
      "@typescript-eslint/no-unused-vars": [
        "error",
      ],
      "arrow-body-style": ["error", "as-needed"],
      camelcase: ["error", {properties: "never"}],
      "default-case": "error",
      "dot-notation": "error",
      "max-depth": "error",
      "max-lines": [
        "error",
        {
          max: 500,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      "max-nested-callbacks": ["error", 3],
      "max-params": "error",
      "no-alert": "error",
      "no-await-in-loop": "error",
      "no-bitwise": "error",
      "no-caller": "error",
      "no-duplicate-imports": "error",
      "no-inner-declarations": "error",
      "no-self-compare": "error",
      "object-shorthand": ["error", "always"],
      "operator-assignment": ["error", "always"],
      "prefer-arrow-callback": "error",
      "prefer-const": "error",
      "prefer-destructuring": "error",
      "prefer-object-spread": "error",
      "prefer-promise-reject-errors": "error",
      "prefer-regex-literals": "error",
      "prefer-rest-params": "error",
      "prefer-spread": "error",
      "prefer-template": "error",
      radix: "error",
      "react/display-name": "off",
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "require-atomic-updates": "error",
      "vars-on-top": "error",
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
    plugins: {
      local: {
        rules: {
          "no-inline-comments": noInlineCommentsRule,
          "prefer-find-by-text": preferFindByTextRule,
          "user-event-setup-in-setup": userEventSetupInSetupRule,
        },
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "local/no-inline-comments": "error",
      "local/prefer-find-by-text": "error",
      "local/user-event-setup-in-setup": "error",
    },
  },
]);
