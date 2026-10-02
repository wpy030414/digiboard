import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite-plus'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Vite+ 单一配置：dev/build/preview + test(vitest) + lint(oxlint) + fmt(oxfmt)
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
  lint: {
    ignorePatterns: ['dist/**', 'playwright-report/**', 'test-results/**'],
  },
  fmt: {
    semi: false,
    singleQuote: true,
  },
})
