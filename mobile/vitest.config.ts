import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Pure-JS smoke tests for the design tokens. Does not load the
// react-native runtime — keep these tests dependency-light.
//
// We override esbuild's tsconfigRaw so vitest does not try to resolve
// the app-level tsconfig's `expo/tsconfig.base` extension (which is only
// available once `npm install` has been run inside mobile/).

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Root the project at mobile/ so include/exclude globs and CLI filter
  // arguments resolve relative to mobile/, even when vitest is invoked
  // from the worktree root.
  root: here,
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    globals: false,
  },
  resolve: {
    alias: {
      '@': resolve(here, 'src'),
    },
  },
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        target: 'es2022',
        module: 'esnext',
        moduleResolution: 'bundler',
        esModuleInterop: true,
        jsx: 'react-jsx',
        useDefineForClassFields: true,
        verbatimModuleSyntax: false,
      },
    },
  },
});


