import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
// 注册内置小组件渲染器（副作用导入：把 ClaudeStatusWidget 登记到 WidgetLayerView 注册表）
import '@/widgets/claude-status'
import { useSceneStore } from '@/engine/scene-store'
import { useClaudeStatusStore } from '@/widgets/claude-status/status-store'

// 开发态把 store 挂到 window，供 E2E（Playwright）读取场景状态做确定性断言，
// 以及手动调试。生产构建（import.meta.env.DEV=false）不暴露。
if (import.meta.env.DEV) {
  const w = window as unknown as {
    __digiboard?: {
      scene: typeof useSceneStore
      claude: typeof useClaudeStatusStore
    }
  }
  w.__digiboard = { scene: useSceneStore, claude: useClaudeStatusStore }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
