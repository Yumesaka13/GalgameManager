// src/pages/Statistics/index.tsx
// Per-game daily playtime stacked bar chart powered by Chart.js
import { useColorMode } from '@kobalte/core'
import { invoke } from '@tauri-apps/api/core'
import { useI18n } from '~/i18n'
import { useConfig } from '~/store'
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  LinearScale,
  Tooltip
} from 'chart.js'
import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
  type Component
} from 'solid-js'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip)

const GAME_COLORS = [
  'rgba(59,130,246,0.85)', // blue
  'rgba(239,68,68,0.85)', // red
  'rgba(34,197,94,0.85)', // green
  'rgba(168,85,247,0.85)', // purple
  'rgba(251,146,60,0.85)', // orange
  'rgba(236,72,153,0.85)', // pink
  'rgba(20,184,166,0.85)', // teal
  'rgba(250,204,21,0.85)' // yellow
]

type PerGameData = Record<number, Record<string, number>>

// Format a Date as the local YYYY-MM-DD key. Must match the backend's
// chrono::Local bucketing so chart days line up with recorded seconds.
const formatLocalDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`

const StatisticsPage: Component = () => {
  const { t } = useI18n()
  const { config } = useConfig()
  const { colorMode } = useColorMode()
  const [rawData, setRawData] = createSignal<PerGameData>({})
  let canvasRef: HTMLCanvasElement | undefined
  let chartInstance: Chart | undefined

  const buildLast7Days = (): string[] => {
    const days: string[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      days.push(formatLocalDate(d))
    }
    return days
  }

  // Build game_id -> name lookup
  const gameNames = createMemo(() => {
    const map: Record<number, string> = {}
    for (const g of config.games) {
      map[g.id] = g.name
    }
    return map
  })

  // Sorted list of game IDs that have any data in the last 7 days
  const activeGameIds = createMemo(() => {
    const data = rawData()
    const days = buildLast7Days()
    const ids = Object.keys(data).map(Number)
    // Only include games with data in the last 7 days
    return ids.filter(id => {
      const gameData = data[id]
      if (!gameData) return false
      return days.some(d => (gameData[d] ?? 0) > 0)
    })
  })

  const fetchData = async () => {
    try {
      const data = await invoke<PerGameData>('get_daily_playtime')
      setRawData(data)
    } catch (e) {
      console.error('Failed to fetch daily playtime:', e)
    }
  }

  onMount(() => {
    fetchData()
  })

  // Re-render the chart whenever the underlying data or the color theme changes.
  // createEffect runs after Solid commits DOM updates, so <canvas> is mounted
  // before the first paint when there is data to show.
  createEffect(() => {
    rawData()
    colorMode()
    renderChart()
  })

  const renderChart = () => {
    const data = rawData()
    const days = buildLast7Days()
    const ids = activeGameIds()

    if (!canvasRef) return
    chartInstance?.destroy()

    const labels = days.map(d => {
      const parts = d.split('-')
      return `${parseInt(parts[1])}/${parseInt(parts[2])}`
    })

    const dayTotals = days.map(d => {
      let sum = 0
      for (const id of ids) {
        sum += data[id]?.[d] ?? 0
      }
      return sum / 60
    })

    const datasets = ids.map((id, idx) => {
      const color = GAME_COLORS[idx % GAME_COLORS.length]
      const name = gameNames()[id] ?? `Game #${id}`
      const gameData = days.map(d => Math.round(((data[id]?.[d] ?? 0) / 60) * 10) / 10)
      return {
        label: name,
        data: gameData,
        backgroundColor: color,
        borderColor: color.replace('0.85', '1'),
        borderWidth: 1,
        borderRadius: 4
      }
    })

    chartInstance = new Chart(canvasRef, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: ids.length > 1,
            position: 'bottom',
            labels: {
              color: colorMode() === 'dark' ? '#9ca3af' : '#6b7280',
              boxWidth: 12,
              padding: 8
            }
          },
          tooltip: {
            callbacks: {
              label: ctx => {
                const mins = ctx.parsed.y ?? 0
                const gameName = ctx.dataset.label
                let line = `${gameName}: `
                if (mins >= 60) {
                  line += `${Math.floor(mins / 60)}${t('unit.hour')} ${Math.round(mins % 60)}${t('unit.minute')}`
                } else {
                  line += `${mins} ${t('unit.minute')}`
                }
                return line
              },
              afterBody: items => {
                const idx = items[0]?.dataIndex
                if (idx === undefined) return ''
                const total = dayTotals[idx]
                if (total >= 60) {
                  return `${t('stats.totalLabel')}: ${Math.floor(total / 60)}${t('unit.hour')} ${Math.round(total % 60)}${t('unit.minute')}`
                }
                return `${t('stats.totalLabel')}: ${Math.round(total)}${t('unit.minute')}`
              }
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: {
              color: colorMode() === 'dark' ? '#9ca3af' : '#6b7280'
            }
          },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: {
              callback: val => `${val} ${t('unit.minute')}`,
              color: colorMode() === 'dark' ? '#9ca3af' : '#6b7280'
            },
            grid: {
              color:
                colorMode() === 'dark' ? 'rgba(75,85,99,0.3)' : 'rgba(209,213,219,0.5)'
            }
          }
        }
      }
    })
  }

  onCleanup(() => {
    chartInstance?.destroy()
  })

  // Total minutes across the last 7 days — kept in sync with the chart below,
  // which also only renders the 7-day window. Previously this summed *all*
  // recorded history, disagreeing with both the label and the bars.
  const weekTotalMinutes = createMemo(() => {
    const data = rawData()
    let sum = 0
    for (const d of buildLast7Days()) {
      for (const gameData of Object.values(data)) {
        sum += gameData[d] ?? 0
      }
    }
    return sum / 60
  })

  const weekTotalLabel = createMemo(() => {
    const mins = weekTotalMinutes()
    if (mins >= 60) {
      return `${Math.floor(mins / 60)}${t('unit.hour')} ${Math.round(mins % 60)}${t('unit.minute')}`
    }
    return `${Math.round(mins)} ${t('unit.minute')}`
  })

  return (
    <div class="flex flex-col h-full text-gray-900 dark:text-gray-100">
      <div class="bg-white dark:bg-gray-900 px-5 pt-3 pb-6 flex-shrink-0">
        <h1 class="text-2xl font-bold">{t('stats.self')}</h1>
      </div>

      <main class="flex-1 overflow-y-auto p-6 sm:p-8">
        <div class="max-w-4xl mx-auto space-y-6">
          <div class="flex items-center gap-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <span class="text-sm font-medium text-blue-700 dark:text-blue-300">
              {t('stats.last7Days')}
            </span>
            <span class="text-lg font-bold text-blue-800 dark:text-blue-200">
              {t('stats.totalLabel')}: {weekTotalLabel()}
            </span>
          </div>

          <div class="relative h-80 w-full bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <Show
              when={activeGameIds().length > 0}
              fallback={
                <div class="flex items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm">
                  {t('stats.noData')}
                </div>
              }
            >
              <canvas ref={canvasRef} class="w-full h-full" />
            </Show>
          </div>

          <div class="text-center text-sm text-gray-400 dark:text-gray-500">
            {t('stats.dailyPlaytime')}
          </div>
        </div>
      </main>
    </div>
  )
}

export default StatisticsPage
