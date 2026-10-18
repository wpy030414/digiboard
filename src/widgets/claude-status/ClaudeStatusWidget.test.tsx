import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ClaudeStatusWidget } from './ClaudeStatusWidget'
import { useClaudeStatusStore } from './status-store'
import { createWidgetLayer } from '@/engine/factories'
import type { WidgetLayer } from '@/engine/types'
import type { ClaudeSessionStatus } from './types'

/** 构造一个 claude-status 小组件图层，config 可覆盖。 */
function widgetLayer(config: Record<string, unknown> = {}): WidgetLayer {
  return createWidgetLayer({ w: 80, h: 60 }, 'claude-status', { config })
}

/** 测试夹具：模拟一份 bridge 推送的真实 payload（仅存在于测试，不进入应用运行态）。 */
const FIXTURE_SESSIONS: ClaudeSessionStatus[] = [
  {
    pid: 42001,
    sessionId: 'fixture-a',
    name: 'digiboard-04',
    cwd: '~/Documents/Repos/digiboard',
    status: 'busy',
    version: '2.1.283',
    model: 'claude-opus-4-8',
    currentTool: 'Edit',
    tokens: { input: 5772, output: 655, cacheRead: 26624 },
    lastMessage: { role: 'user', text: '把点阵升级到电子副屏', at: Date.now() - 12000 },
    updatedAt: Date.now(),
  },
  {
    pid: 42002,
    sessionId: 'fixture-b',
    name: 'fixture-idle',
    cwd: '~/Documents/Repos/demo',
    status: 'idle',
    version: '2.1.283',
    model: 'claude-sonnet-4-6',
    tokens: { input: 1203, output: 88 },
    lastMessage: { role: 'assistant', text: '排练表已经排好啦～', at: Date.now() - 90000 },
    updatedAt: Date.now(),
  },
]

beforeEach(() => {
  // 每个测试重置 store 到「已连接 bridge」态
  useClaudeStatusStore.setState({
    sessions: FIXTURE_SESSIONS,
    connection: 'live',
    bridgeUrl: 'http://localhost:4321/events',
    lastUpdate: Date.now(),
  })
})

afterEach(() => {
  useClaudeStatusStore.setState({ sessions: [], connection: 'connecting' })
})

describe('ClaudeStatusWidget — 基础渲染', () => {
  it('渲染标题与会话', () => {
    render(<ClaudeStatusWidget layer={widgetLayer()} scale={4} />)
    expect(screen.getByTestId('claude-status-widget')).toBeTruthy()
    expect(screen.getByText('CLAUDE CODE')).toBeTruthy()
    expect(screen.getByText('digiboard-04')).toBeTruthy()
    expect(screen.getByText('fixture-idle')).toBeTruthy()
  })

  it('断连时显示 DISCONNECT 且不渲染任何会话', () => {
    useClaudeStatusStore.setState({ sessions: [], connection: 'error' })
    render(<ClaudeStatusWidget layer={widgetLayer()} scale={4} />)
    expect(screen.getByText('DISCONNECT')).toBeTruthy()
    expect(screen.queryByText('digiboard-04')).toBeNull()
    expect(screen.queryByText('fixture-idle')).toBeNull()
    expect(screen.queryByText('DEMO')).toBeNull()
  })

  it('渲染 CRT 扫描线叠加层且不拦截指针', () => {
    render(<ClaudeStatusWidget layer={widgetLayer()} scale={4} />)
    const overlay = screen.getByTestId('claude-crt-overlay')
    expect(overlay.getAttribute('aria-hidden')).toBe('true')
    expect(overlay.className).toContain('digiboard-crt-overlay')
    expect(overlay.style.pointerEvents).toBe('none')
  })

  it('主题色应用于卡片文字与 CRT 辉光，且不再有边框', () => {
    const layer = widgetLayer()
    layer.color = '#00ffcc'
    render(<ClaudeStatusWidget layer={layer} scale={4} />)
    const root = screen.getByTestId('claude-status-widget')
    expect(root.style.color).toBe('rgb(0, 255, 204)')
    expect(root.style.textShadow).toContain('#00ffcc')
    expect(root.style.border).toBe('')
  })

  it('live 连接态显示 LIVE', () => {
    render(<ClaudeStatusWidget layer={widgetLayer()} scale={4} />)
    expect(screen.getByText('LIVE')).toBeTruthy()
    expect(screen.queryByText('DISCONNECT')).toBeNull()
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
  it('busy 状态灯渲染两圈向圆边扩散的涟漪', () => {
    useClaudeStatusStore.setState({ sessions: [FIXTURE_SESSIONS[0]!] })
    render(<ClaudeStatusWidget layer={widgetLayer()} scale={4} />)
    const light = screen.getByTestId('claude-status-light')
    expect(light.querySelectorAll('.digiboard-status-ripple')).toHaveLength(2)
    // 直径 = 同行字号的 0.8em（满足 ≥66% 的要求）
    expect(light.style.width).toBe('0.8em')
    expect(light.style.height).toBe('0.8em')
  })

  it('idle 状态灯只保留中心光点', () => {
    useClaudeStatusStore.setState({ sessions: [FIXTURE_SESSIONS[1]!] })
    render(<ClaudeStatusWidget layer={widgetLayer()} scale={4} />)
    const light = screen.getByTestId('claude-status-light')
    expect(light.querySelectorAll('.digiboard-status-ripple')).toHaveLength(0)
  })

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
    // FIXTURE_SESSIONS[0] 是 busy + currentTool='Edit'
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
    // 夹具 cwd '~/Documents/Repos/digiboard' 长度<=28 原样显示
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
    useClaudeStatusStore.setState({ sessions: [], connection: 'connecting' })
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

  it('clearSessions 清空会话（断连时由 hook 调用）', () => {
    render(<ClaudeStatusWidget layer={widgetLayer()} scale={4} />)
    expect(screen.getByText('digiboard-04')).toBeTruthy()
    act(() => {
      useClaudeStatusStore.getState().setConnection('error')
      useClaudeStatusStore.getState().clearSessions()
    })
    expect(screen.queryByText('digiboard-04')).toBeNull()
    expect(screen.getByText('DISCONNECT')).toBeTruthy()
  })
})
