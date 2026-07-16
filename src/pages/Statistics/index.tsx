// src/pages/Statistics/index.tsx
// Daily playtime bar chart powered by Chart.js
import { invoke } from '@tauri-apps/api/core'
import { useI18n } from '~/i18n'
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  Tooltip
} from 'chart.js'
import { createEffect, createSignal, onCleanup, onMount, type Component } from 'solid-js'

// Register the minimal set of Chart.js components we need (tree-shakeable).
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const StatisticsPage: Component = () => {
  const { t } = useI18n()
  const [playtimeData, setPlaytimeData] = createSignal<Record<string, number>>({})
  let canvasRef: HTMLCanvasElement | undefined
  let chartInstance: Chart | undefined

  // Build the last 7 days array (most recent 7 dates)
  const buildLast7Days = (): string[] => {
    const days: string[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      days.push(d.toISOString().slice(0, 10))
    }
    return days
  }

  const fetchData = async () => {
    try {
      // per-game: game_id -> date -> seconds; sum across games
      const data =
        await invoke<Record<number, Record<string, number>>>('get_daily_playtime')
      const summed: Record<string, number> = {}
      for (const gameEntries of Object.values(data)) {
        for (const [date, secs] of Object.entries(gameEntries)) {
          summed[date] = (summed[date] ?? 0) + secs
        }
      }
      setPlaytimeData(summed)
    } catch (e) {
      console.error('Failed to fetch daily playtime:', e)
    }
  }

  onMount(() => {
    fetchData()
  })

  // Render chart when data changes
  createEffect(() => {
    const data = playtimeData()
    const days = buildLast7Days()

    if (!canvasRef) return

    // Destroy previous chart
    chartInstance?.destroy()

    const minutes = days.map(d => {
      const secs = data[d] ?? 0
      return Math.round((secs / 60) * 10) / 10 // round to 1 decimal
    })

    const hasData = minutes.some(v => v > 0)

    chartInstance = new Chart(canvasRef, {
      type: 'bar',
      data: {
        labels: days.map(d => {
          // Show only month-day for brevity (e.g. "7/15")
          const parts = d.split('-')
          return `${parseInt(parts[1])}/${parseInt(parts[2])}`
        }),
        datasets: [
          {
            label: t('unit.minute'),
            data: minutes,
            backgroundColor: hasData
              ? minutes.map(v =>
                  v > 0 ? 'rgba(59,130,246,0.85)' : 'rgba(156,163,175,0.3)'
                )
              : 'rgba(156,163,175,0.2)',
            borderColor: hasData ? 'rgba(59,130,246,1)' : 'rgba(156,163,175,0.5)',
            borderWidth: 1,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const mins = ctx.parsed.y ?? 0
                if (mins >= 60) {
                  const h = Math.floor(mins / 60)
                  const m = Math.round(mins % 60)
                  return `${h}${t('unit.hour')} ${m}${t('unit.minute')}`
                }
                return `${mins} ${t('unit.minute')}`
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: document.documentElement.classList.contains('dark')
                ? '#9ca3af'
                : '#6b7280'
            }
          },
          y: {
            beginAtZero: true,
            ticks: {
              callback: val => `${val} ${t('unit.minute')}`,
              color: document.documentElement.classList.contains('dark')
                ? '#9ca3af'
                : '#6b7280'
            },
            grid: {
              color: document.documentElement.classList.contains('dark')
                ? 'rgba(75,85,99,0.3)'
                : 'rgba(209,213,219,0.5)'
            }
          }
        }
      }
    })
  })

  onCleanup(() => {
    chartInstance?.destroy()
  })

  // Compute total for display
  const totalMinutes = () => {
    const data = playtimeData()
    const days = buildLast7Days()
    return days.reduce((sum, d) => sum + (data[d] ?? 0), 0) / 60
  }

  return (
    <div class="flex flex-col h-full text-gray-900 dark:text-gray-100">
      {/* Header */}
      <div class="bg-white dark:bg-gray-900 px-5 pt-3 pb-6 flex-shrink-0">
        <h1 class="text-2xl font-bold">{t('stats.self')}</h1>
      </div>

      {/* Content */}
      <main class="flex-1 overflow-y-auto p-6 sm:p-8">
        <div class="max-w-4xl mx-auto space-y-6">
          {/* Summary */}
          <div class="flex items-center gap-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <span class="text-sm font-medium text-blue-700 dark:text-blue-300">
              {t('stats.last7Days')}
            </span>
            <span class="text-lg font-bold text-blue-800 dark:text-blue-200">
              {t('stats.totalLabel')}:{' '}
              {totalMinutes() >= 60
                ? `${Math.floor(totalMinutes() / 60)}${t('unit.hour')} ${Math.round(totalMinutes() % 60)}${t('unit.minute')}`
                : `${Math.round(totalMinutes())}${t('unit.minute')}`}
            </span>
          </div>

          {/* Chart */}
          <div class="relative h-80 w-full bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <canvas ref={canvasRef} class="w-full h-full" />
          </div>

          {/* No-data hint: shown when chart uses a single initial render */}
          <div class="text-center text-sm text-gray-400 dark:text-gray-500">
            {t('stats.dailyPlaytime')}
          </div>
        </div>
      </main>
    </div>
  )
}

export default StatisticsPage
