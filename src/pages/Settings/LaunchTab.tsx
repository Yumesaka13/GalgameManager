// src/pages/settings/AppearanceTab.tsx
import { type ThemeMode } from '@bindings/ThemeMode'
import { Select, SettingRow, SettingSection, SwitchToggle } from '@components/ui/settings'
import { invoke } from '@tauri-apps/api/core'
import { useI18n } from '~/i18n'
import { useConfig } from '~/store'
import { type Component } from 'solid-js'
import toast from 'solid-toast'

export const LaunchTab: Component = () => {
  const { config, actions } = useConfig()
  const { t } = useI18n()

  const handleClearDailyStat = async () => {
    try {
      await invoke('clear_daily_playtime')
      toast.success(t('hint.syncSuccess'))
    } catch (e) {
      toast.error(String(e))
    }
  }

  return (
    <div class="max-w-4xl">
      <SettingSection title={t('settings.launch.timestat')}>
        <SettingRow
          label={t('settings.launch.precisionMode')}
          description={t('settings.launch.precisionModeDesc')}
        >
          <SwitchToggle
            checked={config.settings.launch.precisionMode}
            onChange={e => actions.updateSettings(s => (s.launch.precisionMode = e))}
          />
        </SettingRow>

        <SettingRow
          label={t('settings.launch.dailyStat')}
          description={t('settings.launch.dailyStatDesc')}
        >
          <SwitchToggle
            checked={config.settings.launch.dailyStat}
            onChange={e => actions.updateSettings(s => (s.launch.dailyStat = e))}
          />
        </SettingRow>

        <SettingRow
          label={t('settings.launch.clearDailyStat')}
          description={t('settings.launch.clearDailyStatDesc')}
        >
          <button
            class="px-4 py-1.5 text-sm font-medium rounded-md border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors"
            onClick={handleClearDailyStat}
          >
            {t('ui.delete')}
          </button>
        </SettingRow>
      </SettingSection>
    </div>
  )
}
