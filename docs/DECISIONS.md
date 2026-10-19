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
- 决策：`vite-plus` 单依赖 + 单份 `vite.config.ts`（内联 test/lint/fmt 配置），CI 用 `voidzero-dev/setup-vp@v1.21.2`。
- 为什么选这个：用户指定；减少 5+ 个工具依赖为 1 个；oxfmt/oxlint 版本与工具链绑定不会漂移。
- 为什么不选其他：裸 Vite 需要自行拼装并对齐各工具版本。
- 后果：踩到 pnpm override 只在依赖图内生效的坑——`types: ["vite/client"]` 与 `import 'vitest'` 无法解析，需把 `vite`（别名到 `@voidzero-dev/vite-plus-core`）与 `vitest@5.0.1` 提升为顶层 devDependencies（vite-plus README 官方建议同款做法）。vite-plus 1.0.0 发布仅数天，后续升级需回归 `vp check/build/test` 三件套。
- 更新（2026-10-18）：工具链整体升级到 `vite-plus@1.3.0` + `vite` 内核 `1.3.0` + `vitest@5.0.5`，`pnpm-workspace.yaml` 的 override 同步升级；`vp check` / `vp test`（336 用例）/ `vp build` / 60 条 E2E 全部回归通过。
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

## ADR-005：Claude 会话状态经本地 SSE bridge，断连显示 DISCONNECT

- 日期：2026-10-02
- 状态：已采纳
- 背景：小组件要显示本机 Claude Code 会话状态，但副屏是 GitHub Pages 纯静态部署，浏览器沙箱读不到 `~/.claude`。用户选定「本地脚本 SSE 通讯」。
- 考虑过的方案：本地 HTTP 轮询；SSE；WebSocket；手动粘贴 JSON；File System Access API。
- 决策：`bridge/server.mjs`（node 原生 http，零依赖）轮询 `~/.claude/sessions/*.json`（1s）+ jsonl 尾部反向扫描（256KB），变化时经 SSE 推送；前端 `EventSource` 订阅，3s 超时或 onerror 断开并清空会话（右上角显示 DISCONNECT）。
- 为什么选这个：SSE 是单向推送的天然匹配（服务器→浏览器），比 WebSocket 简单且自动重连；node 原生实现零安装成本（`pnpm bridge` 即跑）。
- 为什么不选其他：轮询浪费请求且延迟高；WebSocket 双向能力用不上；手动粘贴不「实时」；File System Access API 要用户手势授权且 Safari 不支持。
- 后果：bridge 必须严守安全边界——只监听 127.0.0.1、绝不读 `.key` 令牌文件、`process.kill(pid,0)` 判活跳过异常退出残留、CORS 默认只放行本机（`DIGIBOARD_ORIGIN` 可收紧）。sessions/*.json 的 `status` 实际有三态 busy/idle/**waiting**（+waitingFor 字符串，如 "dialog open"），前端 schema 已对齐并原样透传。
- 修订（2026-10-18）：用户要求「DEMO 不许加数据，连不上右上角就显示 DISCONNECT」。前端不再内置 mock 数据与心跳，断连时清空会话；`ConnectionStatus` 收敛为 connecting/live/error。
- 修订（2026-10-19）：线上副屏（如 `https://demo.xrl.im`）被 CORS 拦截，用户要求「允许连接所有客户端」。CORS 默认改为 `Access-Control-Allow-Origin: *`：副屏部署域名无法枚举，且 bridge 只在回环上——能向它发请求的前提是代码已在用户浏览器里运行，此时 Origin 校验没有实质防护价值。`DIGIBOARD_ORIGIN` 保留为多值白名单（逗号/空格分隔），命中回显确切 Origin + `Vary: Origin`，启动日志打印当前策略。同时补 Chrome 私有网络访问（PNA）预检头 `Access-Control-Allow-Private-Network`——公网 https 页请求本机 http 服务时 Chrome 强制预检，缺该头会连不上。已知代价（用户接受）：本机任意网页可读到会话 cwd/会话名/prompt 摘要/模型与 token 用量；不含鉴权令牌（`.key` 从不读取）。`originAllowed` 不再做 URL 解析，非法 Origin 字符串在无白名单时同样放行。
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

## ADR-009：屏幕改为网格玩具板（圆角点阵 + 固定黑底 + 取消网格辅助线）

- 日期：2026-10-17
- 状态：已采纳
- 背景：用户重新定义产品观感——屏幕是一块实体点阵玩具板：像素点之间不是无缝的，每颗像素是留缝的圆角矩形；画布底色必须是黑色，且不允许切成透明或换色；编辑器不再提供网格辅助线（点阵本身就是网格）。
- 考虑过的方案：继续用 W×H 位图 + `image-rendering: pixelated`；CSS grid 背景叠加；canvas 按输出像素密度逐格绘制圆角方块。
- 决策：`engine/dots.ts` 负责点阵几何（`DOT_GAP_RATIO` 单边留缝 16%、`DOT_RADIUS_RATIO` 圆角 30%），`PixelCanvas` 与 `to-png.ts` 共用 `drawPixelDots`：先铺满灭点（图层 `offColor`，可置空关闭），再叠亮点。画布 backing store 按设备像素比绘制（受 4096 边长与每格 24px 上限约束），CSS 拉伸到显示尺寸，圆角因此是真圆角而非放大锯齿。`Scene` 删除 `background` 字段，渲染与 PNG 导出统一用常量 `SCREEN_BACKGROUND='#000000'`；旧 YAML 里的 `background` 被忽略。
- 为什么选这个：圆角与留缝无法用整格位图表达；按输出像素密度绘制一次性解决屏显与 PNG 双管线的一致性（同一函数），且不再需要 `image-rendering` hack。固定黑底符合物理面板语义，也消除了「透明背景导出」带来的合成歧义。
- 为什么不选其他：CSS grid 与 canvas 内容无法逐格混合（被抠除区域、灭点色都要跟随图层配置）；保留透明背景会让 PNG 在不同底色上观感不一致。
- 后果：大点阵（512×512）单次重绘要遍历 26 万格，已通过只读 `mask` 跳过与单次 `fill()` 控制成本；编辑器不再有网格线开关（`toggle-grid` 移除）。旧场景缺 `offColor` 时读档补默认 `#26262f`。
- 何时重新审视：若需要动画逐帧重绘或 512×512 上的高频绘制，考虑脏矩形/分层缓存。

## ADR-010：数码管/小组件以矩形占据点阵空间，取消旋转

- 日期：2026-10-17
- 状态：已采纳
- 背景：用户要求数码管与小组件「是一个矩形整体，会占据像素空间」，而不是浮在像素点上的图层——被它占据的格子应从点阵中整块抠掉；同时明确「不允许旋转」，因为旋转会让「矩形占位」失去唯一解。
- 考虑过的方案：保持纯浮层覆盖；按轴对齐 AABB 抠除；按变换后矩形逐格判定（格心检测）；把图层矩形吸附到整数格。
- 决策：新增 `engine/footprint.ts`：`layerFootprint` 给出矢量层矩形（数码管 = 文本排布宽 × digitHeight，小组件 = width × height），`computeReservedMask` 以格心反变换判定被占据的格子；`SceneCanvas` 把掩码传给像素层，`to-png` 用同一掩码。`DigitLayer/WidgetLayer` 删除 `rotation` 字段与属性面板滑块，`transform.ts` 的 `rotation` 改为可选（保留通用矩阵能力）。斜切保留（默认数码管的 -6° 斜体），掩码按斜切后的平行四边形逐格判定。
- 为什么选这个：格心判定在无旋转时自然得到整数格矩形，斜切时边缘呈阶梯状，与实体玩具板「抠掉一颗颗棋子」的观感一致；同一份矩形同时服务命中测试、屏幕渲染与导出，避免三份几何漂移。
- 为什么不选其他（2026-10-18 修订后已被用户要求取代）：AABB 在斜切/旋转时会多抠一大片；吸附整数格与「浮点自由定位」冲突。
- 后果：旧 YAML 中的 `rotation` 会被静默忽略；默认数码管字符高度固定 4 场景单位（2026-10-18 修订，不再随画布尺寸变化）。修复了 SVG 根节点 0×0 导致 Chromium 不绘制数码管的既有缺陷（改为铺满容器 + `overflow: visible`）。
- 修订（2026-10-18）：用户进一步要求 ① digit/widget 必须占据完整矩形，任何摆放/斜切下外部像素点都不得与内容区相交；② 小组件强制吸附整数网格；③ 数码管默认字符高度固定 4 单位。占位改为「内容外接矩形（数码管含发光 3.5σ 扩散）向外取整到格」的 AABB 抠除，SVG 用同一 padding 裁切内容；`snapWidgetLayer` 在工厂、`normalizeScene` 与 `updateLayer` 三处统一吸附。原「格心判定」与「小组件浮点自由定位」被取代。数码管新增 `paddingX` / `paddingY`（内容与占位矩形的左右/上下留白），计入 footprint 并在屏幕/导出中统一内缩内容。
- 何时重新审视：若未来允许旋转，需要引入「旋转矩形栅格化」的明确规则（覆盖率阈值或 AABB）。

## ADR-011：编辑防抖持久化到 localStorage

- 日期：2026-10-17
- 状态：已采纳
- 背景：用户要求「每步编辑都需要防抖持久化到 localStorage」，避免误关页面丢失工作。
- 考虑过的方案：每次 set 同步写（画笔拖拽会高频写）；zustand `persist` 中间件（会把历史栈/选中态一起序列化，且 Uint8Array 需要自定义 storage）；独立防抖器（选中）。
- 决策：`engine/persistence.ts` 提供 `loadPersistedScene` / `savePersistedScene` / `createScenePersister`（400ms 防抖、flush、cancel），序列化复用 `sceneToYaml`；`EditorPage` 经 `usePersistScene` 订阅 store，只有 `scene` 引用变化才排队写入，卸载/`beforeunload`/页面隐藏时立即 flush。store 初始化优先读档，读不到或损坏时回退内置预设屏幕（`engine/presets.ts`，随包内置 YAML）。
- 为什么选这个：复用已验证的 YAML round-trip，不引入第二套序列化；防抖把画笔拖拽合并成一次写入；只存场景本身，历史栈与选中态不落盘，避免存储膨胀。
- 为什么不选其他：`persist` 中间件会持久化整个 store，风险与体积都不可控；同步写会卡住高频绘制。
- 后果：localStorage 键 `digiboard.scene.v1`（带版本号）；存储不可用（隐私模式/配额满）时静默降级，不打断编辑。E2E 覆盖「编辑 → 等待防抖 → 刷新 → 场景恢复」。
- 何时重新审视：场景体积接近配额上限（512×512 全图案）时改为 IndexedDB 或压缩存储。

## ADR-012：像素层收敛为唯一画布基座

- 日期：2026-10-17
- 状态：已采纳
- 背景：用户要求像素层是「必要基座」——不能出现在图层面板里、不能删除、必然在最底部，且不能再新增像素层；「新建」按钮改为 40×30 空白画布。
- 考虑过的方案：把像素数据整体挪出 `layers` 成为 `scene.board`；保留 `layers` 数组但在 UI/操作层加约束。
- 决策：保留数据模型（`PixelLayer` 仍在 `layers` 中，渲染/导出/YAML 不用改），在三个层面加约束：① `normalizeScene` 保证只有一个像素层且位于 index 0，多余像素层按坐标并集合并；② store 守卫——`addLayer('pixel')` 不新增、`removeLayer`/`duplicateLayer` 对基座无效、`reorderLayer` 不动基座且内容层下界为 1；③ UI——图层面板过滤像素层，下拉菜单移除「像素层」项，`newScene` 选中态为 null。
- 为什么选这个：改动面最小、YAML 格式不变、旧档可平滑归一；同时满足全部四条用户约束。
- 为什么不选其他：把像素搬到 `scene.board` 会波及渲染、导出、持久化、全部测试与 YAML 格式，收益只是概念更纯。
- 后果：像素基座的颜色/灭点色/清空等属性不再有入口（图层面板不显示、空选中只显示提示）；画笔/橡皮/油漆桶/取色仍直接作用于基座。若需要继续调色，应把这些控件移到工具栏。
- 何时重新审视：若用户需要编辑基座颜色与一键清空，届时在工具栏补控件或引入「画布设置」入口。

## ADR-013：像素层改为调色板索引，单层多色混搭

- 日期：2026-10-17
- 状态：已采纳
- 背景：用户要求单个像素层可以混搭多种颜色，颜色选择放在顶部工具栏（工具组右侧）。
- 考虑过的方案：每像素存 RGB（Uint32Array）；调色板 + 每像素色号（Uint8Array 索引）；多像素层叠色。
- 决策：`PixelLayer` 用 `palette: string[]` + `pixels: Uint8Array`（0=灭，n=`palette[n-1]`，上限 255 色）。画笔颜色存于 store 的 `brushColor`，写入时 `colorToValue` 自动登记新颜色并返回色号；橡皮写 0；取色工具读色号回填 `brushColor`。渲染端 `drawPixelDots` 按色号分桶、每色一次 `fill()`。YAML 里 `palette` 随层序列化，旧版 `color` 字段在读档时迁移为调色板首色。
- 为什么选这个：Uint8Array + 索引保持内存与 RLE 紧凑，YAML 仍可读；与既有不可变约定完全兼容（clone 时一并复制 palette）。
- 为什么不选其他：每像素 RGB 会让 512×512 从 256KB 涨到 1MB、RLE 压缩率骤降；多像素层叠色与「唯一像素基座」冲突。
- 后果：`drawPixel/drawLine/fillAt` 的 API 从 `0|1` 改为「颜色字符串 | null（擦除）」；`cloneLayer` 必须同时复制 `palette`，否则历史快照会被后续上色污染（已有单测覆盖）。旧场景颜色迁移后像素值仍为 1，指向首色，视觉不变。
- 何时重新审视：若要支持透明度/渐变或超过 255 色，需要位深扩展或改用 RGBA 缓冲。

## ADR-014：点阵上限 200×200、工具选中态高亮、新建画布对话框（含图片生成）

- 日期：2026-10-17
- 状态：已采纳
- 背景：用户要求：① 板子点阵最大 200×200，避免无序扩张；② 工具栏选中工具必须明显高亮；③ 「新建」点击弹出对话框，可生成指定尺寸空白画布，也可从图片 cover 生成并做色彩降级（上限为 8 位调色板，即 0=灭 + 255 色）。
- 决策：
  - 尺寸：`types.ts` 新增 `MAX_SCENE_SIZE = 200`；`clampSceneSize` 用于所有工厂/resize/新建路径；YAML 加载对场景与像素层尺寸做校验，超限直接报错而非截断。
  - 高亮：`ToggleGroupItem` 用 `aria-checked:` 变体着色（粉底+粉边）。注意不能依赖 `data-[state=on]`——`TooltipTrigger asChild` 会把自身的 `data-state`（open/closed）合并到同一个按钮上，覆盖 Toggle 的状态。
  - 新建对话框：`NewSceneDialog` + `image-to-pixels.ts`。图片按 cover 裁切（`coverCrop`），绘到 W×H 后每格取平均色，再按 4bit/通道分桶取最高频颜色、每格映射到最近色。默认上限 255 色（像素值 0 保留给灭点，合计 256 级）。`store.newScene(size, source?)` 直接注入调色板与像素缓冲（克隆入 store）。
- 后果：原先「新建 40×30」按钮变为弹窗；E2E 覆盖空白新建、图片生成（红/绿测试图 → 调色板含两色）、尺寸夹紧到 200、工具选中态（aria-checked + 背景色变化）。
- 何时重新审视：若确实需要 256 种亮色（而非 255 + 灭），需要把像素值扩到 16 位或加一条独立熄灭位图。

## ADR-015：拼豆模式作为纯视图开关

- 日期：2026-10-17
- 状态：已采纳
- 背景：用户希望屏幕能映射到物理拼豆板：像素变直角矩形、无黑色间距，四周有行列序号，每 5 格虚线、每 10 格实线（红色）作为定位参照。
- 决策：在工具栏缩放右侧加「拼豆模式」Switch（编辑器局部状态，不写入场景）。开启后：① `drawPixelDots` 新增 `beads` 选项，格子用 `ctx.rect` 画满整格（无留缝、无圆角）；② `BeadsOverlay` 叠层渲染行列序号与红色标识线（边界 5/10，实线/虚线区分）；③ 编辑器给画布留出 18px 边距放序号。序号在每格 ≥16px 时逐格编号，否则每 5 格编号。
- 为什么选这个：把「观察/照做辅助」与「场景数据」彻底分离——模式不改变像素数据、YAML、撤销栈与 PNG 导出，切回普通模式零成本，导出图仍是产品主视觉的圆角点阵。
- 为什么不选其他：把直角/参考线烘进场景需要新增字段并同步 YAML/导出，且会让「拼豆模式」变成永久样式而非临时视图。
- 后果：拼豆模式下的 PNG 导出保持普通圆角点阵（辅助线不会出现在成品里）；若用户需要方形导出，应单独加导出选项。
- 何时重新审视：若用户要求「拼豆模式导出方形」或需要保存该偏好，再提升为持久化视图设置/导出参数。

## ADR-016：拼豆模式持久化、方形导出与颜色图例（细化 ADR-015）

- 日期：2026-10-17
- 状态：已采纳（细化 ADR-015 中「纯视图、不导出」的部分）
- 背景：用户要求记住拼豆开关；开启时 PNG 也输出直角方块并带参考线；画布下方显示颜色图例（每色像素数），点击可只看该颜色。
- 决策：
  - 偏好：`engine/persistence.ts` 增加 `loadBeadsMode/saveBeadsMode`（键 `digiboard.ui.beads.v1`），EditorPage 初始化读取、切换即写。
  - 导出：`ExportPngOptions.beads`，`drawPixelDots` 传 `beads`，并在合成完成后用 `drawBeadsGuides` 画 5/10 格红线（+0.5px 对齐像素中心，虚线按 `pixelSize` 缩放）。不导出行列序号。
  - 图例：`editor/BeadsLegend` 统计 palette 计数（只列 count>0），点击条目把 `onlyValue` 传给像素层渲染，非该色亮点不绘制（棋盘/灭点保持不变）；再次点击或「显示全部」恢复。
- 后果：拼豆模式的导出与屏幕一致（除序号）；筛选只是显示层，不改变数据、撤销栈与导出内容——导出始终包含全部颜色。
- 何时重新审视：若要求「筛选状态下导出只含该颜色」，需要把 onlyValue 一并传入导出管线。

## ADR-017：调色板上限对齐 MARD 拼豆 221 色，图例显示色号

- 日期：2026-10-17
- 状态：已采纳（修订 ADR-013 / ADR-014 中的 255 色上限；细化 ADR-016 的图例）
- 背景：画布调色板上限此前取 8 位像素值的理论上限 255。但实体拼豆的标准色卡是 221 色，255 色既买不齐、也无法让图例对应真实色号；用户要求把上限对齐 221，并在拼豆模式图例里显示色号而不是 HEX。
- 考虑过的方案：
  - 只把上限改成 221，颜色仍为任意 RGB：数字对齐了，但无法给出色号，图例只能继续显示 HEX。
  - 采用色卡并从图片生成时吸附到色卡（选中）：调色板里的每种颜色都是真实可买到的豆子，图例可以直接给出 `A1` 这样的色号；画笔手涂的任意颜色仍允许存在，图例按最近色标注 `≈色号`。
  - 强制所有写入都吸附到色卡：会改变用户手选颜色的结果，且与「非拼豆模式的自由绘制」冲突。
- 决策：
  - 新增 `engine/beads-palette.ts`，内置 MARD 221 色（来源 HansBug/pindou-color-data 的 `mard-221-alfonse-doudou`，Alfonse 公开色卡 + 豆豆工坊核对），导出 `BEAD_COLORS`、`MAX_BEAD_COLORS`、`beadColorForHex`、`nearestBeadColor`。
  - 调色板上限统一改为 `MAX_BEAD_COLORS`（221）：`colorToValue` 超出时退回首色，`quantizeImageData` 的 `maxColors` 夹紧到 221，`DEFAULT_MAX_COLORS` 等于 221。
  - 图片生成在分桶量化后把每个桶的平均色吸附到最近色卡颜色并去重，因此生成结果的调色板只含真实色号；`palette`/YAML 格式不变。
  - `BeadsLegend` 显示色号：精确命中色卡显示 `A1`，色卡外的颜色显示 `≈A1`，tooltip 里同时给出 HEX 与当前颜色；`data-bead-code` 供测试断言。
- 为什么选这个：色号是拼豆工作流的真实单位（买豆、数豆、对图纸都按色号），HEX 对实体操作没有意义；吸附放在图片生成侧既保证可购买性，又不限制手绘自由。
- 为什么不选其他：见上；另外没有把 221 色做成工具栏选择器——当前需求只要求上限与图例，色卡数据已就位，后续可在此基础上做色板 UI。
- 后果：旧场景最多仍可带 255 色（读档不拒绝，向后兼容），但新写入的颜色一旦超过 221 会退回首色；图片生成的颜色会比原图更「豆化」，这是预期语义。HEX 是屏幕参考值，与实体豆粒存在色差，精确配色以实体色卡为准。
- 何时重新审视：若接入 Artkal 等其他 221 色卡品牌，或需要工具栏色板/按色号导出采购清单，可把色卡来源做成可切换配置。

## ADR-018：保存对话框、拼豆导出附序号/图例、每格灰色参考线

- 日期：2026-10-17
- 状态：已采纳（细化 ADR-016 / ADR-017）
- 背景：用户要求 ① 工具栏「新建画布」右侧新增「保存」，弹窗可选 YAML 或 PNG；② 拼豆模式导出的 PNG 要带行列序号与图例；③ 拼豆模式下每格都要有半透灰色参考线，同时保留 5 格红虚线、10 格红实线。
- 决策：
  - 保存：新增 `editor/SaveDialog`，工具栏「保存」（与「新建」同款 ghost 图标按钮，tooltip 附 ⌘S；「新建」tooltip 附 ⌘N）与 ⌘S 都打开同一个对话框；两个选项复用既有 `handleExportYaml` / `handleExportPng`，对话框里直接写明拼豆 PNG 会附序号与图例。保存入口统一后，右侧不再保留重复的「导出 YAML / 导出 PNG」按钮。
  - 导出版面：新增 `engine/export/beads-export.ts`。`measureBeadsExport` 计算留白、序号间隔、图例换行与画布尺寸；`drawBeadsAnnotations` 绘制列号（上/下）、行号（左/右）与图例（色块 + `色号 × 数量`，近似色带 `≈`）。图例按色号自然顺序排序（`A1 < A9 < A10 < B1`，屏幕与导出共用 `compareBeadCode`），不跟随调色板登记顺序。图例筛选（修订 ADR-016 的「非该色亮点不绘制」）：`onlyValue` 命中的颜色保持原样，其余亮点以 `FILTERED_DOT_ALPHA=0.3` 绘制，保留整体构图与色块标注，不改变数据与导出。
- 画笔：`setBrushColor` 统一吸附到最近拼豆色号（初始默认粉也落在 E19），工具栏 tooltip 显示色号而非 HEX；手选颜色因此不会产生买不到的豆色。
- 色块标注：`drawPixelDots` 新增 `labelCodes`，格子 ≥`BEAD_CODE_MIN_CELL`(8px) 时在每个亮点中央写小号色号，文字按底色亮度取反（`invertedTextColor`：亮底近黑、暗底白），屏幕（`PixelCanvas`）与导出共用，保证两边一致。`renderSceneToCanvas` 在 `beads` 时默认启用，`beadsAnnotations: false` 可退回纯图案导出。
  - 参考线：`drawBeadsGuides` 先以 `rgba(255,255,255,0.16)` 画每格边界，再叠 5/10 格红线；屏幕 `BeadsOverlay` 用同样的灰线与红线规则，保证屏幕与导出观感一致。
- 为什么选这个：序号与图例让导出图可以直接作为拼豆图纸使用；每格灰线提供了单颗豆的定位基准，而 5/10 红线仍承担快速定位，两者不冲突。保存对话框把「场景文件」与「成品图」的语义分开，避免用户把 YAML 误当图片分享。
- 为什么不选其他：把序号/图例做成 DOM 截图会引入浏览器渲染差异且难以在离屏 canvas 上复用；灰线只画 5/10 格则无法逐豆对齐。
- 后果：拼豆 PNG 的尺寸大于画布本身（留白 + 图例），坐标不再从 (0,0) 开始；`beadsAnnotations` 为真时 `renderSceneToCanvas` 返回的画布尺寸由 `measureBeadsExport` 决定。序号间隔沿用屏幕规则：每格 ≥16px 逐格编号，否则每 5 格。
- 何时重新审视：若需要打印分页、页眉页脚或 A4 排版，应把导出版面提升为独立的「图纸模板」模块。

## ADR-019：右侧共享栏（属性 60% / 小组件 40%）

- 日期：2026-10-18
- 状态：已采纳
- 背景：用户要求把左侧「图层」面板改名为「小组件」，并与右侧属性面板共享同一栏：属性在上（60% 高度）、小组件在下（40% 高度）。
- 决策：`EditorPage` 移除左侧 `LayerPanel`，右栏改为固定宽 288px 的竖直 flex：`PropertyPanel` 占 `flex-[3]`（60%），`LayerPanel` 占 `flex-[2]`（40%），中间以 `border-t` 分隔。两个面板根节点从独立 `aside`（自带宽度/边框）改为 `w-full` 的容器，边框与背景统一由外层 `aside` 提供；面板标题「图层」改为「小组件」，属性面板的通用分组同步改名，空态与添加按钮文案一并调整。
- 为什么选这个：把「当前选中对象的属性」与「场景内容树」集中到同一侧，画布获得更大的横向空间；60/40 让属性表单占据主位，同时内容树仍可滚动浏览。
- 为什么不选其他：保留左侧图层树会继续挤占画布宽度；给两个面板各自加滚动条与边框会让右栏出现双重视觉分隔。
- 后果：UI 中的「图层」术语统一为「小组件」；数据模型、store 方法与文件名仍为 Layer / LayerPanel，避免无收益的连锁重命名。窄屏未做响应式折叠（项目非目标）。
- 何时重新审视：若需要可拖拽分隔条或记住分隔比例，再引入 splitter 与偏好持久化。

## ADR-020：拼豆预览/导出提高分辨率，导出附署名行

- 日期：2026-10-18
- 状态：已采纳（细化 ADR-018）
- 背景：大倍率下屏幕预览按每格 24 输出像素封顶，高分屏会把画布放大得发虚；拼豆 PNG 的像素密度跟随当前屏幕倍率，缩小视野后导出分辨率偏低。用户还要求在导出图的大图与图例之间加一行白色居中的「Powered by Digiboard. GitHub:wpy030414」。
- 决策：
  - 屏幕：`PixelCanvas.dotUnit` 的 `MAX_UNIT` 由 24 提高到 48，输出仍受单边 4096 约束。3200% 且 DPR=1 时每格按 32 输出像素渲染，不再被 24 截断；DPR=2 时最多按 48 渲染。
  - 导出：新增 `beadsExportUnit(scene)`，拼豆导出与屏幕倍率解耦，取 `clamp(floor(4096 / max(w,h)), 8, 48)`。40×30 场景为 48px/格（画布 1920×1440，整图 1992×1644）；200×200 回落到 20px/格。普通模式仍按当前倍率导出。
  - 署名：`measureBeadsExport` 在画布（含下方列号）与图例之间预留 `signatureH = font + 10`；`drawBeadsAnnotations` 用白色（`#ffffff`）在整图水平居中绘制 `Powered by Digiboard. GitHub:wpy030414`。
  - 字号：色块内色号 `clamp(unit × 0.6, 5, 20)`；屏幕四周序号 `clamp(scale × 0.8, 9, 14)`；导出序号/图例/署名统一 `clamp(unit × 0.4, 12, 20)`，留白相应扩到 30–56px；屏幕图例正文由 `text-xs` 提到 `text-sm`。
- 后果：拼豆导出文件明显变大，但属于一次性操作；离屏画布单边仍受 4096 约束。署名是成品图的一部分，`beadsAnnotations: false` 导出纯图案时不含署名。
- 何时重新审视：若需要让用户自选导出倍率（1x/2x）或输出超过 4096 的印刷级图纸，应把密度做成 SaveDialog 选项并评估内存。

## ADR-021：适配 GitHub Pages 项目站点子路径 `/digiboard/`

- 日期：2026-10-18
- 状态：已采纳
- 背景：仓库部署到 GitHub Pages 项目站点，实际地址是 `https://wpy030414.github.io/digiboard/`，但构建产物引用 `/assets/*`、路由跑在站点根、`/play` 直达会 404——线上是白屏。
- 决策：
  - `vite.config.ts` 的 `base` 只读 CI 注入的 `PAGES_BASE_PATH`，本地 dev/preview/e2e 恒为 `/`；代码不推断仓库名或域名，项目页默认前缀由 workflow 的 `format('/{0}/', github.event.repository.name)` 给出。
  - `BrowserRouter` 的 `basename` 直接读 `import.meta.env.BASE_URL`（去掉尾斜杠），不维护第二份路径常量。
  - workflow 在 `vp build` 后把 `dist/index.html` 复制为 `dist/404.html` 并 `touch dist/.nojekyll`：GitHub Pages 没有 SPA 回退，`/digiboard/play` 直达/刷新靠 404 页把控制权交回前端路由。
  - `index.html` 的图标引用统一写 `%BASE_URL%favicon.ico`；`public/.nojekyll` 纳入仓库，避免 Jekyll 丢弃 `_` 开头的构建产物。
- 为什么选这个：base 由 CI 注入、代码零推断，改名/fork 只需动流水线与仓库变量；basename 复用 `BASE_URL` 避免两份路径漂移；`404.html` 是 GitHub Pages 上唯一无需服务端配置的 SPA 回退手段。
- 为什么不选其他：固定 `base: '/digiboard/'` 会让本地 dev 与 e2e 全部迁到子路径（e2e baseURL、dev 端口均需跟着改）；改用 HashRouter 会牺牲播放页的干净 URL。
- 后果：线上地址与分享链接必须带 `/digiboard/` 前缀；`404.html` 回退会丢失真实的 404 状态码（纯前端应用的既有取舍）。本地验证命令为 `PAGES_BASE_PATH=/digiboard/ pnpm build && PAGES_BASE_PATH=/digiboard/ pnpm preview`。
- 何时重新审视：若改用自定义域名或迁移到用户站点根仓库，把仓库变量 `PAGES_BASE_PATH` 设为 `/` 即可，无需改代码、也不放 `CNAME` 文件。

## ADR-022：图片转像素改为「结构保持型」管线

- 日期：2026-10-18
- 状态：已采纳（细化 ADR-014 / ADR-017）
- 背景：旧的图片生成是「canvas 双线性缩到 W×H → 每格取平均色 → 4bit/通道分桶取频次 Top-N → sRGB 最近色」。低分辨率下轮廓穿过的格子被平均成源图里不存在的中间色，轮廓变成 2–3 格宽的渐变带；分桶按频次选色会丢掉眼睛、嘴唇这类低面积但高意义的颜色；默认 221 色对小画布实际是「不降色」，噪声被原样保留。
- 决策：
  - 4× 中间分辨率逐格采样（每格约 16 个原始样本），而不是一次性缩到目标尺寸。
  - Kuwahara 预滤波（积分图实现，半径默认 3）：压平纹理、保留硬边。
  - 逐格代表色：样本方差低取 Oklab 均值；方差高时做 2-means，取主导簇质心，避免把轮廓两侧混成第三种颜色。
  - 调色板：Oklab 加权 k-means（k-means++ + 固定种子 LCG），色数默认按 `autoColorCount(cells) = clamp(round(sqrt(cells) × 0.6), 8, 32)` 自适应；质心吸附到 MARD 221 色卡并去重。
  - 空间清理：网格级双边滤波 + 两轮 ICM（数据项 = Oklab 距离，平滑项按邻域色差衰减），跨强边不合并。
  - 可选 L 通道非锐化（默认 0.3），找回平均滤波损失掉的局部对比。
  - `imageFileToPixels` 第三参数改为 `number | ImageToPixelsOptions`，旧调用仍按色数处理；`quantizeImageData` 签名不变。
- 为什么选这个：在 40×30 / 80×60 / 80×80 的实测里，14–20 色的新结果比旧算法 30 色更干净、轮廓更硬；200×200 最慢 169ms，40×30 约 22ms，纯前端可接受。Oklab 比 CIEDE2000 便宜一个数量级，感知上足够。
- 为什么不选其他：
  - Kopf 式对比度加权降采样：简化版实测反而增噪（把高对比噪点也加权放大），正确实现需要双边低频，复杂度不划算。
  - 完整 Graph Cut / alpha-expansion：ICM 两轮已能把孤立格并掉，且实现与调试成本低得多。
  - 端侧 / 云端生成模型：输入域窄、会改写颜色，暂作为可选风格另议。
- 后果：纯红 / 纯绿的吸附结果从 F5/B5 变为 F4/B2（Oklab 下更接近纯色本身），单测与 E2E 断言随之更新；色数默认不再是 221，小画布结果更「豆化」。所有步骤确定性，同输入同输出。
- 何时重新审视：若新增「色数」「风格强度」等 UI 选项，或引入主体抠图 / 卡通化前置阶段，应把参数从常量提升为 `ImageToPixelsOptions` 字段并补 E2E。

## ADR-023：图片生成可选「主体抠图」，本地 U²-Net-p + WASM

- 日期：2026-10-18
- 状态：已采纳（扩展 ADR-022）
- 背景：从照片生成拼豆图纸时，主体（人像、宠物、Logo）往往只占画面一小部分，背景却要消耗同样多的格子与豆子；低分辨率下主体被压得更小，轮廓更难辨认。用户明确同意引入 WASM 模型，但要求不依赖云端。
- 决策：
  - 模型：U²-Net-p（`u2netp.onnx`，4.4MB，Apache-2.0），权重随站点放在 `public/models/`，不走第三方 CDN，图片不出设备。
  - 运行时：`onnxruntime-web/wasm`（WASM-only 入口，避免 26MB 的 jsep/WebGPU 变体被打进产物）；推理放在 `src/workers/matting.worker.ts`，主线程只做解码、320×320 归一化与进度展示。
  - 构图：`subjectBounds` 取蒙版包围盒 → `cropRectForSubject` 加 12% padding 并扩展到目标宽高比 → 源图按此裁切；蒙版经 `destination-in` 合成到中间画布，覆盖率 <25% 的格子写 0（灭点）。
  - 接入：`ImageToPixelsOptions.matte`；`NewSceneDialog` 图片模式新增「主体抠图」复选框（默认关），显示下载/初始化/推理进度；失败只 `console.warn` 并回退普通模式，不阻断生成。
  - 构建：Vite 插件 `copyOrtRuntime`（`vite.config.ts`）在 dev 启动 / build 开始时把 ORT 的 `ort-wasm-simd-threaded.{mjs,wasm}` 复制到 `src/ort/`（git 忽略），Worker 用 `?url` 引入；`pnpm-workspace.yaml` 增加 `allowBuilds: protobufjs`，并把 `vite` override 钉到与 `vite-plus` 完全一致的版本（当前 `1.3.0`；内核与 `vite-plus` 必须同批升级，否则 `vp` 拒绝启动）。
- 为什么选这个：4.4MB 比 MODNet（26MB）轻 6 倍且对通用主体有效；WASM 推理约 0.85s、首次建会话约 3s，一次性操作可接受；全本地意味着静态站的隐私承诺不变。
- 为什么不选其他：
  - MODNet：人像边缘更好，但 26MB 且只擅长人像；
  - MediaPipe Selfie Segmenter：约 250KB，但只识别人；
  - 云端生成/抠图：照片要离开设备，且给静态站引入密钥与可用性依赖；
  - 学习式像素化（Make Your Own Sprites）：许可证与 ONNX 导出都不适合随站点分发。
- 后果：首次勾选会额外下载约 17MB（4.4MB 模型 + 13MB WASM），之后走 HTTP 缓存；`public/models` 增加 4.4MB 仓库体积；E2E 用「白底红圆」合成图覆盖开关与灭点语义。
- 何时重新审视：若启用 WebGPU 后端、换用更小的通用抠图模型，或需要按主体自动分配网格密度（而非整块裁切）。

## ADR-024：数码管时钟模式在渲染时生成，不写入场景状态

- 日期：2026-10-18
- 状态：已采纳
- 背景：用户要求数码管支持 `:` 与 `-`，并提供时钟模式（日期、时间、日期时间；时间可选秒与 12/24 小时制）。
- 考虑过的方案：每秒把格式化文本写回 `DigitLayer.text`；渲染时按当前时间生成；引入全局时钟 store。
- 决策：新增 `engine/clock.ts`（`formatClock` / `digitDisplayText`）。时钟字段持久化在 `DigitLayer`（`clockMode` / `clockShowSeconds` / `clockHour12`），但显示文本不落盘：渲染、`layerFootprint` 占位与 PNG 导出统一调用 `digitDisplayText`；`DigitLayerView` 时钟态每秒（日期模式每分）本地刷新。格式定长补零，保证占位矩形宽度不随秒数跳动。冒号为上下双点的窄标点格，减号复用中间横段 g。
- 为什么选这个：避免每秒修改场景触发 localStorage 防抖写入与撤销栈污染；渲染/占位/导出共用同一格式化函数，不会出现三份时间文本漂移。
- 后果：PNG 导出是当前时刻的快照；12 小时制不显示 AM/PM 标记（避免增加宽度与字符依赖）；时钟模式下手动 `text` 保留在 YAML 中但不生效，切回手动模式可继续编辑。
- 何时重新审视：若需要 AM/PM 指示、世界时区或倒计时/秒表模式，可扩展 `ClockMode` 与格式化器。

## ADR-025：Claude 小组件使用自托管 8px 像素字体

- 日期：2026-10-18
- 状态：已采纳
- 背景：用户要求 Claude 会话小组件「采用像素字体，模拟低分屏幕」。
- 考虑过的方案：Google Fonts 像素字体（Latin only）；CSS 低分辨率缩放模拟；自托管 CJK 像素字体。
- 决策：自托管「缝合像素字体 Fusion Pixel Font」8px 等宽简体中文版（woff2 约 360KB，SIL OFL 1.1），在 `index.css` 以 `@font-face` 注册为 `Fusion Pixel 8px`；小组件纯黑底 + `-webkit-font-smoothing: none` + `font-synthesis: none`。PNG 导出的 SVG 快照通过 `?url` 引用同一字体、导出时按需 fetch 为 data URI 内嵌，避免把字体再打进主 bundle。
- 为什么选这个：中文覆盖完整（会话名/最近消息常含中文），体积可控且无运行时外网依赖；屏幕与导出共用同一份文件，浏览器缓存命中。
- 后果：主 bundle 不因字体变大（CSS 资源单独加载 ~360KB）；字体许可证随仓库分发；极端情况下字体抓取失败时导出回退 monospace。
- 修订（2026-10-18）：用户要求「CRT 味」。小组件增加绝对定位的 CRT 叠层（较强扫描线 + 暗角 + 顶部反光 + 缓慢亮度呼吸）与磷光辉光/轻微 RGB 色差文字阴影；叠层 `pointer-events: none` 且完全位于占位矩形内，`prefers-reduced-motion` 下关闭动画。按用户反馈撤掉卡片描边，状态灯改为圆心光点 + 持续向圆边扩散的双涟漪。主题色与尺寸通过属性面板「外观」「尺寸与定位」调节。
- 何时重新审视：若引入更多小组件/字号档位，可考虑按字号子集化字体或改用位图字库。

## ADR-026：数码管辉光层与源图形分离，规避 WebKit 小字号漏绘

- 日期：2026-10-18
- 状态：已采纳
- 背景：用户反馈「数码管字符高度小于 4 时，部分管显示不出来」。复现确认：WebKit（Safari）在 `glow > 0` 且字符高度较小时，带 SVG filter 的分组会偶尔漏绘右侧/底部段位；Chromium 正常，去掉 filter 后 WebKit 也正常。
- 决策：渲染与 PNG 导出都把发光拆成两层——滤镜只输出辉光（`feGaussianBlur` → `feFlood` → `feComposite`，不再 `feMerge` SourceGraphic），未过滤的源图形再绘制一层叠在上面。屏幕与导出共用同一策略。
- 为什么选这个：源图形不经过滤镜缓存，任何浏览器都不会因滤镜失效而丢失段位；辉光即使部分缺失也只是柔光层，不影响可读性。
- 后果：`glow > 0` 时 SVG 中段位路径会绘制两份（性能可忽略）；单元测试新增「辉光滤镜不含 feMerge、源图形单独绘制」的结构断言。
- 何时重新审视：WebKit 修复该滤镜 bug 后可合并回单层 `feMerge`；或改用 canvas 阴影实现发光。
