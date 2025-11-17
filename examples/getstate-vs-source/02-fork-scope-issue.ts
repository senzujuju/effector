/**
 * Пример 2: Проблемы с Fork/Scope (критично для SSR)
 *
 * Проблема: getState() получает значение из глобального состояния,
 * игнорируя изолированный scope. Это критично для SSR, где каждый запрос
 * должен иметь свое изолированное состояние.
 */

import { createStore, createEffect, createEvent, sample, fork, allSettled } from 'effector'

// Создаем стор с корзиной покупок
const $cart = createStore<Array<{ id: number; name: string; price: number }>>([])
const addToCart = createEvent<{ id: number; name: string; price: number }>()
const clearCart = createEvent()

$cart
  .on(addToCart, (cart, item) => [...cart, item])
  .reset(clearCart)

// Эффект для расчета общей суммы заказа
const calculateTotalFx = createEffect<void, number>(async () => {
  // Имитация асинхронного расчета (например, с учетом скидок из API)
  await new Promise(resolve => setTimeout(resolve, 10))
  return 0 // заглушка
})

// ❌ НЕПРАВИЛЬНО: Использование getState() в эффекте
const calculateTotalWithGetStateFx = createEffect<void, number>(async () => {
  await new Promise(resolve => setTimeout(resolve, 10))

  // ПРОБЛЕМА: getState() всегда берет из глобального scope!
  // В SSR это приведет к утечке данных между запросами
  const cart = $cart.getState()

  const total = cart.reduce((sum, item) => sum + item.price, 0)
  return total
})

const calculateRequested = createEvent()

sample({
  clock: calculateRequested,
  target: calculateTotalWithGetStateFx,
})

// ✅ ПРАВИЛЬНО: Использование source
const calculateTotalWithSourceFx = createEffect<
  Array<{ id: number; name: string; price: number }>,
  number
>(async (cart) => {
  await new Promise(resolve => setTimeout(resolve, 10))

  // cart передается из source, учитывает текущий scope
  const total = cart.reduce((sum, item) => sum + item.price, 0)
  return total
})

sample({
  clock: calculateRequested,
  source: $cart,
  target: calculateTotalWithSourceFx,
})

/**
 * Демонстрация проблемы SSR:
 *
 * Сценарий: Два одновременных запроса к серверу
 * - Запрос 1: Пользователь А с товаром за 100р
 * - Запрос 2: Пользователь Б с товаром за 200р
 *
 * С getState(): Может произойти утечка данных - пользователь А увидит сумму Б
 * С source: Каждый запрос изолирован в своем scope
 */
export const forkScopeExample = {
  $cart,
  addToCart,
  clearCart,
  calculateRequested,
  calculateTotalWithGetStateFx,
  calculateTotalWithSourceFx,
}
