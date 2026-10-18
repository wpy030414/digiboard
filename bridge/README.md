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

- **只监听 `127.0.0.1`**（本机回环），不对外暴露。
- **绝不读取** `<pid>.<hex>.key` 鉴权令牌文件。
- 用 `process.kill(pid, 0)` 判活，跳过异常退出残留的陈旧会话文件。
- 只读 jsonl **尾部 256KB**（反向扫描），不全量解析大文件。

## 配置（环境变量）

| 变量               | 默认        | 说明                                                         |
| ------------------ | ----------- | ------------------------------------------------------------ |
| `HOST`             | `127.0.0.1` | 监听地址                                                     |
| `PORT`             | `4321`      | 监听端口                                                     |
| `POLL_MS`          | `1000`      | 轮询会话文件的间隔（毫秒）                                   |
| `TAIL_BYTES`       | `262144`    | 读取 jsonl 尾部的字节数                                      |
| `CLAUDE_DIR`       | `~/.claude` | Claude Code 数据目录                                         |
| `DIGIBOARD_ORIGIN` | 空          | 收紧 CORS：只允许该确切 Origin（默认放行本机任意端口的副屏） |

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
