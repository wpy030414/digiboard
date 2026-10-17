/**
 * 场景自动保存 Hook：订阅 store 的 scene 引用变化，防抖写入 localStorage。
 *
 * 仅在编辑器挂载（播放页不需要写回）。卸载、页面隐藏或关闭前强制落盘，
 * 保证最后一次编辑不会停在防抖窗口里丢掉。
 */

import { useEffect } from 'react'
import { useSceneStore } from '@/engine/scene-store'
import { createScenePersister } from '@/engine/persistence'

export function usePersistScene(): void {
  useEffect(() => {
    const persister = createScenePersister()
    const unsubscribe = useSceneStore.subscribe((state, prev) => {
      // 只有场景对象真的换了才排队（选中态/工具态不触发写入）
      if (state.scene !== prev.scene) persister.schedule(state.scene)
    })

    const flush = () => persister.flush()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') persister.flush()
    }

    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      unsubscribe()
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVisibility)
      persister.flush()
    }
  }, [])
}
