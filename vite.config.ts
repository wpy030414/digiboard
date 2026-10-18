import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite-plus'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * 部署基路径：GitHub Pages 项目站点挂在 `/<repo>/` 下（本项目为 `/digiboard/`），
 * 资源与路由都必须带此前缀。本地 dev / preview / e2e 保持根路径；
 * 需要复现线上构建时用 `DIGIBOARD_BASE=/digiboard/ pnpm build` 覆盖。
 */
/**
 * 把 onnxruntime-web 的 WASM 运行时复制到 src/ort/。
 *
 * 包的 exports 不暴露 dist 子路径，无法直接 `import '.../dist/x.wasm?url'`；
 * 复制到源码树后由 Vite 以 `?url` 处理（dev 直接服务，build 输出到 assets/）。
 * 放在插件里而不是 npm script：CI 直接跑 `vp build`，不会经过 package.json 的 build。
 * 目标文件与源文件同尺寸时跳过，避免每次启动重复复制 13MB。
 */
function copyOrtRuntime() {
  const root = fileURLToPath(new URL('.', import.meta.url))
  const from = join(root, 'node_modules', 'onnxruntime-web', 'dist')
  const to = join(root, 'src', 'ort')
  const files = ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']
  const copy = () => {
    mkdirSync(to, { recursive: true })
    for (const file of files) {
      const src = join(from, file)
      const dst = join(to, file)
      if (!existsSync(src)) continue
      if (existsSync(dst) && statSync(dst).size === statSync(src).size) continue
      copyFileSync(src, dst)
    }
  }
  return {
    name: 'digiboard-copy-ort',
    buildStart: copy,
    configureServer: copy,
  }
}

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base =
  process.env.DIGIBOARD_BASE ??
  (process.env.GITHUB_ACTIONS === 'true' && repoName ? `/${repoName}/` : '/')

// Vite+ 单一配置：dev/build/preview + test(vitest) + lint(oxlint) + fmt(oxfmt)
export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), copyOrtRuntime()],
  // Worker 里才 import ORT：预热依赖，避免首次抠图时 Vite 发现新依赖并整页重载
  optimizeDeps: {
    include: ['onnxruntime-web/wasm'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'bridge/**/*.test.mjs'],
  },
  lint: {
    ignorePatterns: ['dist/**', 'src/ort/**', 'playwright-report/**', 'test-results/**'],
  },
  fmt: {
    semi: false,
    singleQuote: true,
  },
})
