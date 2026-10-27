import { defineConfig } from 'vitest/config';

const root = import.meta.dirname;

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.{test,spec}.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': root,
      '~': root,
    },
  },
});
