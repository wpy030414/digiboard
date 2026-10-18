/**
 * Claude Code 会话状态小组件渲染器。
 *
 * 在 WidgetLayer 的局部坐标系内绘制一张状态卡：连接态徽标 + 会话列表
 * （状态灯、名称、model、token、cwd、最近消息）。数据来自 useClaudeStatusStore，
 * 由 useClaudeStatus（App 根组件挂载）驱动 SSE；连线失败时只显示 DISCONNECT，
 * 不注入任何演示数据。
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
    connection === 'live' ? 'LIVE' : connection === 'connecting' ? '····' : 'DISCONNECT'

  return (
    <div
      data-testid="claude-status-widget"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5cqh',
        padding: '4cqh 5cqw',
        // 低分屏/CRT：直角 + 极弱描边 + 内发光，贴合点阵/霓虹的整体语言，
        // 避免现代 UI 卡片式的清晰圆角边框（外发光会被占位矩形裁掉，故用 inset）
        borderRadius: 0,
        background: '#000000',
        boxShadow: `inset 0 0 2.4cqh rgba(0,0,0,0.75), inset 0 0 2cqh ${accent}1f`,
        color: accent,
        // 像素字体 + 关闭抗锯齿/字体合成，模拟低分辨率屏幕的硬边观感
        fontFamily: "'Fusion Pixel 8px', ui-monospace, SFMono-Regular, Menlo, monospace",
        WebkitFontSmoothing: 'none',
        fontSynthesis: 'none',
        // 磷光辉光 + 轻微 RGB 分离（色差偏移随卡片高度缩放）
        textShadow: `0.12cqh 0 rgba(255,60,60,0.3), -0.12cqh 0 rgba(60,170,255,0.3), 0 0 0.55cqh ${accent}66`,
        overflow: 'hidden',
        fontSize: '9cqh', // 相对容器高度，随图层尺寸/缩放自适应
        lineHeight: 1.2,
      }}
    >
      {/* 头部：标题 + 连接态 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1cqw', flexShrink: 0 }}>
        <span
          style={{
            fontWeight: 700,
            letterSpacing: '0.05em',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          CLAUDE CODE
        </span>
        <span style={{ flex: 1 }} />
        <span
          style={{
            opacity: connection === 'live' ? 0.7 : 0.9,
            flexShrink: 0,
            whiteSpace: 'nowrap',
            fontSize: '0.8em',
            letterSpacing: '0.02em',
          }}
        >
          {connLabel}
        </span>
      </div>

      {/* CRT 叠层：扫描线 + 暗角 + 顶部玻璃反光；纯视觉，不接收指针事件 */}
      <div
        aria-hidden="true"
        data-testid="claude-crt-overlay"
        className="digiboard-crt-overlay"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          borderRadius: 'inherit',
          backgroundImage: [
            'repeating-linear-gradient(to bottom, rgba(0,0,0,0.5) 0, rgba(0,0,0,0.5) 0.45cqh, transparent 0.45cqh, transparent 1.1cqh)',
            'radial-gradient(ellipse at center, transparent 52%, rgba(0,0,0,0.45) 100%)',
            'linear-gradient(180deg, rgba(255,255,255,0.045), transparent 28%)',
          ].join(','),
        }}
      />

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

/**
 * 状态灯：一个圆形指示器。忙碌/等待时有两圈从圆心向外扩散到圆边的涟漪，
 * 空闲时只保留中心光点。动画在 `prefers-reduced-motion` 下退化为静态圆环。
 */
function StatusLight({ status, color }: { status: SessionStatus; color: string }) {
  const active = status === 'busy' || status === 'waiting'
  const duration = status === 'waiting' ? 2.2 : 1.8
  const ring = (delay: string) => (
    <span
      key={delay}
      aria-hidden="true"
      className="digiboard-status-ripple"
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        border: `0.22cqh solid ${color}`,
        background: `${color}12`,
        boxShadow: `0 0 0.5cqh ${color}55`,
        opacity: 0,
        willChange: 'transform, opacity',
        animation: active ? `digiboard-ripple ${duration}s ease-out infinite` : 'none',
        animationDelay: delay,
      }}
    />
  )
  return (
    <span
      data-testid="claude-status-light"
      style={{
        position: 'relative',
        // 直径 = 同行字号的 0.8em（≥66%），随卡片字号缩放
        width: '0.8em',
        height: '0.8em',
        flexShrink: 0,
        display: 'inline-block',
      }}
    >
      {active && (
        <>
          {ring('0s')}
          {ring(`${duration / 2}s`)}
        </>
      )}
      <span
        style={{
          position: 'absolute',
          inset: '30%',
          borderRadius: '50%',
          background: color,
          boxShadow: active ? `0 0 1.4cqh ${color}` : `0 0 0.5cqh ${color}66`,
        }}
      />
    </span>
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
        {/* 状态灯：圆心光点 + 不断向圆边扩散的涟漪（busy / waiting） */}
        <StatusLight status={s.status} color={color} />
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
