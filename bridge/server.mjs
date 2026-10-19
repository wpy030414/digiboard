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
 *   - CORS：**默认放行任意来源**——副屏可能部署在任意域名（GitHub Pages、自建 CDN），
 *     而 bridge 永远只在本机回环上，能连到它的前提是「攻击者已能在你的浏览器里跑代码」，
 *     此时限制 Origin 并无实质防护价值。需要收紧时用 DIGIBOARD_ORIGIN 指定白名单。
 *     代价：本机浏览器打开的任意网页都能读到会话 cwd/prompt/模型/token，见 bridge/README.md。
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

const SESSIONS_DIR = path.join(CLAUDE_DIR, 'sessions')
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects')

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

/** 去掉 Origin 末尾斜杠，便于白名单全等比较。 */
function trimOrigin(origin) {
  return String(origin ?? '').replace(/\/+$/, '')
}

/**
 * 解析 DIGIBOARD_ORIGIN 白名单（逗号或空格分隔，可多值）。
 * 每次读 env 而非模块级常量：便于测试改写，也便于运行时注入。
 * @returns {string[]} 空数组 = 不设限（默认）
 */
function allowedOrigins() {
  return (process.env.DIGIBOARD_ORIGIN || '')
    .split(/[,\s]+/)
    .map(trimOrigin)
    .filter(Boolean)
}

/**
 * 是否允许该 Origin 跨域读取。
 * 默认放行**任意** Origin；仅当设置了 DIGIBOARD_ORIGIN 白名单时才收紧。
 */
function originAllowed(origin) {
  if (!origin) return true // 非浏览器请求（curl 等）无 Origin
  const list = allowedOrigins()
  if (list.length === 0) return true
  return list.includes(trimOrigin(origin))
}

/**
 * 计算 CORS 响应头（纯函数，便于测试）。
 * - 无白名单：`Access-Control-Allow-Origin: *`。前端用 `new EventSource(url)`（不带凭据，
 *   `withCredentials` 为 false），故通配符即可满足浏览器要求，也不必回显 Origin。
 *   注意：一旦前端改为携带凭据，浏览器会拒绝通配符，届时必须改回回显 Origin + `Vary`。
 * - 有白名单：回显命中的确切 Origin + `Vary: Origin`（避免缓存串源）。
 * - privateNetwork：Chrome 私有网络访问（公网 https 页 → 本机 http）要求的预检放行头。
 * @returns {Record<string, string>}
 */
function corsHeaders(origin, { privateNetwork = false } = {}) {
  const headers = {
    'Access-Control-Allow-Headers': 'Content-Type, Cache-Control',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  }
  const list = allowedOrigins()
  if (list.length === 0) {
    headers['Access-Control-Allow-Origin'] = '*'
  } else if (origin && originAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = trimOrigin(origin)
    headers['Vary'] = 'Origin'
  }
  if (privateNetwork) headers['Access-Control-Allow-Private-Network'] = 'true'
  return headers
}

/** 写 CORS 头。预检时若浏览器声明了私有网络访问，一并放行。 */
function setCORS(req, res, { preflight = false } = {}) {
  const requested = req.headers['access-control-request-private-network'] === 'true'
  const headers = corsHeaders(req.headers.origin, { privateNetwork: preflight && requested })
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
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
    setCORS(req, res, { preflight: true })
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
  allowedOrigins,
  corsHeaders,
  trimOrigin,
  parseTailFromText,
}

// 仅当作为入口直接运行（node bridge/server.mjs）时才监听端口；被 import 时不启动。
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  server.listen(PORT, HOST, () => {
    const list = allowedOrigins()
    console.log(`[digiboard-bridge] SSE on http://${HOST}:${PORT}/events`)
    console.log(`[digiboard-bridge] watching ${SESSIONS_DIR}`)
    console.log(`[digiboard-bridge] snapshot: http://${HOST}:${PORT}/status`)
    console.log(
      list.length === 0
        ? '[digiboard-bridge] CORS: 允许任意来源（设 DIGIBOARD_ORIGIN 可收紧到白名单）'
        : `[digiboard-bridge] CORS: 仅允许 ${list.join(', ')}`,
    )
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
