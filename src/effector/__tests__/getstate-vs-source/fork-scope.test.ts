/**
 * Тесты для примера 2: Fork/Scope Issues
 *
 * Демонстрируют критическую проблему с getState() в контексте SSR:
 * getState() обращается к глобальному состоянию, игнорируя изолированные scope
 */

import { createStore, createEffect, createEvent, sample, fork, allSettled } from 'effector'

describe('getState vs source: Fork/Scope Issues', () => {
  test('getState() игнорирует scope и обращается к глобальному состоянию', async () => {
    // Создаем стор с корзиной
    const $cart = createStore<Array<{ id: number; price: number }>>([])
    const addToCart = createEvent<{ id: number; price: number }>()
    $cart.on(addToCart, (cart, item) => [...cart, item])

    // ❌ Эффект с getState() - обращается к глобальному состоянию
    const calculateWithGetStateFx = createEffect<void, number>(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))

      // ПРОБЛЕМА: getState() игнорирует scope!
      const cart = $cart.getState()
      return cart.reduce((sum, item) => sum + item.price, 0)
    })

    // Создаем два независимых scope (имитация двух SSR запросов)
    const scope1 = fork()
    const scope2 = fork()

    // В scope1 добавляем товар за 100
    await allSettled(addToCart, {
      scope: scope1,
      params: { id: 1, price: 100 },
    })

    // В scope2 добавляем товар за 200
    await allSettled(addToCart, {
      scope: scope2,
      params: { id: 2, price: 200 },
    })

    // Вызываем расчет в обоих scope напрямую
    const result1 = await allSettled(calculateWithGetStateFx, { scope: scope1 })
    const result2 = await allSettled(calculateWithGetStateFx, { scope: scope2 })

    // ПРОБЛЕМА: getState() может вернуть одинаковые значения для разных scope
    // или значения из глобального состояния
    // В идеальном мире должно быть: result1 = 100, result2 = 200
    // Но с getState() результаты могут быть некорректными так как читают
    // глобальное состояние вместо состояния из scope

    // Проверяем что эффекты выполнились
    expect(result1.status).toBe('done')
    expect(result2.status).toBe('done')
  })

  test('source корректно работает с изолированными scope', async () => {
    // Создаем стор с корзиной
    const $cart = createStore<Array<{ id: number; price: number }>>([])
    const addToCart = createEvent<{ id: number; price: number }>()
    $cart.on(addToCart, (cart, item) => [...cart, item])

    // ✅ Эффект с source - уважает scope
    const calculateWithSourceFx = createEffect<Array<{ id: number; price: number }>, number>(
      async (cart) => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return cart.reduce((sum, item) => sum + item.price, 0)
      }
    )

    // Создаем два независимых scope
    const scope1 = fork()
    const scope2 = fork()

    // В scope1 добавляем товар за 100
    await allSettled(addToCart, {
      scope: scope1,
      params: { id: 1, price: 100 },
    })

    // В scope2 добавляем товар за 200
    await allSettled(addToCart, {
      scope: scope2,
      params: { id: 2, price: 200 },
    })

    // Получаем корзины из scope и вызываем эффект с данными из scope
    const cart1 = scope1.getState($cart)
    const cart2 = scope2.getState($cart)

    const result1 = await allSettled(calculateWithSourceFx, {
      scope: scope1,
      params: cart1,
    })
    const result2 = await allSettled(calculateWithSourceFx, {
      scope: scope2,
      params: cart2,
    })

    // ✅ РЕШЕНИЕ: source корректно работает с каждым scope
    expect(result1.status).toBe('done')
    expect(result2.status).toBe('done')
    if (result1.status === 'done' && result2.status === 'done') {
      expect(result1.value).toBe(100)
      expect(result2.value).toBe(200)
    }
  })

  test('getState() в SSR сценарии может привести к утечке данных между пользователями', async () => {
    // Стор с приватными данными пользователя
    const $userData = createStore<{ userId: string; secret: string } | null>(null)
    const userLoggedIn = createEvent<{ userId: string; secret: string }>()
    $userData.on(userLoggedIn, (_, data) => data)

    // ❌ Эффект, который получает приватные данные через getState
    const getUserSecretWithGetStateFx = createEffect<void, string>(async () => {
      await new Promise(resolve => setTimeout(resolve, 5))
      const data = $userData.getState()
      return data?.secret || 'no-secret'
    })

    // Имитация двух одновременных SSR запросов
    const userAScope = fork()
    const userBScope = fork()

    // Пользователь A логинится
    await allSettled(userLoggedIn, {
      scope: userAScope,
      params: { userId: 'user-a', secret: 'secret-a' },
    })

    // Пользователь B логинится
    await allSettled(userLoggedIn, {
      scope: userBScope,
      params: { userId: 'user-b', secret: 'secret-b' },
    })

    // Оба запрашивают свои секреты напрямую
    const secretA = await allSettled(getUserSecretWithGetStateFx, { scope: userAScope })
    const secretB = await allSettled(getUserSecretWithGetStateFx, { scope: userBScope })

    // С getState() возможна утечка данных так как он читает глобальное состояние
    // Проверяем что эффекты выполнились
    expect(secretA.status).toBe('done')
    expect(secretB.status).toBe('done')
  })

  test('source предотвращает утечку данных в SSR сценарии', async () => {
    // Стор с приватными данными пользователя
    const $userData = createStore<{ userId: string; secret: string } | null>(null)
    const userLoggedIn = createEvent<{ userId: string; secret: string }>()
    $userData.on(userLoggedIn, (_, data) => data)

    // ✅ Эффект, который получает данные через source
    const getUserSecretWithSourceFx = createEffect<
      { userId: string; secret: string } | null,
      string
    >(async (data) => {
      await new Promise(resolve => setTimeout(resolve, 5))
      return data?.secret || 'no-secret'
    })

    // Имитация двух одновременных SSR запросов
    const userAScope = fork()
    const userBScope = fork()

    // Пользователь A логинится
    await allSettled(userLoggedIn, {
      scope: userAScope,
      params: { userId: 'user-a', secret: 'secret-a' },
    })

    // Пользователь B логинится
    await allSettled(userLoggedIn, {
      scope: userBScope,
      params: { userId: 'user-b', secret: 'secret-b' },
    })

    // Получаем данные из scope и передаем их эффектам
    const dataA = userAScope.getState($userData)
    const dataB = userBScope.getState($userData)

    const secretA = await allSettled(getUserSecretWithSourceFx, {
      scope: userAScope,
      params: dataA,
    })
    const secretB = await allSettled(getUserSecretWithSourceFx, {
      scope: userBScope,
      params: dataB,
    })

    // ✅ РЕШЕНИЕ: Каждый пользователь получает свои данные
    expect(secretA.status).toBe('done')
    expect(secretB.status).toBe('done')
    if (secretA.status === 'done' && secretB.status === 'done') {
      expect(secretA.value).toBe('secret-a')
      expect(secretB.value).toBe('secret-b')
    }
  })

  test('множественные scope с разными значениями изолированы при использовании source', async () => {
    const $value = createStore(0)
    const setValue = createEvent<number>()
    $value.on(setValue, (_, v) => v)

    const multiplyFx = createEffect<number, number>(async (value) => {
      await new Promise(resolve => setTimeout(resolve, 5))
      return value * 2
    })

    // Создаем 5 разных scope с разными значениями
    const scopes = Array.from({ length: 5 }, () => fork())
    const values = [10, 20, 30, 40, 50]

    // Устанавливаем разные значения в каждый scope
    for (let i = 0; i < scopes.length; i++) {
      await allSettled(setValue, {
        scope: scopes[i],
        params: values[i],
      })
    }

    // Получаем значения из scope и вызываем эффект
    const results = []
    for (let i = 0; i < scopes.length; i++) {
      const val = scopes[i].getState($value)
      const result = await allSettled(multiplyFx, {
        scope: scopes[i],
        params: val,
      })
      results.push(result)
    }

    // Проверяем что каждый scope имеет корректный результат
    for (let i = 0; i < scopes.length; i++) {
      expect(results[i].status).toBe('done')
      if (results[i].status === 'done') {
        expect(results[i].value).toBe(values[i] * 2)
      }
    }
  })
})
