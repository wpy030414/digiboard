/**
 * Claude Code 会话状态 store（zustand）。
 *
 * 单例持有最新状态与连接态。useClaudeStatus 驱动它：
 *  - 尝试连 bridge SSE（默认 http://localhost:4321/events）
 *  - 连上 => connection='live'，用真实数据
 *  - 连接失败/超时 => connection='error'，清空会话（不注入任何演示数据）
 * 小组件（WidgetLayerView 注册的渲染器）订阅本 store 取数。
 */

import { create } from 'zustand'
import type { ClaudeSessionStatus, ClaudeStatusPayload, ConnectionStatus } from './types'

interface ClaudeStatusState {
  sessions: ClaudeSessionStatus[]
  connection: ConnectionStatus
  bridgeUrl: string
  lastUpdate: number

  setPayload: (p: ClaudeStatusPayload) => void
  setConnection: (c: ConnectionStatus) => void
  setBridgeUrl: (url: string) => void
  /** 清空会话（断连时调用），避免展示过期数据。 */
  clearSessions: () => void
}

export const useClaudeStatusStore = create<ClaudeStatusState>((set) => ({
  sessions: [],
  connection: 'connecting',
  bridgeUrl: 'http://localhost:4321/events',
  lastUpdate: Date.now(),

  setPayload: (p) =>
    set({ sessions: p.sessions, lastUpdate: p.now || Date.now(), connection: 'live' }),
  setConnection: (c) => set({ connection: c }),
  setBridgeUrl: (url) => set({ bridgeUrl: url }),
  clearSessions: () => set({ sessions: [] }),
}))
