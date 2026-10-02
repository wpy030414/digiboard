import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ClaudeStatusWidget } from './ClaudeStatusWidget'
import { useClaudeStatusStore } from './status-store'
import { MOCK_SESSIONS, mockPayload } from './mock'
import { createWidgetLayer } from '@/engine/factories'
import type { WidgetLayer } from '@/engine/types'
import type { ClaudeSessionStatus } from './types'

/** 构造一个 claude-status 小组件图层，config 可覆盖。 */
function widgetLayer(config: Record<string, unknown> = {}): WidgetLayer {
  return createWidgetLayer({ w: 80, h: 60 }, 'claude-status', { config })
}

beforeEach(() => {
  // 每个测试重置 store 到 mock 演示态
  useClaudeStatusStore.setState({
    sessions: MOCK_SESSIONS,
    connection: 'mock',
    bridgeUrl: 'http://localhost:4321/events',
    lastUpdate: Date.now(),
  })
})

afterEach(() => {
  useClaudeStatusStore.setState({ connection: 'mock' })
})

describe('ClaudeStatusWidget — 基础渲染', () => {
  it('渲染标题与会话', () => {
    render(<ClaudeStatusWidget layer={widgetLayer()} scale={4} />)
    expect(screen.getByTestId('claude-status-widget')).toBeTruthy()
    expect(screen.getByText('CLAUDE CODE')).toBeTruthy()
    expect(screen.getByText('digiboard-04')).toBeTruthy()
    expect(screen.getByText('momoi-85')).toBeTruthy()
  })

  it('连接态徽标显示 DEMO（mock）', () => {
    render(<ClaudeStatusWidget layer={widgetLayer()} scale={4} />)
    expect(screen.getByText('DEMO')).toBeTruthy()
  })

  it('live 连接态显示 LIVE', () => {
    useClaudeStatusStore.setState({ connection: 'live' })
    render(<ClaudeStatusWidget layer={widgetLayer()} scale={4} />)
    expect(screen.getByText('LIVE')).toBeTruthy()
  })

  it('connecting 显示占位', () => {
    useClaudeStatusStore.setState({ connection: 'connecting' })
    render(<ClaudeStatusWidget layer={widgetLayer()} scale={4} />)
    expect(screen.getByText('····')).toBeTruthy()
  })

  it('无会话时显示空态', () => {
    useClaudeStatusStore.setState({ sessions: [] })
    render(<ClaudeStatusWidget layer={widgetLayer()} scale={4} />)
    expect(screen.getByText('无活跃会话')).toBeTruthy()
  })

  it('最多渲染 6 个会话（超出截断）', () => {
    const many: ClaudeSessionStatus[] = Array.from({ length: 9 }, (_, i) => ({
      pid: i,
      sessionId: `s-${i}`,
      name: `session-${i}`,
      cwd: '/tmp',
      status: 'idle',
      version: '1',
      updatedAt: Date.now(),
    }))
    useClaudeStatusStore.setState({ sessions: many })
    render(<ClaudeStatusWidget layer={widgetLayer()} scale={4} />)
    expect(screen.getByText('session-0')).toBeTruthy()
    expect(screen.getByText('session-5')).toBeTruthy()
    expect(screen.queryByText('session-6')).toBeNull()
  })
})

describe('ClaudeStatusWidget — 状态标识', () => {
  it('busy 会话显示 BUSY 标签', () => {
    render(<ClaudeStatusWidget layer={widgetLayer()} scale={4} />)
    expect(screen.getByText('BUSY')).toBeTruthy()
  })

  it('idle 会话显示 IDLE 标签', () => {
    render(<ClaudeStatusWidget layer={widgetLayer()} scale={4} />)
    expect(screen.getByText('IDLE')).toBeTruthy()
  })

  it('waiting 会话显示 WAIT 标签与 waitingFor 原因', () => {
    useClaudeStatusStore.setState({
      sessions: [
        {
          pid: 1,
          sessionId: 'w',
          name: 'waiting-one',
          cwd: '/tmp/x',
          status: 'waiting',
          waitingFor: 'dialog open',
          version: '1',
          updatedAt: Date.now(),
        },
      ],
    })
    render(<ClaudeStatusWidget layer={widgetLayer()} scale={4} />)
    expect(screen.getByText('WAIT')).toBeTruthy()
    expect(screen.getByText('dialog open')).toBeTruthy()
  })

  it('busy 会话显示当前工具名', () => {
    render(<ClaudeStatusWidget layer={widgetLayer()} scale={4} />)
    // MOCK_SESSIONS[0] 是 busy + currentTool='Edit'
    expect(screen.getByText('Edit')).toBeTruthy()
  })

  it('idle 会话不显示 currentTool（即便字段存在）', () => {
    useClaudeStatusStore.setState({
      sessions: [
        {
          pid: 1,
          sessionId: 'i',
          name: 'idle-one',
          cwd: '/tmp',
          status: 'idle',
          currentTool: 'Ghost',
          version: '1',
          updatedAt: Date.now(),
        },
      ],
    })
    render(<ClaudeStatusWidget layer={widgetLayer()} scale={4} />)
    expect(screen.queryByText('Ghost')).toBeNull()
  })
})

describe('ClaudeStatusWidget — model / token / cwd / 消息', () => {
  it('显示 model 名', () => {
    render(<ClaudeStatusWidget layer={widgetLayer()} scale={4} />)
    expect(screen.getByText('claude-opus-4-8')).toBeTruthy()
  })

  it('token 用量格式化（k）', () => {
    render(<ClaudeStatusWidget layer={widgetLayer()} scale={4} />)
    // 5772 + 655 = 6427 => "6.4k tok"
    expect(screen.getByText('6.4k tok')).toBeTruthy()
  })

  it('cacheRead 显示 ↺ 前缀', () => {
    render(<ClaudeStatusWidget layer={widgetLayer()} scale={4} />)
    expect(screen.getByText('↺26.6k')).toBeTruthy()
  })

  it('显示最近消息文本', () => {
    render(<ClaudeStatusWidget layer={widgetLayer()} scale={4} />)
    expect(screen.getByText('把点阵升级到电子副屏')).toBeTruthy()
    expect(screen.getByText('排练表已经排好啦～')).toBeTruthy()
  })

  it('显示 cwd（缩短）', () => {
    render(<ClaudeStatusWidget layer={widgetLayer()} scale={4} />)
    // MOCK cwd '~/Documents/Repos/digiboard' 长度<=28 原样显示
    expect(screen.getByText('~/Documents/Repos/digiboard')).toBeTruthy()
  })
})

describe('ClaudeStatusWidget — config 开关', () => {
  it('showTokens=false 隐藏 token', () => {
    render(<ClaudeStatusWidget layer={widgetLayer({ showTokens: false })} scale={4} />)
    expect(screen.queryByText('6.4k tok')).toBeNull()
  })

  it('showModel=false 隐藏 model', () => {
    render(<ClaudeStatusWidget layer={widgetLayer({ showModel: false })} scale={4} />)
    expect(screen.queryByText('claude-opus-4-8')).toBeNull()
  })

  it('showCwd=false 隐藏 cwd', () => {
    render(<ClaudeStatusWidget layer={widgetLayer({ showCwd: false })} scale={4} />)
    expect(screen.queryByText('~/Documents/Repos/digiboard')).toBeNull()
  })

  it('默认（无 config）三项都显示', () => {
    render(<ClaudeStatusWidget layer={widgetLayer()} scale={4} />)
    expect(screen.getByText('claude-opus-4-8')).toBeTruthy()
    expect(screen.getByText('6.4k tok')).toBeTruthy()
    expect(screen.getByText('~/Documents/Repos/digiboard')).toBeTruthy()
  })
})

describe('ClaudeStatusWidget — store 响应性', () => {
  it('store 更新后重渲染新数据', () => {
    render(<ClaudeStatusWidget layer={widgetLayer()} scale={4} />)
    expect(screen.queryByText('brand-new')).toBeNull()
    act(() => {
      useClaudeStatusStore.setState({
        sessions: [
          {
            pid: 9,
            sessionId: 'n',
            name: 'brand-new',
            cwd: '/tmp',
            status: 'busy',
            version: '1',
            updatedAt: Date.now(),
          },
        ],
      })
    })
    expect(screen.getByText('brand-new')).toBeTruthy()
    expect(screen.queryByText('digiboard-04')).toBeNull()
  })

  it('setPayload 切换到 live 并写入会话', () => {
    render(<ClaudeStatusWidget layer={widgetLayer()} scale={4} />)
    act(() => {
      useClaudeStatusStore.getState().setPayload({
        sessions: [
          {
            pid: 7,
            sessionId: 'live-1',
            name: 'live-session',
            cwd: '/tmp',
            status: 'idle',
            version: '2',
            updatedAt: Date.now(),
          },
        ],
        now: Date.now(),
      })
    })
    expect(screen.getByText('LIVE')).toBeTruthy()
    expect(screen.getByText('live-session')).toBeTruthy()
  })
})

describe('mock 数据完整性', () => {
  it('mockPayload 含两个会话且字段完整', () => {
    const p = mockPayload()
    expect(p.sessions.length).toBe(2)
    expect(p.now).toBeTypeOf('number')
    for (const s of p.sessions) {
      expect(s.sessionId).toBeTruthy()
      expect(['busy', 'idle', 'waiting', 'unknown']).toContain(s.status)
      expect(s.updatedAt).toBeTypeOf('number')
    }
  })
})
