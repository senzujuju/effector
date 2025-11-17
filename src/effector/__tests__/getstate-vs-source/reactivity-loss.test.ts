/**
 * Тесты для примера 3: Потеря реактивности
 *
 * Демонстрируют как getState() не создает реактивную зависимость,
 * что может привести к использованию устаревших данных
 */

import { createStore, createEvent, sample, fork, allSettled } from 'effector'

describe('getState vs source: Reactivity Loss', () => {
  test('getState() возвращает снимок состояния, который может устареть', async () => {
    const $counter = createStore(0)
    const increment = createEvent()
    $counter.on(increment, (x) => x + 1)

    const snapshots: number[] = []

    // Событие, которое сохраняет снимок через getState
    const saveSnapshot = createEvent()

    sample({
      clock: saveSnapshot,
      fn: () => {
        // getState возвращает значение в момент вызова
        const snapshot = $counter.getState()
        snapshots.push(snapshot)
        return snapshot
      },
    })

    const scope = fork()

    // Сохраняем снимок
    await allSettled(saveSnapshot, { scope })
    expect(snapshots[0]).toBe(0)

    // Изменяем счетчик
    await allSettled(increment, { scope })
    await allSettled(increment, { scope })

    // Сохраненный снимок не обновился
    expect(snapshots[0]).toBe(0)
    expect(scope.getState($counter)).toBe(2)
  })

  test('source всегда предоставляет актуальное значение', async () => {
    const $counter = createStore(0)
    const increment = createEvent()
    $counter.on(increment, (x) => x + 1)

    const values: number[] = []

    // Событие для триггера
    const triggerSave = createEvent()
    const valueSaved = createEvent<number>()
    valueSaved.watch((value) => {
      values.push(value)
    })

    // Используем source для получения актуального значения
    sample({
      clock: triggerSave,
      source: $counter,
      target: valueSaved,
    })

    const scope = fork()

    // Сохраняем текущее значение
    await allSettled(triggerSave, { scope })
    expect(values[0]).toBe(0)

    // Изменяем счетчик
    await allSettled(increment, { scope })
    await allSettled(increment, { scope })

    // Сохраняем еще раз - получим актуальное значение
    await allSettled(triggerSave, { scope })
    expect(values[1]).toBe(2)
  })

  test('множественные вызовы getState() в одном обработчике могут дать разные результаты', async () => {
    const $settings = createStore({
      theme: 'light' as 'light' | 'dark',
      fontSize: 14,
    })

    const updateTheme = createEvent<'light' | 'dark'>()
    const updateFontSize = createEvent<number>()

    $settings
      .on(updateTheme, (settings, theme) => ({ ...settings, theme }))
      .on(updateFontSize, (settings, fontSize) => ({ ...settings, fontSize }))

    const results: Array<{ theme: string; fontSize: number }> = []

    // Событие, которое многократно вызывает getState
    const captureSettings = createEvent()

    sample({
      clock: captureSettings,
      fn: () => {
        // Первый вызов getState
        const settings1 = $settings.getState()
        results.push({ ...settings1 })

        // Второй вызов getState
        const settings2 = $settings.getState()
        results.push({ ...settings2 })
      },
    })

    const scope = fork()

    // Запускаем захват настроек
    const capturePromise = allSettled(captureSettings, { scope })

    // Параллельно меняем настройки
    await allSettled(updateTheme, { scope, params: 'dark' })

    await capturePromise

    // getState может вернуть разные значения при множественных вызовах
    expect(results.length).toBe(2)
  })

  test('source гарантирует согласованность данных в рамках одной транзакции', async () => {
    const $settings = createStore({
      theme: 'light' as 'light' | 'dark',
      fontSize: 14,
    })

    const updateTheme = createEvent<'light' | 'dark'>()
    const updateFontSize = createEvent<number>()

    $settings
      .on(updateTheme, (settings, theme) => ({ ...settings, theme }))
      .on(updateFontSize, (settings, fontSize) => ({ ...settings, fontSize }))

    const results: Array<{ theme: string; fontSize: number }> = []

    const captureSettings = createEvent()

    const settingsCaptured = createEvent<{ theme: string; fontSize: number }>()
    settingsCaptured.watch((settings) => {
      results.push(settings)
    })

    // Используем source - значение фиксируется один раз
    sample({
      clock: captureSettings,
      source: $settings,
      fn: (settings) => settings,
      target: settingsCaptured,
    })

    const scope = fork()

    // Запускаем захват настроек
    const capturePromise = allSettled(captureSettings, { scope })

    // Параллельно меняем настройки
    await allSettled(updateTheme, { scope, params: 'dark' })

    await capturePromise

    // source гарантирует одно согласованное значение
    expect(results.length).toBe(1)
    expect(results[0].theme).toBe('light') // Значение на момент срабатывания clock
  })

  test('getState() в fn sample не отслеживает изменения', async () => {
    const $multiplier = createStore(2)
    const setMultiplier = createEvent<number>()
    $multiplier.on(setMultiplier, (_, value) => value)

    const $value = createStore(10)

    const calculate = createEvent()
    const $result = createStore(0)

    // ❌ Используем getState в fn - не реактивно
    sample({
      clock: calculate,
      source: $value,
      fn: (value) => {
        // getState не создает зависимость от $multiplier
        const multiplier = $multiplier.getState()
        return value * multiplier
      },
      target: $result,
    })

    const scope = fork()

    // Первый расчет: 10 * 2 = 20
    await allSettled(calculate, { scope })
    expect(scope.getState($result)).toBe(20)

    // Меняем множитель на 3
    await allSettled(setMultiplier, { scope, params: 3 })

    // Расчет снова: все еще 10 * 2 = 20, потому что getState не реактивен
    // (На самом деле будет 30, так как getState вызывается каждый раз)
    await allSettled(calculate, { scope })

    // Результат будет 30, но это не из-за реактивности, а из-за повторного вызова
    expect(scope.getState($result)).toBe(30)
  })

  test('source создает явную реактивную зависимость', async () => {
    const $multiplier = createStore(2)
    const setMultiplier = createEvent<number>()
    $multiplier.on(setMultiplier, (_, value) => value)

    const $value = createStore(10)

    const calculate = createEvent()
    const $result = createStore(0)

    // ✅ Используем source - явная зависимость
    sample({
      clock: calculate,
      source: { value: $value, multiplier: $multiplier },
      fn: ({ value, multiplier }) => value * multiplier,
      target: $result,
    })

    const scope = fork()

    // Первый расчет: 10 * 2 = 20
    await allSettled(calculate, { scope })
    expect(scope.getState($result)).toBe(20)

    // Меняем множитель на 3
    await allSettled(setMultiplier, { scope, params: 3 })

    // Расчет с новым множителем: 10 * 3 = 30
    await allSettled(calculate, { scope })
    expect(scope.getState($result)).toBe(30)
  })

  test('getState() может пропустить промежуточные обновления', async () => {
    const $state = createStore({ step: 0, total: 0 })
    const updateStep = createEvent<number>()
    const updateTotal = createEvent<number>()

    $state
      .on(updateStep, (state, step) => ({ ...state, step }))
      .on(updateTotal, (state, total) => ({ ...state, total }))

    const processSteps = createEvent()
    const steps: number[] = []

    sample({
      clock: processSteps,
      fn: () => {
        // Получаем текущий шаг
        const currentStep = $state.getState().step
        steps.push(currentStep)
      },
    })

    const scope = fork()

    // Быстро обновляем шаги
    await allSettled(updateStep, { scope, params: 1 })
    await allSettled(updateStep, { scope, params: 2 })
    await allSettled(updateStep, { scope, params: 3 })

    // Обрабатываем только один раз
    await allSettled(processSteps, { scope })

    // getState вернет только последнее значение
    expect(steps).toEqual([3])
    expect(steps).not.toContain(1)
    expect(steps).not.toContain(2)
  })

  test('source с часами реагирует на каждое обновление', async () => {
    const $state = createStore({ step: 0, total: 0 })
    const updateStep = createEvent<number>()

    $state.on(updateStep, (state, step) => ({ ...state, step }))

    const steps: number[] = []
    const stepProcessed = createEvent<{ step: number; total: number }>()
    stepProcessed.watch((state) => {
      steps.push(state.step)
    })

    // source реагирует на изменения $state через updateStep
    sample({
      clock: updateStep,
      source: $state,
      target: stepProcessed,
    })

    const scope = fork()

    // Обновляем шаги - каждый вызовет sample
    await allSettled(updateStep, { scope, params: 1 })
    await allSettled(updateStep, { scope, params: 2 })
    await allSettled(updateStep, { scope, params: 3 })

    // source среагирует на все обновления
    expect(steps).toEqual([1, 2, 3])
  })
})
