/**
 * Claude Code 会话状态数据模型。
 *
 * 数据来源：本机 `~/.claude/sessions/<pid>.json`（实时 status/cwd/name/version）
 * 与 `~/.claude/projects/<escaped-cwd>/<sessionId>.jsonl`（model、token 用量、
 * 最近消息、当前工具）。浏览器沙箱读不到本地文件，故由本地 bridge 脚本聚合，
 * 经 SSE 推送给前端。无 bridge 时前端不注入任何演示数据，只显示 DISCONNECT。
 */

/** 会话活跃状态。waiting = 被需要用户交互的东西阻塞（权限对话框/输入等）。 */
export type SessionStatus = 'busy' | 'idle' | 'waiting' | 'unknown'

/** token 用量。 */
export interface TokenUsage {
  input: number
  output: number
  cacheRead?: number
  cacheCreation?: number
}

/** 最近一条消息摘要。 */
export interface LastMessage {
  role: 'user' | 'assistant'
  text: string
  at: number
}

/** 单个 Claude Code 会话的状态快照。 */
export interface ClaudeSessionStatus {
  pid: number
  sessionId: string
  name: string
  cwd: string
  status: SessionStatus
  version: string
  model?: string
  tokens?: TokenUsage
  cost?: number
  lastMessage?: LastMessage
  /** 当前正在执行的工具名（busy 时有意义）。 */
  currentTool?: string
  /** status==='waiting' 时的阻塞原因（如 "dialog open" / "input needed"），原样透传。 */
  waitingFor?: string
  /** 该快照更新时间（epoch ms）。 */
  updatedAt: number
}

/** 桥接推送的完整状态：所有活跃会话。 */
export interface ClaudeStatusPayload {
  sessions: ClaudeSessionStatus[]
  /** bridge 自报的时间戳。 */
  now: number
}

/** SSE 连接状态。 */
export type ConnectionStatus = 'connecting' | 'live' | 'error'
