/**
 * Пример 1: Race Condition при асинхронных операциях
 *
 * Проблема: При использовании getState() значение получается синхронно в момент вызова,
 * но между вызовом getState() и использованием значения, стор может измениться.
 * При использовании source - значение берется в момент срабатывания clock.
 */

import { createStore, createEffect, createEvent, sample } from 'effector'

// Общий стор с текущим пользователем
const $currentUser = createStore<{ id: number; name: string } | null>(null)
const userChanged = createEvent<{ id: number; name: string }>()
$currentUser.on(userChanged, (_, user) => user)

// Эффект для загрузки данных пользователя (имитация API запроса)
const loadUserDataFx = createEffect<number, { userId: number; data: string }>(
  async (userId: number) => {
    // Имитация задержки сети
    await new Promise(resolve => setTimeout(resolve, 100))
    return {
      userId,
      data: `Data for user ${userId}`,
    }
  }
)

// ❌ НЕПРАВИЛЬНО: Использование getState()
// Создаем эффект, который использует getState для получения userId
const loadDataWithGetStateFx = createEffect<void, { userId: number; data: string }>(
  async () => {
    // Получаем userId синхронно
    const user = $currentUser.getState()
    if (!user) {
      throw new Error('No user')
    }

    // ПРОБЛЕМА: Между этой строкой и вызовом loadUserDataFx
    // пользователь может измениться!
    const result = await loadUserDataFx(user.id)
    return result
  }
)

// Триггер для загрузки
const loadDataTriggered = createEvent()

// Связываем триггер с эффектом
sample({
  clock: loadDataTriggered,
  target: loadDataWithGetStateFx,
})

// ✅ ПРАВИЛЬНО: Использование source
const loadDataWithSourceFx = createEffect<number, { userId: number; data: string }>(
  async (userId: number) => {
    // userId передается как параметр из source
    const result = await loadUserDataFx(userId)
    return result
  }
)

// Используем sample с source - значение берется в момент срабатывания clock
sample({
  clock: loadDataTriggered,
  source: $currentUser,
  filter: (user): user is { id: number; name: string } => user !== null,
  fn: (user) => user.id,
  target: loadDataWithSourceFx,
})

/**
 * Демонстрация проблемы:
 *
 * 1. Устанавливаем пользователя с id=1
 * 2. Запускаем загрузку данных
 * 3. СРАЗУ меняем пользователя на id=2
 *
 * С getState(): Может загрузить данные для user 2 (race condition)
 * С source: Гарантированно загрузит данные для user 1
 */
export const raceConditionExample = {
  $currentUser,
  userChanged,
  loadDataTriggered,
  loadDataWithGetStateFx,
  loadDataWithSourceFx,
  loadUserDataFx,
}
