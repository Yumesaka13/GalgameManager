// Game runtime state — app-global, not tied to any page component.
//
// Previously the "which games are running / backing up" signals and the
// session-timing Map lived inside the Game page component. Navigating away
// unmounted the page, orphaning the tauri event listeners (which captured
// that component state) and losing session timing. Lifting everything here
// keeps the state alive for the whole app lifetime and registers the global
// recovery listeners exactly once.

import type { Game } from '@bindings/Game'
import type { Translator } from '@solid-primitives/i18n'
import { invoke } from '@tauri-apps/api/core'
import { once } from '@tauri-apps/api/event'
import { log } from '@utils/log'
import { formatSessionDuration } from '@utils/time'
import type { Dictionary } from '~/i18n'
import { useConfig } from '~/store'
import { createSignal } from 'solid-js'
import toast from 'solid-toast'

type TFunc = Translator<Dictionary>

const [playingIds, setPlayingIds] = createSignal<number[]>([])
const [backingUpIds, setBackingUpIds] = createSignal<number[]>([])

// Session start timestamps keyed by game id. Lives for the whole app, so
// navigating the sidebar no longer zeroes out in-progress timing.
const sessionStartTimes = new Map<number, number>()

let runtimeInitialized = false

const isPlaying = (id: number) => playingIds().includes(id)
const isBackingUp = (id: number) => backingUpIds().includes(id)

const markBackingUp = (id: number) => setBackingUpIds(prev => [...prev, id])
const unmarkBackingUp = (id: number) =>
  setBackingUpIds(prev => prev.filter(bid => bid !== id))

/**
 * Recover the set of running games on startup and register exit watchers.
 * Safe to call multiple times — only the first call does the work.
 */
export async function initGameRuntime(t: TFunc): Promise<void> {
  if (runtimeInitialized) return
  runtimeInitialized = true

  let ids: number[]
  try {
    ids = await invoke<number[]>('running_game_ids')
  } catch (e) {
    log.error(`[GameRuntime] failed to query running games: ${e}`)
    return
  }

  setPlayingIds(ids)
  for (const id of ids) {
    once<boolean>(`game://exit/${id}`, event => {
      setPlayingIds(prev => prev.filter(pid => pid !== id))
      if (!event.payload) {
        const gameName = useConfig().config.games.find(g => g.id === id)?.name ?? ''
        toast.error(gameName + t('hint.exitAbnormally'))
      }
    })
  }
}

/**
 * Launch a game: register spawn/exit listeners, record session timing, and
 * invoke the backend `exec`. On launch failure the listeners are torn down.
 */
export async function launchGame(game: Game, t: TFunc): Promise<void> {
  if (isPlaying(game.id)) return

  const [unlistenSpawn, unlistenExit] = await Promise.all([
    once(`game://spawn/${game.id}`, () => {
      sessionStartTimes.set(game.id, Date.now())
      setPlayingIds(prev => [...prev, game.id])
      toast.success(game.name + t('hint.isRunning'))
    }),
    once<boolean>(`game://exit/${game.id}`, event => {
      setPlayingIds(prev => prev.filter(id => id !== game.id))

      const startTime = sessionStartTimes.get(game.id)
      if (startTime !== undefined) {
        const duration = formatSessionDuration(Date.now() - startTime)
        sessionStartTimes.delete(game.id)
        if (event.payload) {
          toast.success(`${game.name} ${t('game.sessionDuration', { duration })}`)
        } else {
          toast.error(`${game.name}${t('hint.exitAbnormally')} (${duration})`)
        }
        return
      }

      if (!event.payload) {
        toast.error(game.name + t('hint.exitAbnormally'))
      }
    })
  ])

  try {
    await invoke('exec', { gameId: game.id })
  } catch (error) {
    // Distinguish plugin command failures from game launch failures
    const isPluginError = typeof error === 'string' && error.includes('Plugin ')
    if (isPluginError) {
      log.error(`Plugin error for game ${game.name}: ${error}`)
      toast.error(error)
    } else {
      log.error(`Failed to start game ${game.name}: ${error}`)
      toast.error(game.name + t('hint.failToStart') + error)
    }
    // If the launch instruction itself failed, clean up the listeners we just registered.
    unlistenSpawn()
    unlistenExit()
  }
}

export function useGameRuntime() {
  return {
    playingIds,
    backingUpIds,
    isPlaying,
    isBackingUp,
    launch: launchGame,
    markBackingUp,
    unmarkBackingUp
  }
}
