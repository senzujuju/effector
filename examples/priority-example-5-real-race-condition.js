// Пример 5: Реальная race condition с getState()
// Критический баг, который может возникнуть в продакшене

const {createStore, createEvent, createEffect, sample} = require('../npm/effector/effector.cjs.js')

console.log('=== ПРИМЕР 5: Критическая Race Condition ===\n')

// ============================================================================
// СЦЕНАРИЙ: Банковская транзакция
// ============================================================================

console.log('--- СЦЕНАРИЙ: Банковская транзакция ---\n')

const $balance = createStore(1000)
const $transactions = createStore([])

const makeTransfer = createEvent() // {amount, to}
const processTransaction = createEvent()

// Обновляем баланс при транзакции
$balance.on(processTransaction, (balance, amount) => balance - amount)

// Сохраняем историю транзакций
$transactions.on(processTransaction, (list, amount) => [
  ...list,
  {amount, timestamp: Date.now()}
])

// ❌ ПЛОХО: Используем getState для проверки баланса
const transferWithGetStateFx = createEffect(async ({amount, to}) => {
  // Проверяем баланс В НАЧАЛЕ операции
  const balanceBeforeCheck = $balance.getState()
  console.log(`  [getState] Попытка перевода ${amount}₽ для ${to}`)
  console.log(`  [getState] Баланс перед проверкой: ${balanceBeforeCheck}₽`)

  if (balanceBeforeCheck < amount) {
    console.log(`  [getState] ❌ Недостаточно средств!`)
    throw new Error('Insufficient funds')
  }

  // Имитируем задержку сети
  await new Promise(resolve => setTimeout(resolve, 30))

  // К этому моменту баланс мог измениться!
  const balanceAfterDelay = $balance.getState()
  console.log(`  [getState] Баланс после задержки: ${balanceAfterDelay}₽`)

  // Но мы все равно выполняем транзакцию с проверенной суммой
  processTransaction(amount)

  const finalBalance = $balance.getState()
  console.log(`  [getState] Финальный баланс: ${finalBalance}₽`)

  return {amount, to, balance: finalBalance}
})

// ✅ ХОРОШО: Используем sample для захвата баланса
const transferWithSampleFx = createEffect(async ({amount, to, balance}) => {
  console.log(`  [sample] Попытка перевода ${amount}₽ для ${to}`)
  console.log(`  [sample] Баланс (снимок): ${balance}₽`)

  if (balance < amount) {
    console.log(`  [sample] ❌ Недостаточно средств!`)
    throw new Error('Insufficient funds')
  }

  // Имитируем задержку сети
  await new Promise(resolve => setTimeout(resolve, 30))

  console.log(`  [sample] Баланс (снимок остался): ${balance}₽`)

  // Выполняем транзакцию
  processTransaction(amount)

  const finalBalance = $balance.getState()
  console.log(`  [sample] Финальный баланс: ${finalBalance}₽`)

  return {amount, to, balance: finalBalance}
})

// Подключение с getState
const useGetState = createEvent()
useGetState.watch(payload => transferWithGetStateFx(payload))

// Подключение с sample
const useSample = createEvent()
sample({
  source: $balance,
  clock: useSample,
  fn: (balance, payload) => ({...payload, balance}),
  target: transferWithSampleFx
})

// ============================================================================
// ТЕСТ 1: Две быстрые транзакции с getState (race condition!)
// ============================================================================

console.log('=== ТЕСТ 1: Две быстрые транзакции (getState) ===\n')
console.log('Начальный баланс: 1000₽\n')

setTimeout(async () => {
  console.log('Запускаем две транзакции по 600₽ одновременно:\n')

  // Запускаем две транзакции практически одновременно
  const promise1 = useGetState({amount: 600, to: 'Alice'})
  const promise2 = useGetState({amount: 600, to: 'Bob'})

  try {
    await Promise.allSettled([promise1, promise2])
  } catch (e) {
    // ignore
  }

  await new Promise(resolve => setTimeout(resolve, 100))

  const finalBalance = $balance.getState()
  console.log(`\n❌ КРИТИЧЕСКИЙ БАГ с getState():`)
  console.log(`   Начальный баланс: 1000₽`)
  console.log(`   Две транзакции по 600₽ = 1200₽`)
  console.log(`   Финальный баланс: ${finalBalance}₽`)

  if (finalBalance < 0) {
    console.log(`   💥 БАЛАНС УШЕЛ В МИНУС! Овердрафт на ${Math.abs(finalBalance)}₽`)
    console.log(`   Обе транзакции прошли проверку баланса одновременно,`)
    console.log(`   потому что обе читали начальное значение 1000₽!`)
  }

  // ============================================================================
  // ТЕСТ 2: Две быстрые транзакции с sample (безопасно!)
  // ============================================================================

  console.log('\n\n=== ТЕСТ 2: Две быстрые транзакции (sample) ===\n')

  // Сбрасываем состояние
  $balance.setState(1000)
  $transactions.setState([])

  console.log('Начальный баланс: 1000₽\n')
  console.log('Запускаем две транзакции по 600₽ одновременно:\n')

  const promise3 = useSample({amount: 600, to: 'Alice'})
  const promise4 = useSample({amount: 600, to: 'Bob'})

  try {
    await Promise.allSettled([promise3, promise4])
  } catch (e) {
    // ignore
  }

  await new Promise(resolve => setTimeout(resolve, 100))

  const finalBalance2 = $balance.getState()
  console.log(`\n✅ БЕЗОПАСНО с sample:`)
  console.log(`   Начальный баланс: 1000₽`)
  console.log(`   Две транзакции по 600₽ = 1200₽`)
  console.log(`   Финальный баланс: ${finalBalance2}₽`)

  if (finalBalance2 >= 0) {
    console.log(`   ✅ Баланс корректный! Одна транзакция была отклонена.`)
    console.log(`   Sample захватил баланс для каждой транзакции отдельно,`)
    console.log(`   но вторая транзакция получила уже обновленный снимок!`)
  }

  // ============================================================================
  // БОЛЕЕ СЛОЖНЫЙ СЦЕНАРИЙ: Проверка + действие
  // ============================================================================

  console.log('\n\n=== ТЕСТ 3: Сложная логика (проверка лимита) ===\n')

  const $dailyLimit = createStore(5000)
  const $todaySpent = createStore(0)

  $todaySpent.on(processTransaction, (spent, amount) => spent + amount)

  // ❌ ПЛОХО: Проверяем лимит через getState
  const buyWithGetStateFx = createEffect(async ({item, price}) => {
    const balance = $balance.getState()
    const todaySpent = $todaySpent.getState()
    const dailyLimit = $dailyLimit.getState()

    console.log(`  [getState] Покупка: ${item} за ${price}₽`)
    console.log(`  [getState] Баланс: ${balance}₽, Потрачено сегодня: ${todaySpent}₽, Лимит: ${dailyLimit}₽`)

    if (balance < price) {
      throw new Error('Недостаточно средств')
    }

    if (todaySpent + price > dailyLimit) {
      throw new Error('Превышен дневной лимит')
    }

    // Задержка
    await new Promise(resolve => setTimeout(resolve, 20))

    // За это время могли произойти другие покупки!
    const newTodaySpent = $todaySpent.getState()
    console.log(`  [getState] После задержки потрачено: ${newTodaySpent}₽`)

    processTransaction(price)
    console.log(`  [getState] ✅ Покупка завершена`)
  })

  // ✅ ХОРОШО: Передаем все через sample
  const buyWithSampleFx = createEffect(async ({item, price, balance, todaySpent, dailyLimit}) => {
    console.log(`  [sample] Покупка: ${item} за ${price}₽`)
    console.log(`  [sample] Баланс: ${balance}₽, Потрачено сегодня: ${todaySpent}₽, Лимит: ${dailyLimit}₽`)

    if (balance < price) {
      throw new Error('Недостаточно средств')
    }

    if (todaySpent + price > dailyLimit) {
      throw new Error('Превышен дневной лимит')
    }

    // Задержка
    await new Promise(resolve => setTimeout(resolve, 20))

    // Работаем со снимком данных
    console.log(`  [sample] Снимок данных не изменился: ${todaySpent}₽`)

    processTransaction(price)
    console.log(`  [sample] ✅ Покупка завершена`)
  })

  const buyWithGetState = createEvent()
  buyWithGetState.watch(payload => buyWithGetStateFx(payload))

  const buyWithSample = createEvent()
  sample({
    source: {
      balance: $balance,
      todaySpent: $todaySpent,
      dailyLimit: $dailyLimit
    },
    clock: buyWithSample,
    fn: (stores, payload) => ({...payload, ...stores}),
    target: buyWithSampleFx
  })

  // Сбрасываем
  $balance.setState(10000)
  $todaySpent.setState(4500)

  console.log('Начальное состояние: Баланс 10000₽, Потрачено сегодня: 4500₽, Лимит: 5000₽\n')
  console.log('Пытаемся купить два товара по 400₽ одновременно (сумма 4500+800=5300 > 5000):\n')

  const p1 = buyWithGetState({item: 'Ноутбук', price: 400})
  await new Promise(resolve => setTimeout(resolve, 5))
  const p2 = buyWithGetState({item: 'Телефон', price: 400})

  try {
    await Promise.allSettled([p1, p2])
  } catch (e) {}

  await new Promise(resolve => setTimeout(resolve, 50))

  console.log(`\n❌ С getState(): Потрачено сегодня: ${$todaySpent.getState()}₽`)
  console.log(`   Превысили лимит! Обе покупки прошли проверку одновременно.`)

  // С sample
  console.log('\n\nТеперь с sample:\n')

  $balance.setState(10000)
  $todaySpent.setState(4500)

  const p3 = buyWithSample({item: 'Ноутбук', price: 400})
  await new Promise(resolve => setTimeout(resolve, 5))
  const p4 = buyWithSample({item: 'Телефон', price: 400})

  try {
    await Promise.allSettled([p3, p4])
  } catch (e) {}

  await new Promise(resolve => setTimeout(resolve, 50))

  console.log(`\n✅ С sample: Потрачено сегодня: ${$todaySpent.getState()}₽`)
  console.log(`   Лимит не превышен! Sample гарантирует консистентность.`)

  // ============================================================================
  // ВЫВОД
  // ============================================================================

  console.log('\n\n=== КРИТИЧЕСКИЕ ВЫВОДЫ ===\n')

  console.log('🔥 getState() опасен в:')
  console.log('  1. Конкурентных операциях (race conditions)')
  console.log('  2. Асинхронных эффектах с бизнес-логикой')
  console.log('  3. Транзакционных сценариях (платежи, заказы)')
  console.log('  4. Проверках лимитов/квот\n')

  console.log('✅ sample гарантирует:')
  console.log('  1. Атомарность - снимок данных не меняется')
  console.log('  2. Консистентность - все данные из одного момента времени')
  console.log('  3. Изоляцию - параллельные операции не влияют друг на друга')
  console.log('  4. Предсказуемость - одинаковый результат при одинаковых входных данных\n')

  console.log('📖 Правило ACID для эффектов:')
  console.log('  Если эффект принимает решения на основе состояния -')
  console.log('  ВСЕГДА передавайте состояние через sample, НЕ через getState()!\n')

}, 100)
