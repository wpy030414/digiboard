/**
 * Claude Code 会话状态 store（zustand）。
 *
 * 单例持有最新状态与连接态。useClaudeStatus 驱动它：
 *  - 尝试连 bridge SSE（默认 http://localhost:4321/events）
 *  - 连上 => connection='live'，用真实数据
 *  - 连接失败/超时 => connection='mock'，周期性喂演示数据
 * 小组件（WidgetLayerView 注册的渲染器）订阅本 store 取数。
 */

import { create } from 'zustand'
import type { ClaudeSessionStatus, ClaudeStatusPayload, ConnectionStatus } from './types'
import { mockPayload, nextMockPayload } from './mock'

interface ClaudeStatusState {
  sessions: ClaudeSessionStatus[]
  connection: ConnectionStatus
  bridgeUrl: string
  lastUpdate: number

  setPayload: (p: ClaudeStatusPayload) => void
  setConnection: (c: ConnectionStatus) => void
  setBridgeUrl: (url: string) => void
}

export const useClaudeStatusStore = create<ClaudeStatusState>((set) => ({
  sessions: mockPayload().sessions,
  connection: 'connecting',
  bridgeUrl: 'http://localhost:4321/events',
  lastUpdate: Date.now(),

  setPayload: (p) =>
    set({ sessions: p.sessions, lastUpdate: p.now || Date.now(), connection: 'live' }),
  setConnection: (c) => set({ connection: c }),
  setBridgeUrl: (url) => set({ bridgeUrl: url }),
}))

// —— mock 心跳：仅在 connection==='mock' 时推进演示数据 ——
let mockTimer: ReturnType<typeof setInterval> | null = null
export function startMockHeartbeat() {
  if (mockTimer) return
  mockTimer = setInterval(() => {
    if (useClaudeStatusStore.getState().connection === 'mock') {
      const p = nextMockPayload()
      useClaudeStatusStore.setState({ sessions: p.sessions, lastUpdate: p.now })
    }
  }, 3000)
}
export function stopMockHeartbeat() {
  if (mockTimer) {
    clearInterval(mockTimer)
    mockTimer = null
  }
}
