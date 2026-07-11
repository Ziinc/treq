import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    // Avoid picking up web/tsconfig.json which extends @docusaurus/tsconfig
    tsconfigRaw: {
      compilerOptions: {
        target: 'ES2020',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
      },
    },
  },
  test: {
    environment: 'node',
    include: ['web/src/**/*.test.ts'],
    globals: true,
  },
});
