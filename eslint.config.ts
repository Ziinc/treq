// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import { defineConfig } from "eslint/config";
import globals from "globals";
import js from "@eslint/js";
import noDocumentDispatchEventRule from "./eslint-rules/no-document-dispatch-event.js";
import noInlineCommentsRule from "./eslint-rules/no-inline-comments.js";
import noUnusedExportedTsFunctionsRule from "./eslint-rules/no-unused-exported-ts-functions.js";
import noUnusedPubRustFunctionsRule from "./eslint-rules/no-unused-pub-rust-functions.js";
import preferFindByTextRule from "./eslint-rules/prefer-find-by-text.js";
import userEventSetupInSetupRule from "./eslint-rules/user-event-setup-in-setup.js";
import preferClickByQueryRule from "./eslint-rules/prefer-click-by-query.js";
import noBannedClassSelectorRule from "./eslint-rules/no-banned-class-selector.js";
import requireTauriApiExportsUsedRule from "./eslint-rules/require-tauri-api-exports-used.js";
import requireTauriApiCommandWrappersRule from "./eslint-rules/require-tauri-api-command-wrappers.js";
import pluginReact from "eslint-plugin-react";
import tseslint from "typescript-eslint";

const ignoredGlobs = [
  "docs/.docusaurus/**",
  "docs/build/**",
  ".treq/**",
  "target/**",
  "src-tauri/target/**",
  "dist/**",
  "src/dist/**",
  "node_modules/**",
];

const localRules = {
  "no-document-dispatch-event": noDocumentDispatchEventRule,
  "no-inline-comments": noInlineCommentsRule,
  "no-unused-exported-ts-functions": noUnusedExportedTsFunctionsRule,
  "no-unused-pub-rust-functions": noUnusedPubRustFunctionsRule,
  "prefer-click-by-query": preferClickByQueryRule,
  "prefer-find-by-text": preferFindByTextRule,
  "user-event-setup-in-setup": userEventSetupInSetupRule,
  "no-banned-class-selector": noBannedClassSelectorRule,
  "require-tauri-api-exports-used": requireTauriApiExportsUsedRule,
  "require-tauri-api-command-wrappers": requireTauriApiCommandWrappersRule,
};

export default defineConfig([{
  ignores: ignoredGlobs,
}, {
  extends: ["js/recommended"],
  files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
  ignores: ignoredGlobs,
  languageOptions: { globals: globals.browser },
  plugins: {
    js,
    local: {
      rules: localRules,
    },
  },
}, {
  files: ["src/**/*.{ts,tsx}"],
  rules: {
    "local/no-unused-exported-ts-functions": "error",
  },
}, {
  extends: [tseslint.configs.recommended],
}, pluginReact.configs.flat.recommended, {
  settings: {
    react: { version: "detect" },
  },
}, {
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
}, {
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
}, {
  files: ["eslint-rules/**/*.js", "scripts/**/*.js"],
  languageOptions: { globals: globals.node },
}, {
  files: ["src/lib/api.ts", "src/lib/api-extra.ts", "src/lib/api-github.ts"],
  rules: {
    "max-params": "off",
    "local/require-tauri-api-exports-used": "error",
    "local/require-tauri-api-command-wrappers": "error",
    "local/no-unused-pub-rust-functions": "error",
  },
}, {
  files: ["src/hooks/useKeyboard.ts"],
  rules: {
    "max-params": "off",
  },
}, {
  files: ["test/**/*.{ts,tsx}"],
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
    "max-nested-callbacks": "off",
    "local/no-document-dispatch-event": "error",
    "local/no-inline-comments": "error",
    "local/prefer-click-by-query": "error",
    "local/prefer-find-by-text": "error",
    "local/user-event-setup-in-setup": "error",
    "local/no-banned-class-selector": "error",
  },
}, ...storybook.configs["flat/recommended"]]);
