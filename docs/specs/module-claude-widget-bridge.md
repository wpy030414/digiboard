# Spec — Claude 会话小组件与本地桥接

对应模块：`src/widgets/claude-status/`、`bridge/`

## 要构建什么

- 目标：在副屏上实时展示本机 Claude Code 各会话的状态（busy/idle/waiting、模型、token 用量、当前工具、最近消息）。纯静态前端读不到本机文件，故由本地 sidecar 经 SSE 桥接；**无桥接时不注入任何演示数据**，右上角显示 DISCONNECT。

## 行为

- 预期行为：
  - 小组件按 `WidgetKind` 经注册表分发渲染；Claude 会话卡在 container-query 单位下自适应任意图层尺寸与视图缩放（字号随卡片高度走，与绝对 scale 无关）。
  - 视觉：纯黑卡片 + 自托管 8px 等宽像素字体（Fusion Pixel 8px，简体中文，SIL OFL 1.1），关闭字体抗锯齿与字体合成，模拟低分辨率屏幕；PNG 导出前按需抓取同一份 woff2 内嵌进 SVG，保证导出字体一致。
  - CRT 叠层：绝对定位的扫描线 + 暗角 + 顶部玻璃反光，叠加磷光辉光与轻微 RGB 色差文字阴影；5s 极缓亮度呼吸，`prefers-reduced-motion` 下停用。叠层不接收指针事件且完全落在占位矩形内。卡片无描边，靠内阴影与扫描线界定屏幕边界。
  - 状态灯：直径 = 同行字号的 0.8em（满足 ≥66%），圆心光点 + 两圈从圆心扩散到圆边的涟漪（busy 1.8s / waiting 2.2s，两圈相位相差半个周期）；空闲只保留光点，`prefers-reduced-motion` 下退化为静态圆环。
  - 每个会话一行：状态灯（busy/waiting 呼吸动画）、会话名、状态标签、当前工具或 waitingFor、模型、token（k/M 格式）、↺cacheRead、缩短的 cwd、相对时间；最多显示 6 个会话。
  - config 开关控制 token/model/cwd 显隐（`showTokens/showModel/showCwd`，默认全显）。
  - 外观可调：主题色取图层 `color`（边框、标题与信息文字；状态灯保持语义色），尺寸取 `width/height`（整数格、≥1），字号随卡片高度用 container-query 等比缩放。
  - 连接生命周期：mount→connecting→(收到首帧)live /(3s 超时或 onerror)error；error 态清空会话、右上角显示 DISCONNECT，不展示任何演示数据；live 后断连同样立即置为 DISCONNECT，EventSource 自动重连成功后恢复；unmount 关闭连接。
  - bridge：轮询（1s）枚举判活会话，内容变化时才 SSE 推送（省带宽）；`/status` 提供一次性 JSON 快照供 curl/测试。

## 输入 / 输出

- 输入（bridge）：`~/.claude/sessions/<pid>.json`（pid/sessionId/cwd/status/waitingFor/name/version/updatedAt）、`~/.claude/projects/<escaped-cwd>/<sessionId>.jsonl` 尾部（model/usage/last-prompt/tool_use）。
- 输出（bridge）：SSE `data: {sessions: ClaudeSessionStatus[], now}`；HTTP `/status` 同结构 JSON。
- 输入（前端）：SSE 事件流；场景里小组件图层的 `config.bridgeUrl`（经 use-sync-bridge-url 写回 store）。
- 输出（前端）：`ClaudeStatusWidget` DOM；PNG 导出时经 `widgetLayerToSvg` 快照为 SVG 文本卡。

## 约束

- bridge 只监听 `127.0.0.1`；**绝不读取 `<pid>.<hex>.key` 令牌文件**；CORS 默认只放行 localhost/127.0.0.1 任意端口，`DIGIBOARD_ORIGIN` 可收紧到确切源。
- 用 `process.kill(pid, 0)` 判活（EPERM 也算活），跳过异常退出残留的陈旧 sessions 文件；只读 jsonl 尾部 `TAIL_BYTES`（默认 256KB）反向扫描，不全量解析大文件（活跃 jsonl 可达数 MB）。
- 环境变量可配：HOST/PORT(4321)/POLL_MS(1000)/TAIL_BYTES/CLAUDE_DIR/DIGIBOARD_ORIGIN。
- `status` 归一：合法值 busy/idle/waiting 透传，未知值→unknown；`waitingFor` 是开放字符串，原样透传不写死白名单。

## 边界条件

- 无 `~/.claude/sessions` 目录：返回空会话数组（前端显示「无活跃会话」）。
- jsonl 定位：优先精确转义路径 `escapeCwd(cwd)/<sessionId>.jsonl`，兜底 glob `projects/*/<sessionId>.jsonl`（sessionId 全局唯一，规避转义有损碰撞）；找不到则该会话无 model/token 字段。
- jsonl 尾部含损坏半行（正被写入）：JSON.parse 失败跳过，继续反向找。
- 尾部全是无 timestamp 的控制行（last-prompt/mode/permission-mode）：越过它们找最近的 assistant 行。
- 区分真人 user 消息与 tool_result 回填：优先取 `last-prompt` 行的 `lastPrompt`（即用户最后完整输入）。
- EventSource 不可用（测试环境）：直接进入 error/DISCONNECT，会话保持为空。
- cwd 转义有损（`a.b`/`a/b`/`a-b` 都→`a-b`）：故匹配用 sessionId 精确全等，不用 startsWith。

## 验收标准

- [x] vitest（bridge node 环境）：escapeCwd（含 github.io 真实案例）、normalizeStatus 三态、originAllowed CORS 白名单、parseTailFromText 反向扫描（model/usage/tool/prompt、跳过损坏行、headTruncated 丢弃首行）、pidAlive（bridge/server.test.mjs）
- [x] vitest（jsdom）：ClaudeStatusWidget 渲染标题/会话/连接态徽标（DISCONNECT/LIVE/connecting）、断连时不渲染任何会话、busy/idle/waiting 标签、waitingFor 显示、当前工具、model/token/cacheRead/cwd/消息格式、config 三开关、空态、6 会话截断、store 响应性重渲染（ClaudeStatusWidget.test.tsx）
- [x] Playwright：无 bridge 时显示 DISCONNECT 且不注入演示会话；bridge 运行时连 LIVE（未运行自动 skip，已手动验证真实 busy 会话通过）
- [x] 真实数据验证：bridge `/status` 对本机 4 个活跃会话返回正确 status/name/model/tokens/currentTool/lastMessage（curl 人工核对）

## 完成定义

- 如何判定已完成：`pnpm bridge` 起后小组件显示 LIVE 与本机会话；停 bridge 后 3s 内变为 DISCONNECT 且会话清空；`pnpm test` 覆盖 bridge 纯函数与组件渲染全绿。
