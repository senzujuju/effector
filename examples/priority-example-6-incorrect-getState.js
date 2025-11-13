// ❌ НЕКОРРЕКТНЫЙ ПРИМЕР: Использование getState() в эффектах
// Демонстрация проблем и багов

const {createStore, createEvent, createEffect, sample} = require('../npm/effector/effector.cjs.js')

console.log('=== ❌ НЕКОРРЕКТНЫЙ ПРИМЕР: Проблемы с getState() ===\n')

// ============================================================================
// ПРОБЛЕМА 1: Race Condition при быстрых обновлениях
// ============================================================================

console.log('--- ПРОБЛЕМА 1: Race Condition ---\n')

const $counter = createStore(0)
const fastIncrement = createEvent()

// Обновляем счетчик
$counter.on(fastIncrement, x => x + 1)

// ❌ ПЛОХО: Использование getState() внутри эффекта
const logWithGetStateFx = createEffect((eventPayload) => {
  // К моменту выполнения эффекта состояние может уже измениться!
  const currentValue = $counter.getState()
  return {
    eventPayload,
    readValue: currentValue,
    method: 'getState()'
  }
})

// Подключаем эффект
fastIncrement.watch(payload => logWithGetStateFx(payload))

const results = []
logWithGetStateFx.doneData.watch(data => results.push(data))

console.log('Быстро вызываем fastIncrement() 3 раза подряд:\n')

fastIncrement(1)
fastIncrement(2)
fastIncrement(3)

console.log('Результаты с getState():')
results.forEach((r, i) => {
  console.log(`  ${i + 1}. Событие с payload: ${r.eventPayload}, Прочитано из стора: ${r.readValue}`)
})

console.log('\n❌ Проблема: все 3 вызова прочитали ПОСЛЕДНЕЕ значение (3)!')
console.log('   Почему: эффекты выполняются в EFFECT очереди (приоритет 5),')
console.log('   а обновления $counter - в PURE очереди (приоритет 1).')
console.log('   К моменту выполнения эффектов счетчик уже обновился до 3!')

// ============================================================================
// ПРОБЛЕМА 2: Асинхронный эффект - состояние меняется во время выполнения
// ============================================================================

console.log('\n\n--- ПРОБЛЕМА 2: Асинхронность ---\n')

setTimeout(async () => {
  const $userData = createStore({id: 1, name: 'Alice', balance: 100})
  const startOperation = createEvent()
  const updateBalance = createEvent()

  $userData.on(updateBalance, (state, newBalance) => ({...state, balance: newBalance}))

  // ❌ ПЛОХО: Читаем состояние через getState в async эффекте
  const processWithGetStateFx = createEffect(async () => {
    const userBefore = $userData.getState()
    console.log('  [getState] Начало операции: balance =', userBefore.balance)

    // Имитируем долгую операцию (запрос к API)
    await new Promise(resolve => setTimeout(resolve, 50))

    // За это время состояние могло измениться!
    const userAfter = $userData.getState()
    console.log('  [getState] После ожидания: balance =', userAfter.balance)

    if (userBefore.balance !== userAfter.balance) {
      console.log('  [getState] ❌ БАЛАНС ИЗМЕНИЛСЯ ВО ВРЕМЯ ОПЕРАЦИИ!')
      console.log('  [getState] Это может привести к багам в бизнес-логике!')
    }

    return userAfter
  })

  startOperation.watch(() => processWithGetStateFx())

  console.log('Запускаем операцию, затем через 20ms меняем баланс:\n')

  startOperation()

  // Через 20ms (пока эффект еще выполняется) меняем баланс
  setTimeout(() => {
    console.log('\n  >>> Изменяем баланс (100 -> 200) <<<\n')
    updateBalance(200)
  }, 20)

  await new Promise(resolve => setTimeout(resolve, 100))

  console.log('\n❌ Проблема: прочитали РАЗНЫЕ значения до и после await!')
  console.log('   Это может привести к багам: начали с balance=100,')
  console.log('   а закончили с balance=200. Логика может сломаться!\n')

  // ============================================================================
  // ПРОБЛЕМА 3: Критическая race condition - банковская транзакция
  // ============================================================================

  console.log('\n--- ПРОБЛЕМА 3: Критическая Race Condition ---\n')

  const $balance = createStore(1000)
  const makeTransfer = createEvent()
  const deductBalance = createEvent()

  // Списываем деньги
  $balance.on(deductBalance, (balance, amount) => balance - amount)

  // ❌ ПЛОХО: Проверяем баланс через getState
  const transferFx = createEffect(async ({amount, to}) => {
    const balance = $balance.getState()
    console.log(`  [Транзакция для ${to}] Проверка: баланс = ${balance}₽, сумма = ${amount}₽`)

    if (balance < amount) {
      console.log(`  [Транзакция для ${to}] ❌ Недостаточно средств`)
      throw new Error('Insufficient funds')
    }

    console.log(`  [Транзакция для ${to}] ✅ Проверка пройдена`)

    // Имитируем задержку сети
    await new Promise(resolve => setTimeout(resolve, 30))

    // Списываем деньги
    deductBalance(amount)

    const newBalance = $balance.getState()
    console.log(`  [Транзакция для ${to}] Выполнено. Новый баланс: ${newBalance}₽`)

    return {amount, to, newBalance}
  })

  makeTransfer.watch(payload => transferFx(payload))

  console.log('Начальный баланс: 1000₽\n')
  console.log('Запускаем ДВЕ транзакции по 600₽ одновременно:\n')

  // Запускаем две транзакции практически одновременно
  const t1 = makeTransfer({amount: 600, to: 'Alice'})
  const t2 = makeTransfer({amount: 600, to: 'Bob'})

  await Promise.allSettled([t1, t2])

  await new Promise(resolve => setTimeout(resolve, 100))

  const finalBalance = $balance.getState()
  console.log(`\n💥 КРИТИЧЕСКИЙ БАГ!`)
  console.log(`   Начальный баланс: 1000₽`)
  console.log(`   Две транзакции по 600₽ каждая`)
  console.log(`   Ожидаемый результат: одна отклонена, баланс = 400₽`)
  console.log(`   Фактический баланс: ${finalBalance}₽`)

  if (finalBalance < 0) {
    console.log(`\n   ❌❌❌ БАЛАНС УШЕЛ В МИНУС! Овердрафт ${Math.abs(finalBalance)}₽`)
    console.log(`   Обе транзакции прошли проверку одновременно,`)
    console.log(`   потому что обе прочитали начальное значение 1000₽!`)
  }

  // ============================================================================
  // ПРОБЛЕМА 4: Множественные зависимости - несинхронизированные данные
  // ============================================================================

  console.log('\n\n--- ПРОБЛЕМА 4: Множественные зависимости ---\n')

  const $price = createStore(100)
  const $quantity = createStore(1)
  const $discount = createStore(0)

  const updateAll = createEvent()
  const calculateTotal = createEvent()

  $price.on(updateAll, x => x * 1.5)
  $quantity.on(updateAll, x => x + 1)
  $discount.on(updateAll, x => x + 10)

  // ❌ ПЛОХО: Читаем несколько сторов через getState
  const calculateFx = createEffect(() => {
    const price = $price.getState()
    const quantity = $quantity.getState()
    const discount = $discount.getState()
    const total = price * quantity - discount

    console.log(`  [getState] price=${price}, qty=${quantity}, discount=${discount}`)
    console.log(`  [getState] total = ${total}`)
    return total
  })

  calculateTotal.watch(() => calculateFx())

  console.log('Начальное состояние: price=100, qty=1, discount=0\n')
  console.log('Вызываем updateAll() (обновляет все 3 стора), затем calculateTotal():\n')

  updateAll()
  calculateTotal()

  console.log('\n❌ Проблема: прочитали УЖЕ ОБНОВЛЕННЫЕ значения')
  console.log('   Если мы хотели захватить значения ДО обновления - не получится!')
  console.log('   getState() всегда возвращает ТЕКУЩЕЕ состояние, не снимок.\n')

  // ============================================================================
  // ВЫВОД
  // ============================================================================

  console.log('\n=== ИТОГОВЫЕ ПРОБЛЕМЫ С getState() ===\n')

  console.log('❌ 1. Race Condition')
  console.log('   При быстрых событиях все эффекты читают последнее значение\n')

  console.log('❌ 2. Асинхронная несогласованность')
  console.log('   Значение до await !== значение после await\n')

  console.log('❌ 3. Критические баги в транзакциях')
  console.log('   Баланс может уйти в минус, лимиты могут быть превышены\n')

  console.log('❌ 4. Нет гарантии синхронизации')
  console.log('   Множественные getState() могут вернуть данные из разных моментов\n')

  console.log('💡 РЕШЕНИЕ: Используйте sample вместо getState()!')
  console.log('   Смотрите корректный пример в: priority-example-6-correct-sample.js\n')

}, 100)
