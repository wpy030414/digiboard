/**
 * 内置演示数据：无本地 bridge 连接时使用，保证纯静态部署（GitHub Pages）
 * 下小组件仍有内容展示，不至于空白。
 *
 * mock 会周期性在 busy/idle 间切换，模拟真实会话的活动感。
 */

import type { ClaudeStatusPayload, ClaudeSessionStatus } from './types'

const now = () => Date.now()

function session(partial: Partial<ClaudeSessionStatus>): ClaudeSessionStatus {
  return {
    pid: 0,
    sessionId: 'mock',
    name: '演示会话',
    cwd: '~/demo',
    status: 'idle',
    version: '0.0.0',
    updatedAt: now(),
    ...partial,
  }
}

export const MOCK_SESSIONS: ClaudeSessionStatus[] = [
  session({
    pid: 42001,
    sessionId: 'mock-a',
    name: 'digiboard-04',
    cwd: '~/Documents/Repos/digiboard',
    status: 'busy',
    version: '2.1.283',
    model: 'claude-opus-4-8',
    currentTool: 'Edit',
    tokens: { input: 5772, output: 655, cacheRead: 26624 },
    lastMessage: { role: 'user', text: '把点阵升级到电子副屏', at: now() - 12000 },
  }),
  session({
    pid: 42002,
    sessionId: 'mock-b',
    name: 'momoi-85',
    cwd: '~/Documents/Repos/momoi',
    status: 'idle',
    version: '2.1.283',
    model: 'claude-sonnet-4-6',
    tokens: { input: 1203, output: 88 },
    lastMessage: { role: 'assistant', text: '排练表已经排好啦～', at: now() - 90000 },
  }),
]

export function mockPayload(): ClaudeStatusPayload {
  return { sessions: MOCK_SESSIONS, now: now() }
}

/** 让 mock 会话在 busy/idle 间翻转，产生活动感（每次调用推进一个会话）。 */
let tick = 0
export function nextMockPayload(): ClaudeStatusPayload {
  tick++
  const sessions = MOCK_SESSIONS.map((s, i) => {
    // 每 3 tick 翻转一次第一个会话状态
    const flip = tick % 3 === 0 && i === 0
    return {
      ...s,
      status: flip ? (s.status === 'busy' ? 'idle' : 'busy') : s.status,
      updatedAt: now(),
    }
  })
  return { sessions, now: now() }
}
