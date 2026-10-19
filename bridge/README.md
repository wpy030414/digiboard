# DigiBoard Bridge

本地 sidecar，把 **Claude Code 会话状态**经 SSE 推给浏览器里的电子副屏。

副屏是纯静态前端（GitHub Pages），浏览器沙箱读不到本机文件。这个脚本负责读本机
Claude Code 的会话数据，聚合后经 Server-Sent Events 推给前端小组件。

## 快速开始

```bash
pnpm bridge
# [digiboard-bridge] SSE on http://127.0.0.1:4321/events
```

然后在副屏里添加「Claude 会话状态」小组件即可。前端默认连
`http://localhost:4321/events`；**连不上时小组件右上角显示 DISCONNECT，不展示任何演示数据**。

## 数据来源

- `~/.claude/sessions/<pid>.json` —— 实时状态：`status`（busy / idle / waiting）、
  `waitingFor`、`cwd`、`name`、`version`、`updatedAt`。
- `~/.claude/projects/<escaped-cwd>/<sessionId>.jsonl` —— 消息流尾部：`model`、
  token 用量（input/output/cacheRead）、当前工具名、最近一条用户 prompt。

安全约束：

- **只监听 `127.0.0.1`**（本机回环），不对外暴露——网络层永远不可达，只有本机浏览器能连。
- **绝不读取** `<pid>.<hex>.key` 鉴权令牌文件。
- 用 `process.kill(pid, 0)` 判活，跳过异常退出残留的陈旧会话文件。
- 只读 jsonl **尾部 256KB**（反向扫描），不全量解析大文件。

### CORS：默认放行任意来源

副屏可能部署在任意域名（GitHub Pages 的 `https://wpy030414.github.io/digiboard/`、
自建域如 `https://demo.xrl.im`），写死本机 Origin 白名单会让线上页面全部连不上。
考虑到 bridge 只存在于回环地址上，**能向它发起请求的前提就是「代码已在你的浏览器里运行」**，
此时 Origin 校验并无实质防护价值，故默认返回 `Access-Control-Allow-Origin: *`。

代价（已知并接受）：本机浏览器打开的任意网页都能 `fetch('http://127.0.0.1:4321/status')`
读到会话数据——cwd 绝对路径、会话名、最近一条 prompt 原文（截断 200 字）、模型与 token 用量。
**不含**鉴权令牌（`.key` 文件从不读取）。需要收紧时设 `DIGIBOARD_ORIGIN` 白名单：

```bash
DIGIBOARD_ORIGIN=https://demo.xrl.im pnpm bridge   # 单值
DIGIBOARD_ORIGIN="https://a.example,https://b.example" pnpm bridge  # 多值
```

启动日志会打印当前策略（`允许任意来源` / `仅允许 <list>`）。

另外，Chrome 的**私有网络访问**（PNA）会给「公网 https 页面 → 本机 http 服务」发预检；
bridge 在 `OPTIONS` 且请求带 `Access-Control-Request-Private-Network: true` 时回
`Access-Control-Allow-Private-Network: true`，否则线上页面会被拦在预检阶段。

## 配置（环境变量）

| 变量               | 默认        | 说明                                                  |
| ------------------ | ----------- | ----------------------------------------------------- |
| `HOST`             | `127.0.0.1` | 监听地址                                              |
| `PORT`             | `4321`      | 监听端口                                              |
| `POLL_MS`          | `1000`      | 轮询会话文件的间隔（毫秒）                            |
| `TAIL_BYTES`       | `262144`    | 读取 jsonl 尾部的字节数                               |
| `CLAUDE_DIR`       | `~/.claude` | Claude Code 数据目录                                  |
| `DIGIBOARD_ORIGIN` | 空          | CORS 白名单（逗号/空格分隔多值）；留空 = 放行任意来源 |

例：

```bash
PORT=5000 DIGIBOARD_ORIGIN=https://simu-digits.xrl.im pnpm bridge
```

## HTTP 接口

| 路径          | 说明                                                   |
| ------------- | ------------------------------------------------------ |
| `GET /events` | SSE 长连接，推送 `{ sessions, now }`（内容变化时才推） |
| `GET /status` | 一次性 JSON 快照（便于 `curl` 与测试）                 |
| `GET /health` | 同 `/status`                                           |

```bash
curl http://127.0.0.1:4321/status
```

## Payload 结构

```jsonc
{
  "sessions": [
    {
      "pid": 11680,
      "sessionId": "d98842cc-…",
      "name": "digiboard-subdisplay-upgrade",
      "cwd": "/Users/xrl/Documents/Repos/digiboard",
      "status": "busy", // busy | idle | waiting | unknown
      "waitingFor": "dialog open", // 仅 status==="waiting" 时出现，原样透传
      "version": "2.1.283",
      "model": "claude-opus-4-8",
      "tokens": { "input": 2187, "output": 470, "cacheRead": 229376, "cacheCreation": 0 },
      "currentTool": "Bash", // 仅 busy 时
      "lastMessage": { "role": "user", "text": "…", "at": 1790933820259 },
      "updatedAt": 1790930332959,
    },
  ],
  "now": 1790936456921,
}
```

排序：`busy` / `waiting` 优先，再按 `updatedAt` 新的在前。
