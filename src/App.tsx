import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { EditorPage } from '@/pages/EditorPage'
import { PlayerPage } from '@/pages/PlayerPage'
import { useClaudeStatus } from '@/widgets/claude-status/use-claude-status'

/**
 * 路由前缀跟随 Vite 的 base：GitHub Pages 项目站点部署在 `/digiboard/`，
 * 本地则是 `/`。BASE_URL 自带尾斜杠，basename 约定不带。
 */
const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

export default function App() {
  // 全应用挂一次：驱动 Claude 会话状态 store（SSE 连接或 mock 降级），
  // 编辑器与播放页共享同一单例 store，避免路由切换时重复建连。
  useClaudeStatus()

  return (
    <TooltipProvider delayDuration={300}>
      <BrowserRouter basename={basename}>
        <Routes>
          <Route path="/" element={<EditorPage />} />
          <Route path="/play" element={<PlayerPage />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  )
}
