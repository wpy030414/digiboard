/**
 * 小组件注册入口：app 启动时把所有内置小组件渲染器登记到 WidgetLayerView 注册表。
 * 在 main.tsx 顶部 import 一次即可。
 */

import { registerWidget } from '@/engine/render/WidgetLayerView'
import { ClaudeStatusWidget } from './ClaudeStatusWidget'

registerWidget('claude-status', ClaudeStatusWidget)
