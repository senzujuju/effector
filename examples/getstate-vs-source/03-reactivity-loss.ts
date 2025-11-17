/**
 * Пример 3: Потеря реактивности
 *
 * Проблема: getState() возвращает значение в момент вызова,
 * но не создает реактивную зависимость. Если стор изменится
 * после вызова getState(), но до использования значения,
 * изменение не будет учтено.
 */

import { createStore, createEvent, sample } from 'effector'

// Стор с настройками пользователя
const $userSettings = createStore({
  theme: 'light' as 'light' | 'dark',
  fontSize: 14,
  notifications: true,
})

const settingsChanged = createEvent<Partial<typeof $userSettings['defaultState']>>()

$userSettings.on(settingsChanged, (settings, updates) => ({
  ...settings,
  ...updates,
}))

// События для применения настроек
const applyTheme = createEvent<'light' | 'dark'>()
const applyFontSize = createEvent<number>()
const applyNotifications = createEvent<boolean>()

// ❌ НЕПРАВИЛЬНО: Использование getState()
// При изменении одной настройки не применяются другие актуальные значения
const applySettingsWithGetState = createEvent()

sample({
  clock: applySettingsWithGetState,
  fn: () => {
    // ПРОБЛЕМА: Получаем снимок состояния в момент вызова
    // Если настройки изменятся, мы об этом не узнаем
    const settings = $userSettings.getState()
    return settings.theme
  },
  target: applyTheme,
})

sample({
  clock: applySettingsWithGetState,
  fn: () => {
    const settings = $userSettings.getState()
    return settings.fontSize
  },
  target: applyFontSize,
})

sample({
  clock: applySettingsWithGetState,
  fn: () => {
    const settings = $userSettings.getState()
    return settings.notifications
  },
  target: applyNotifications,
})

// ✅ ПРАВИЛЬНО: Использование source
// Все зависимости явно объявлены и реактивны
const applySettingsWithSource = createEvent()

sample({
  clock: applySettingsWithSource,
  source: $userSettings,
  fn: (settings) => settings.theme,
  target: applyTheme,
})

sample({
  clock: applySettingsWithSource,
  source: $userSettings,
  fn: (settings) => settings.fontSize,
  target: applyFontSize,
})

sample({
  clock: applySettingsWithSource,
  source: $userSettings,
  fn: (settings) => settings.notifications,
  target: applyNotifications,
})

/**
 * Демонстрация проблемы:
 *
 * 1. Устанавливаем начальные настройки
 * 2. Меняем тему на dark
 * 3. Применяем настройки
 *
 * С getState(): Может применить старые значения, если они менялись
 * С source: Всегда применяет актуальные значения в момент срабатывания clock
 */
export const reactivityLossExample = {
  $userSettings,
  settingsChanged,
  applyTheme,
  applyFontSize,
  applyNotifications,
  applySettingsWithGetState,
  applySettingsWithSource,
}
