import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite-plus'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 部署基路径：本地开发与预览恒为根路径；
// CI 注入 PAGES_BASE_PATH 决定线上前缀：项目页 /<repo>/，自定义域或用户页 /
// 代码不做任何域名或仓库名推断
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

const base = process.env.PAGES_BASE_PATH || '/'

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
