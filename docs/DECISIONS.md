# DECISIONS

本轮「LED 数显 → 电子副屏」升级的关键决策记录。

## ADR-001：框架从 Vue 3 迁移到 React 19.3

- 日期：2026-10-02
- 状态：已采纳
- 背景：用户指定升级技术栈为 React 19.3 + Vite+ + shadcn/ui；原项目为 Vue 3.5（vapor beta）七段数码管 demo，仅 5 个源文件，迁移成本可控。
- 考虑过的方案：保留 Vue 增量改造；整体迁移 React。
- 决策：整体迁移，删除全部 Vue 文件，按新栈重建。
- 为什么选这个：用户明确指定；原代码量小（无路由/状态库依赖，router 与 pinia 脚手架残留已在上个 commit 移除），重写比适配更快且无历史包袱。
- 为什么不选其他：Vue vapor 仍是 beta，且 shadcn/ui 官方无 Vue 版（shadcn-vue 是社区移植）。
- 后果：数码管的二进制字典（`0b1110111`）与 skew 视觉迁移为 `engine/digits.ts` 的 a-g 位掩码 + SVG 矢量渲染，语义保留并有测试对齐（digits.test.ts 专门验证 `0b1110111(0)=abcdef` 的等价性）。
- 何时重新审视：不会——技术栈由用户锁定。

## ADR-002：构建工具链采用 Vite+（vite-plus）而非裸 Vite

- 日期：2026-10-02
- 状态：已采纳
- 背景：用户指定「打包使用 vite+」。vite-plus@1.0.0 刚发布（VoidZero 统一工具链：vite/vitest/oxlint/oxfmt/rolldown 合一，命令 `vp`）。原项目已在用 `vite beta` + `oxfmt`，取向一致。
- 考虑过的方案：裸 Vite 8 + 独立 vitest/oxlint/oxfmt；Vite+ 统一入口。
- 决策：`vite-plus` 单依赖 + 单份 `vite.config.ts`（内联 test/lint/fmt 配置），CI 用 `voidzero-dev/setup-vp@v1.21.1`。
- 为什么选这个：用户指定；减少 5+ 个工具依赖为 1 个；oxfmt/oxlint 版本与工具链绑定不会漂移。
- 为什么不选其他：裸 Vite 需要自行拼装并对齐各工具版本。
- 后果：踩到 pnpm override 只在依赖图内生效的坑——`types: ["vite/client"]` 与 `import 'vitest'` 无法解析，需把 `vite`（别名到 `@voidzero-dev/vite-plus-core`）与 `vitest@5.0.1` 提升为顶层 devDependencies（vite-plus README 官方建议同款做法）。vite-plus 1.0.0 发布仅数天，后续升级需回归 `vp check/build/test` 三件套。
- 何时重新审视：vite-plus 出现破坏性变更或长期停更时。

## ADR-003：数码管用 SVG 矢量浮层而非栅格化进点阵

- 日期：2026-10-02
- 状态：已采纳
- 背景：用户要求 LED 数显「突破像素限制」，并在方案确认时选定「矢量浮层（真突破）」：数码管是独立矢量对象浮在点阵之上，任意角度/斜切/发光/亚像素定位/可超出画布，不被网格量化。
- 考虑过的方案：A. 栅格化高像素段（仍是网格像素，只是段更粗）；B. SVG 矢量浮层；C. 混合（编辑矢量、落笔栅格化）。
- 决策：B——屏幕渲染用 `<svg overflow:visible>` + 仿射矩阵；导出 PNG 时序列化同一套几何为 SVG 字符串 → `Image` → drawImage 栅格化合成；导出 YAML 保留矢量参数。
- 为什么选这个：用户拍板；几何（digits.ts）与矩阵（transform.ts）被渲染和导出两条管线复用，结构上保证所见即所得；SVG filter 原生支持发光（feGaussianBlur+feFlood），canvas 手写 glow 代价高。
- 为什么不选其他：A 不满足「真突破」（仍被量化）；C 引入两份几何真相（编辑态/落定态），一致性成本高。
- 后果：PNG 导出必须异步（SVG→Image 是异步解码）；`to-png.ts` 逐矢量层单独栅格化以保 z-order（像素层可夹在矢量层之间）；jsdom 无法测试栅格化路径，由 Playwright E2E 在真实 chromium 验证（PNG 魔数 + 640×480 合成 + 非透明像素计数）。
- 何时重新审视：若需要动画时间轴/视频导出，SVG 逐帧栅格化可能成为瓶颈，届时评估 canvas 直绘数码管几何。

## ADR-004：像素层数据用 Uint8Array + RLE 序列化

- 日期：2026-10-02
- 状态：已采纳
- 背景：点阵最大 512×512=262144 格，需要高效的内存表示与紧凑的 YAML 序列化；单色像素（用户指定）每格只有 on/off。
- 考虑过的方案：boolean[]；Uint8Array；位打包（Uint32Array 每 bit 一格）；YAML 里存 base64 原始字节 vs RLE 数组。
- 决策：内存用 `Uint8Array`（0/1），YAML 用 RLE（`[count, value, …]` 扁平数组）。
- 为什么选这个：Uint8Array 比 boolean[] 省内存且 ImageData 写入零转换；像素画大面积同色，RLE 压缩率极高（200×200 全空白 → `[40000, 0]` 两个数），且是**可读 YAML**（人眼可查可手改），比 base64 黑盒友好。
- 为什么不选其他：位打包省 8 倍内存但读写都要位运算，512×512 规模下 Uint8Array 的 256KB 完全可接受，可读性优先；base64 失去 YAML 可编辑性。
- 后果：round-trip 测试（to-yaml.test.ts）锁定无损性；resize 用重采样保留重叠区（factories.ts）。
- 何时重新审视：支持多色像素（每格 RGB）时 RLE 需扩展为 run+color 对。

## ADR-005：Claude 会话状态经本地 SSE bridge，前端 mock 降级

- 日期：2026-10-02
- 状态：已采纳
- 背景：小组件要显示本机 Claude Code 会话状态，但副屏是 GitHub Pages 纯静态部署，浏览器沙箱读不到 `~/.claude`。用户选定「本地脚本 SSE 通讯」。
- 考虑过的方案：本地 HTTP 轮询；SSE；WebSocket；手动粘贴 JSON；File System Access API。
- 决策：`bridge/server.mjs`（node 原生 http，零依赖）轮询 `~/.claude/sessions/*.json`（1s）+ jsonl 尾部反向扫描（256KB），变化时经 SSE 推送；前端 `EventSource` 订阅，3s 超时或 onerror 降级内置 mock（3s 心跳翻转 busy/idle 制造活动感）。
- 为什么选这个：SSE 是单向推送的天然匹配（服务器→浏览器），比 WebSocket 简单且自动重连；node 原生实现零安装成本（`pnpm bridge` 即跑）；mock 降级保证静态部署不空白——小组件永远有内容。
- 为什么不选其他：轮询浪费请求且延迟高；WebSocket 双向能力用不上；手动粘贴不「实时」；File System Access API 要用户手势授权且 Safari 不支持。
- 后果：bridge 必须严守安全边界——只监听 127.0.0.1、绝不读 `.key` 令牌文件、`process.kill(pid,0)` 判活跳过异常退出残留、CORS 默认只放行本机（`DIGIBOARD_ORIGIN` 可收紧）。sessions/*.json 的 `status` 实际有三态 busy/idle/**waiting**（+waitingFor 字符串，如 "dialog open"），前端 schema 已对齐并原样透传。
- 何时重新审视：Claude Code 官方提供浏览器可达的状态 API 时（届时 bridge 可退役）。

## ADR-006：历史 commit 重写用 git-filter-repo，作者时间保留，不推送

- 日期：2026-10-02
- 状态：已采纳
- 背景：用户要求把历史所有 commit 的 message 按实际情况重写，作者全部改为 `杏仁鹿 <krkr@xrl.im>`，**作者时间不变**。核查发现原作者已是该身份（改作者近乎 no-op，实质是 message 重写）；仓库仅 2 个 commit，已推送到 origin。用户选定「重写但不推送」。
- 考虑过的方案：git rebase -i reword；git filter-branch；git-filter-repo。
- 决策：`git filter-repo --message-callback`（Python 回调按原 subject 精确匹配替换 message），重写前先 `git bundle` 全量快照到 `/tmp`（git 外部，不被 filter-repo 波及），完成后恢复被 filter-repo 移除的 origin remote，**不 force push**。
- 为什么选这个：filter-repo 是 filter-branch 的官方替代品，默认保留 author date/committer date（满足「作者时间不变」）；bundle 快照提供可回退性（AGENTS.md 要求）；不推送把远端历史的处置权留给用户。
- 为什么不选其他：rebase reword 会更新 committer date 且交互流程在自动化环境不可用；filter-branch 已被 git 官方弃用。
- 后果：本地 2 个 commit hash 已变（`d8b4100→8277397`、`67e1a4f→77a6257`），与 origin/main 分叉；**任何推送都必须是 force push，且需用户明确指示**。message-callback 的坑：回调必须显式 `return message`（赋值不返回会得到 None 并在 hash 替换阶段崩溃）。
- 何时重新审视：用户决定推送时（`git push --force-with-lease` 并同步 GitHub Pages 构建）。

## ADR-007：状态管理用 zustand，撤销/重做为全场景快照栈

- 日期：2026-10-02
- 状态：已采纳
- 背景：编辑器需要场景 CRUD + 选中态 + 撤销/重做；播放页与编辑器共享小组件数据源。
- 考虑过的方案：Redux Toolkit（+ Immer）；zustand；useReducer + Context；命令模式（每操作存逆命令）。
- 决策：zustand 单例 store；历史栈存**场景深拷贝快照**（上限 100），像素层 clone Uint8Array，其余结构展开复制。
- 为什么选这个：零样板、选择器订阅细粒度（工具栏/面板各取所需不联动重渲染）；快照栈实现简单且正确性显然（对比命令模式要为每个操作写逆操作）；262144 字节/快照 × 100 上限 ≈ 25MB 最坏情况，可接受。
- 为什么不选其他：RTK 样板重；Context 全树重渲染对拖拽绘制这种高频更新不友好；命令模式在 resize/填充这类全局操作上逆操作难写易错。
- 后果：不可变约定是正确性前提——像素写入前必须 clone（`withPixelLayer` 强制此模式），连续操作（画笔拖拽）由调用方在笔画起点 `commitHistory()` 一次，离散操作（fill/clear/add/remove/resize）内部自动 pushHistory。
- 何时重新审视：若支持超大点阵（>512）或多文档，快照内存占用需改为结构共享（Immer patches 或 immutable 结构）。

## ADR-008：测试分层——vitest 纯逻辑 + Playwright 真实浏览器

- 日期：2026-10-02
- 状态：已采纳
- 背景：AGENTS.md 要求「高覆盖率的 E2E 测试」作为验收标准；PNG 导出依赖真实 canvas 2D（createImageData/drawImage/SVG 解码/toBlob），jsdom 全部无实现。
- 考虑过的方案：全 jsdom + canvas mock；全 Playwright；分层。
- 决策：vitest（jsdom）覆盖纯逻辑与组件结构——digits 几何、transform 矩阵、pixels 原语、store 语义、YAML round-trip、SVG 序列化、组件渲染断言（197 例）；Playwright（chromium）覆盖真实交互与栅格化——指针拖拽绘制、快捷键、导出下载（PNG 魔数校验）、播放页还原、SSE 桥接 LIVE/降级（29 例）。bridge 纯函数用 vitest node 环境直测。
- 为什么选这个：jsdom 快（<2s 全量）适合逻辑回归；canvas 栅格化只能在真实浏览器验证，Playwright 补上这块且顺带覆盖用户视角全链路。E2E 断言经 dev-only 的 `window.__digiboard` store 钩子做确定性验证（生产构建不暴露），避免脆弱的 canvas 像素采样。
- 为什么不选其他：全 jsdom 测不了 PNG 导出（本项目核心功能）；全 Playwright 反馈慢（16s+）且纯逻辑用例写起来绕。
- 后果：CI 需要 `vp check → vp test → playwright test` 三段；E2E 用专用端口 5273 + `--strictPort`（开发机上 5173/5174 被其它项目占用）；LIVE 桥接测试在 bridge 未运行时自动 skip（已手动验证 bridge 运行时通过）。
- 何时重新审视：引入视觉回归（screenshot diff）时评估 Playwright 的 toContainScreenshot 或 reg-suit。
