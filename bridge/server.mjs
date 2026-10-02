/**
 * DigiBoard Bridge —— 本地 sidecar，把 Claude Code 会话状态经 SSE 推给浏览器副屏。
 *
 * 为什么需要它：副屏是纯静态前端（GitHub Pages），浏览器沙箱读不到本机文件。
 * 本脚本读取 `~/.claude/sessions/*.json`（实时状态）与
 * `~/.claude/projects/<escaped-cwd>/<sessionId>.jsonl`（消息流尾部），
 * 聚合成 ClaudeStatusPayload，经 Server-Sent Events 推送。
 *
 * 用法：
 *   pnpm bridge                 # 默认 127.0.0.1:4321
 *   PORT=5000 pnpm bridge       # 自定义端口
 *   DIGIBOARD_ORIGIN=https://digiboard.example pnpm bridge  # 限定 CORS 源
 *
 * 安全：
 *   - 只监听 127.0.0.1（本机回环），默认不对外。
 *   - 绝不读取 `<pid>.<hex>.key` 鉴权令牌文件。
 *   - CORS：默认允许 localhost/127.0.0.1 任意端口的副屏；可用 DIGIBOARD_ORIGIN 收紧。
 */

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'

const HOST = process.env.HOST || '127.0.0.1'
const PORT = Number(process.env.PORT || 4321)
const POLL_MS = Number(process.env.POLL_MS || 1000)
const TAIL_BYTES = Number(process.env.TAIL_BYTES || 256 * 1024)
const CLAUDE_DIR = process.env.CLAUDE_DIR || path.join(os.homedir(), '.claude')
const ALLOWED_ORIGIN = process.env.DIGIBOARD_ORIGIN || null

const SESSIONS_DIR = path.join(CLAUDE_DIR, 'sessions')
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects')

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

/** 是否允许该 Origin 跨域读取。默认放行本机任意端口的副屏。 */
function originAllowed(origin) {
  if (!origin) return true // 非浏览器请求（curl 等）无 Origin
  if (ALLOWED_ORIGIN) return origin === ALLOWED_ORIGIN
  try {
    const u = new URL(origin)
    const hostOk = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    return hostOk && (u.protocol === 'http:' || u.protocol === 'https:')
  } catch {
    return false
  }
}

function setCORS(req, res) {
  const origin = req.headers.origin
  if (origin && originAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cache-Control')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
}

// ---------------------------------------------------------------------------
// 会话枚举 + 判活
// ---------------------------------------------------------------------------

/** 进程是否存活（EPERM 也算活：进程在，但无权发信号）。 */
function pidAlive(pid) {
  if (typeof pid !== 'number' || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}

/** cwd → projects 目录名（有损转义：非字母数字一律 '-'）。 */
function escapeCwd(cwd) {
  return String(cwd).replace(/[^A-Za-z0-9]/g, '-')
}

/**
 * 定位会话 jsonl：优先精确转义路径，兜底 glob（sessionId 全局唯一）。
 * @returns {string|null}
 */
function locateJsonl(cwd, sessionId) {
  if (!sessionId) return null
  const primary = path.join(PROJECTS_DIR, escapeCwd(cwd), `${sessionId}.jsonl`)
  if (fs.existsSync(primary)) return primary
  // 兜底：遍历 projects/*，匹配 <sessionId>.jsonl
  try {
    for (const dir of fs.readdirSync(PROJECTS_DIR)) {
      const candidate = path.join(PROJECTS_DIR, dir, `${sessionId}.jsonl`)
      if (fs.existsSync(candidate)) return candidate
    }
  } catch {
    /* projects 目录不存在则放弃 */
  }
  return null
}

// ---------------------------------------------------------------------------
// jsonl 尾部解析（不全量读大文件）
// ---------------------------------------------------------------------------

/**
 * 从 jsonl 文本（尾部片段）反向扫描出最近信息。纯函数，便于测试。
 * @param {string} text 已按行分割前的原始文本（尾部 N 字节）
 * @param {boolean} headTruncated 首行是否可能被截断（读的是文件尾部而非全量）
 * @returns {{model?:string, usage?:object, lastTool?:string, lastPrompt?:string, lastAssistantText?:string, ts?:string}}
 */
function parseTailFromText(text, headTruncated = false) {
  const out = {}
  if (headTruncated) {
    const firstNl = text.indexOf('\n')
    if (firstNl >= 0) text = text.slice(firstNl + 1)
  }
  const lines = text.split('\n').filter(Boolean)

  for (let i = lines.length - 1; i >= 0; i--) {
    let o
    try {
      o = JSON.parse(lines[i])
    } catch {
      continue
    }
    const t = o.type

    if (t === 'last-prompt' && out.lastPrompt === undefined) {
      out.lastPrompt = typeof o.lastPrompt === 'string' ? o.lastPrompt : undefined
    }

    if (t === 'assistant' && out.model === undefined) {
      const m = o.message || {}
      out.model = m.model
      out.ts = o.timestamp
      const u = m.usage || {}
      out.usage = {
        input: u.input_tokens ?? 0,
        output: u.output_tokens ?? 0,
        cacheRead: u.cache_read_input_tokens ?? 0,
        cacheCreation: u.cache_creation_input_tokens ?? 0,
      }
      const content = Array.isArray(m.content) ? m.content : []
      for (const b of content) {
        if (b && b.type === 'tool_use' && out.lastTool === undefined) out.lastTool = b.name
        if (b && b.type === 'text' && out.lastAssistantText === undefined)
          out.lastAssistantText = b.text
      }
    }

    if (out.model !== undefined && out.lastPrompt !== undefined) break
  }
  return out
}

/**
 * 读取 jsonl 尾部 N 字节，反向扫描出最近信息。
 * @returns {{model?:string, usage?:object, lastTool?:string, lastPrompt?:string, lastAssistantText?:string, ts?:string}}
 */
function parseJsonlTail(filePath) {
  let fd = null
  try {
    const size = fs.statSync(filePath).size
    const n = Math.min(TAIL_BYTES, size)
    const buf = Buffer.alloc(n)
    fd = fs.openSync(filePath, 'r')
    fs.readSync(fd, buf, 0, n, size - n)
    return parseTailFromText(buf.toString('utf8'), size > n)
  } catch (e) {
    return { __error: String(e && e.message ? e.message : e) }
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd)
      } catch {
        /* 忽略 */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 聚合：sessions/*.json + jsonl 尾部 → ClaudeSessionStatus[]
// ---------------------------------------------------------------------------

function collectSessions() {
  const sessions = []
  let files
  try {
    files = fs.readdirSync(SESSIONS_DIR)
  } catch {
    return sessions // 无 sessions 目录 => 空
  }

  for (const f of files) {
    // 只读 <pid>.json，绝不碰 <pid>.<hex>.key
    if (!/^\d+\.json$/.test(f)) continue
    let d
    try {
      d = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8'))
    } catch {
      continue
    }
    if (!pidAlive(d.pid)) continue // 陈旧残留，跳过

    const jsonlPath = locateJsonl(d.cwd, d.sessionId)
    const tail = jsonlPath ? parseJsonlTail(jsonlPath) : {}

    const lastPromptText = tail.lastPrompt
    const status = normalizeStatus(d.status)

    sessions.push({
      pid: d.pid,
      sessionId: d.sessionId,
      name: d.name || shortSession(d.sessionId),
      cwd: d.cwd || '',
      status,
      waitingFor: status === 'waiting' ? d.waitingFor || undefined : undefined,
      version: d.version || '',
      model: tail.model,
      tokens: tail.usage,
      currentTool: status === 'busy' ? tail.lastTool : undefined,
      lastMessage: lastPromptText
        ? {
            role: 'user',
            text: lastPromptText.slice(0, 200),
            at: Date.parse(tail.ts) || Date.now(),
          }
        : tail.lastAssistantText
          ? {
              role: 'assistant',
              text: tail.lastAssistantText.slice(0, 200),
              at: Date.parse(tail.ts) || Date.now(),
            }
          : undefined,
      updatedAt: d.updatedAt || d.statusUpdatedAt || Date.now(),
    })
  }

  // busy/waiting 优先、再按更新时间新的在前
  const rank = { busy: 0, waiting: 1, idle: 2, unknown: 3 }
  sessions.sort((a, b) => rank[a.status] - rank[b.status] || b.updatedAt - a.updatedAt)
  return sessions
}

/** 把文件里的 status 归一到前端 schema；未知值透传为原样但归到 unknown 之外保留。 */
function normalizeStatus(s) {
  if (s === 'busy' || s === 'idle' || s === 'waiting') return s
  return 'unknown'
}

function shortSession(id) {
  return typeof id === 'string' ? id.slice(0, 8) : 'session'
}

// ---------------------------------------------------------------------------
// SSE 服务
// ---------------------------------------------------------------------------

/** @type {Set<http.ServerResponse>} */
const clients = new Set()
let lastPayloadJson = ''

function broadcast() {
  const payload = { sessions: collectSessions(), now: Date.now() }
  const json = JSON.stringify(payload)
  // 仅在内容变化时推送（now 每次不同，故比较去掉 now 的部分）
  const stable = JSON.stringify(payload.sessions)
  if (stable === lastPayloadJson) return
  lastPayloadJson = stable
  for (const res of clients) {
    try {
      res.write(`data: ${json}\n\n`)
    } catch {
      clients.delete(res)
    }
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

  if (req.method === 'OPTIONS') {
    setCORS(req, res)
    res.writeHead(204)
    res.end()
    return
  }

  // 健康检查 / 一次性快照（非 SSE，便于 curl 与测试）
  if (url.pathname === '/' || url.pathname === '/health' || url.pathname === '/status') {
    setCORS(req, res)
    const payload = { sessions: collectSessions(), now: Date.now() }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(payload))
    return
  }

  if (url.pathname === '/events') {
    setCORS(req, res)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    // 立即推一帧，前端好判定 live
    const payload = { sessions: collectSessions(), now: Date.now() }
    res.write(`data: ${JSON.stringify(payload)}\n\n`)
    clients.add(res)
    req.on('close', () => clients.delete(res))
    return
  }

  setCORS(req, res)
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('Not Found')
})

// 导出纯函数供测试（node --test 直接 import）。
export {
  collectSessions,
  parseJsonlTail,
  escapeCwd,
  locateJsonl,
  pidAlive,
  normalizeStatus,
  originAllowed,
  parseTailFromText,
}

// 仅当作为入口直接运行（node bridge/server.mjs）时才监听端口；被 import 时不启动。
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  server.listen(PORT, HOST, () => {
    console.log(`[digiboard-bridge] SSE on http://${HOST}:${PORT}/events`)
    console.log(`[digiboard-bridge] watching ${SESSIONS_DIR}`)
    console.log(`[digiboard-bridge] snapshot: http://${HOST}:${PORT}/status`)
    broadcast()
    const timer = setInterval(broadcast, POLL_MS)
    const shutdown = () => {
      clearInterval(timer)
      for (const res of clients) {
        try {
          res.end()
        } catch {
          /* 忽略 */
        }
      }
      server.close(() => process.exit(0))
      setTimeout(() => process.exit(0), 500).unref()
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  })
}

export { server }
