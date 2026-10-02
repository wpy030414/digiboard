import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
// 注册内置小组件渲染器（副作用导入：把 ClaudeStatusWidget 登记到 WidgetLayerView 注册表）
import '@/widgets/claude-status'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
