import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useI18n } from '~/i18n'
import { FiDownloadCloud } from 'solid-icons/fi'
import { createSignal, onCleanup, Show, type JSX } from 'solid-js'
import FullScreenMask from './ui/FullScreenMask'

interface DropAreaProps {
  /**
   * Normal (non-hovering) content rendered inside the container div.
   * The drag-hover hint is shown on top of the overlay regardless.
   */
  children?: JSX.Element
  /**
   * Handles the drop event.
   * @param paths The paths of the files dropped.
   */
  callback?: (paths: string[]) => void
  /**
   * Extra class names for the container div.
   */
  class?: string
}

export function DropArea(props: DropAreaProps) {
  const { t } = useI18n()
  const [hovering, setHovering] = createSignal(false)

  // 存储取消监听的函数
  let unlisteners: UnlistenFn[] = []
  // Tracks whether the component has been disposed. If listeners finish
  // registering after unmount, we must tear them down immediately.
  let disposed = false

  const setupListeners = async () => {
    const listeners = await Promise.all([
      listen('tauri://drag-enter', () => {
        setHovering(true)
      }),
      listen('tauri://drag-leave', () => {
        setHovering(false)
      }),
      listen<{ paths: string[] }>('tauri://drag-drop', event => {
        setHovering(false)
        props.callback?.(event.payload.paths)
      })
    ])
    if (disposed) {
      // Component unmounted while we were still registering listeners.
      listeners.forEach(fn => fn())
    } else {
      unlisteners = listeners
    }
  }

  // 初始化监听
  setupListeners()

  // 组件卸载时清理监听，保证 Robust
  onCleanup(() => {
    disposed = true
    unlisteners.forEach(fn => fn())
  })

  return (
    <>
      <Show when={hovering()}>
        {/* The release hint is rendered *inside* the mask so it sits on top
            of the dark/blur overlay, centered. */}
        <FullScreenMask>
          <div class="flex flex-col items-center gap-4 text-white select-none">
            <FiDownloadCloud class="w-20 h-20 drop-shadow-lg animate-pulse" />
            <p class="text-xl font-medium drop-shadow">{t('hint.dragFileHere')}</p>
          </div>
        </FullScreenMask>
      </Show>
      {/* 使用 div 包裹并应用传入的 class */}
      <div class={props.class}>{props.children}</div>
    </>
  )
}
