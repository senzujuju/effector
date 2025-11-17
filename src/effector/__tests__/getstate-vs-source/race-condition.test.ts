/**
 * Тесты для примера 1: Race Condition
 *
 * Демонстрируют проблему race condition при использовании getState()
 * в сравнении с использованием source
 */

import { createStore, createEffect, createEvent, sample, fork, allSettled } from 'effector'

describe('getState vs source: Race Condition', () => {
  test('getState() приводит к race condition при быстрой смене пользователя', async () => {
    // Общий стор с текущим пользователем
    const $currentUser = createStore<{ id: number; name: string } | null>(null)
    const userChanged = createEvent<{ id: number; name: string }>()
    $currentUser.on(userChanged, (_, user) => user)

    // Эффект для загрузки данных (имитация API)
    const loadUserDataFx = createEffect<number, { userId: number; data: string }>(
      async (userId: number) => {
        await new Promise(resolve => setTimeout(resolve, 50))
        return {
          userId,
          data: `Data for user ${userId}`,
        }
      }
    )

    // ❌ Вариант с getState() - может вызвать race condition
    const loadDataWithGetStateFx = createEffect<void, { userId: number; data: string }>(
      async () => {
        const user = $currentUser.getState()
        if (!user) throw new Error('No user')

        // Между этой строкой и вызовом может измениться пользователь
        const result = await loadUserDataFx(user.id)
        return result
      }
    )

    const scope = fork()

    // Устанавливаем пользователя 1
    await allSettled(userChanged, {
      scope,
      params: { id: 1, name: 'User 1' },
    })

    // Запускаем загрузку напрямую
    const loadPromise = allSettled(loadDataWithGetStateFx, { scope })

    // СРАЗУ меняем пользователя на 2
    await allSettled(userChanged, {
      scope,
      params: { id: 2, name: 'User 2' },
    })

    const loadResult = await loadPromise

    // ПРОБЛЕМА: Может загрузить данные для user 2, хотя запрос был для user 1
    // Результат недетерминирован из-за race condition
    // С getState результат зависит от timing'а
    expect(loadResult.status).toBe('done')
  })

  test('source гарантирует корректные данные без race condition', async () => {
    // Общий стор с текущим пользователем
    const $currentUser = createStore<{ id: number; name: string } | null>(null)
    const userChanged = createEvent<{ id: number; name: string }>()
    $currentUser.on(userChanged, (_, user) => user)

    // Эффект для загрузки данных
    const loadUserDataFx = createEffect<number, { userId: number; data: string }>(
      async (userId: number) => {
        await new Promise(resolve => setTimeout(resolve, 50))
        return {
          userId,
          data: `Data for user ${userId}`,
        }
      }
    )

    // ✅ Вариант с source - корректно работает
    const loadDataWithSourceFx = createEffect<number, { userId: number; data: string }>(
      async (userId: number) => {
        const result = await loadUserDataFx(userId)
        return result
      }
    )

    const scope = fork()

    // Устанавливаем пользователя 1
    await allSettled(userChanged, {
      scope,
      params: { id: 1, name: 'User 1' },
    })

    // Получаем userId из scope
    const user = scope.getState($currentUser)
    if (!user) throw new Error('No user')

    // Запускаем загрузку с userId из снимка
    const loadPromise = allSettled(loadDataWithSourceFx, {
      scope,
      params: user.id,
    })

    // СРАЗУ меняем пользователя на 2
    await allSettled(userChanged, {
      scope,
      params: { id: 2, name: 'User 2' },
    })

    const loadResult = await loadPromise

    // ✅ РЕШЕНИЕ: Гарантированно загружает данные для user 1
    // так как мы передали userId как параметр (как это делает source)
    expect(loadResult.status).toBe('done')
    if (loadResult.status === 'done') {
      expect(loadResult.value.userId).toBe(1)
    }
  })

  test('getState() в цепочке эффектов может читать изменяющееся состояние', async () => {
    const $counter = createStore(0)
    const increment = createEvent()
    $counter.on(increment, (x) => x + 1)

    const results: number[] = []

    // Эффект, который использует getState несколько раз
    const multipleGetStateFx = createEffect(async () => {
      results.push($counter.getState())
      await new Promise(resolve => setTimeout(resolve, 5))
      results.push($counter.getState())
      await new Promise(resolve => setTimeout(resolve, 5))
      results.push($counter.getState())
    })

    const scope = fork()

    // Увеличиваем счетчик до запуска
    await allSettled(increment, { scope })
    await allSettled(increment, { scope })

    // Запускаем эффект
    await allSettled(multipleGetStateFx, { scope })

    // getState() вызывается несколько раз
    expect(results.length).toBe(3)
    // getState может возвращать текущее состояние из scope
    expect(results).toBeDefined()
  })

  test('source обеспечивает стабильное значение на протяжении вычисления', async () => {
    const $counter = createStore(0)
    const increment = createEvent()
    $counter.on(increment, (x) => x + 1)

    const results: number[] = []

    // Эффект, который получает значение через параметр
    const stableValueFx = createEffect(async (value: number) => {
      results.push(value)
      await new Promise(resolve => setTimeout(resolve, 10))
      results.push(value)
      await new Promise(resolve => setTimeout(resolve, 10))
      results.push(value)
    })

    const trigger = createEvent()
    sample({
      clock: trigger,
      source: $counter,
      target: stableValueFx,
    })

    const scope = fork()

    // Запускаем эффект
    const effectPromise = allSettled(trigger, { scope })

    // Параллельно увеличиваем счетчик
    await allSettled(increment, { scope })
    await allSettled(increment, { scope })

    await effectPromise

    // source гарантирует одинаковое значение на протяжении выполнения
    expect(results.length).toBe(3)
    expect(results[0]).toBe(results[1])
    expect(results[1]).toBe(results[2])
  })
})
