/**
 * Claude Code 会话状态小组件渲染器。
 *
 * 在 WidgetLayer 的局部坐标系内绘制一张状态卡：连接态徽标 + 会话列表
 * （状态灯、名称、model、token、cwd、最近消息）。数据来自 useClaudeStatusStore，
 * 由 useClaudeStatus（PlayerPage/EditorPage 挂载）驱动 SSE 或 mock。
 *
 * 尺寸用 container query 单位（cqh/cqw），使卡片自适应任意图层尺寸与视图缩放，
 * 无需关心绝对 scale —— 父容器 WidgetLayerView 已声明 container-type: size。
 */

import { useClaudeStatusStore } from './status-store'
import type { ClaudeSessionStatus, SessionStatus } from './types'
import type { WidgetRendererProps } from '@/engine/render/WidgetLayerView'

const STATUS_COLOR: Record<SessionStatus, string> = {
  busy: '#4ade80', // 忙碌=绿（正在干活）
  idle: '#facc15', // 空闲=黄
  waiting: '#fb923c', // 等待用户交互=橙（权限对话框/输入）
  unknown: '#71717a',
}

const STATUS_LABEL: Record<SessionStatus, string> = {
  busy: 'BUSY',
  idle: 'IDLE',
  waiting: 'WAIT',
  unknown: '----',
}

function shortenCwd(cwd: string, max = 28): string {
  if (cwd.length <= max) return cwd
  return `…${cwd.slice(-(max - 1))}`
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function timeAgo(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}

export function ClaudeStatusWidget({ layer }: WidgetRendererProps) {
  const sessions = useClaudeStatusStore((s) => s.sessions)
  const connection = useClaudeStatusStore((s) => s.connection)
  const lastUpdate = useClaudeStatusStore((s) => s.lastUpdate)
  const cfg = layer.config as {
    showTokens?: boolean
    showModel?: boolean
    showCwd?: boolean
  }
  const showTokens = cfg.showTokens !== false
  const showModel = cfg.showModel !== false
  const showCwd = cfg.showCwd !== false

  const accent = layer.color || '#ffaacc'
  const connLabel =
    connection === 'live'
      ? 'LIVE'
      : connection === 'mock'
        ? 'DEMO'
        : connection === 'connecting'
          ? '····'
          : 'ERR'

  return (
    <div
      data-testid="claude-status-widget"
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5cqh',
        padding: '4cqh 5cqw',
        borderRadius: '2cqh',
        background: 'rgba(0,0,0,0.55)',
        border: `1px solid ${accent}`,
        color: accent,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        overflow: 'hidden',
        fontSize: '9cqh', // 相对容器高度，随图层尺寸/缩放自适应
        lineHeight: 1.2,
      }}
    >
      {/* 头部：标题 + 连接态 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1cqw', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, letterSpacing: '0.05em' }}>CLAUDE CODE</span>
        <span style={{ flex: 1 }} />
        <span style={{ opacity: 0.7 }}>{connLabel}</span>
      </div>

      {/* 会话列表 */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5cqh',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {sessions.slice(0, 6).map((s) => (
          <SessionRow
            key={s.sessionId}
            s={s}
            now={lastUpdate}
            showTokens={showTokens}
            showModel={showModel}
            showCwd={showCwd}
            accent={accent}
          />
        ))}
        {sessions.length === 0 && <span style={{ opacity: 0.5 }}>无活跃会话</span>}
      </div>
    </div>
  )
}

function SessionRow({
  s,
  now,
  showTokens,
  showModel,
  showCwd,
  accent,
}: {
  s: ClaudeSessionStatus
  now: number
  showTokens: boolean
  showModel: boolean
  showCwd: boolean
  accent: string
}) {
  const color = STATUS_COLOR[s.status]
  const tokens = s.tokens ? s.tokens.input + s.tokens.output : 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5cqh', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1cqw', minWidth: 0 }}>
        {/* 状态灯：busy/waiting 呼吸 */}
        <span
          style={{
            width: '1.6cqh',
            height: '1.6cqh',
            borderRadius: '50%',
            background: color,
            flexShrink: 0,
            boxShadow:
              s.status === 'busy' || s.status === 'waiting' ? `0 0 1.5cqh ${color}` : 'none',
            animation:
              s.status === 'busy' || s.status === 'waiting'
                ? 'digiboard-pulse 1.2s ease-in-out infinite'
                : 'none',
          }}
        />
        <span
          style={{
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {s.name || s.sessionId.slice(0, 8)}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ color, fontSize: '0.85em', fontWeight: 700 }}>{STATUS_LABEL[s.status]}</span>
        {s.currentTool && s.status === 'busy' && (
          <span style={{ opacity: 0.8, fontSize: '0.85em' }}>{s.currentTool}</span>
        )}
        {s.status === 'waiting' && s.waitingFor && (
          <span style={{ color, opacity: 0.9, fontSize: '0.85em' }}>{s.waitingFor}</span>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          gap: '1.5cqw',
          fontSize: '0.85em',
          opacity: 0.75,
          minWidth: 0,
          whiteSpace: 'nowrap',
        }}
      >
        {showModel && s.model && <span>{s.model}</span>}
        {showTokens && tokens > 0 && <span>{fmtTokens(tokens)} tok</span>}
        {s.tokens?.cacheRead ? <span>↺{fmtTokens(s.tokens.cacheRead)}</span> : null}
        {showCwd && s.cwd && (
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{shortenCwd(s.cwd)}</span>
        )}
        <span style={{ marginLeft: 'auto', flexShrink: 0 }}>
          {timeAgo(s.updatedAt || now, now)}
        </span>
      </div>
      {s.lastMessage && (
        <div
          style={{
            fontSize: '0.8em',
            opacity: 0.6,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            borderTop: `1px solid ${accent}22`,
            paddingTop: '0.5cqh',
          }}
        >
          <span style={{ opacity: 0.7 }}>{s.lastMessage.role === 'user' ? '›' : '‹'} </span>
          {s.lastMessage.text}
        </div>
      )}
    </div>
  )
}
