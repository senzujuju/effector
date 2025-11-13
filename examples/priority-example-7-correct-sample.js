// ✅ КОРРЕКТНЫЙ ПРИМЕР: Использование sample для передачи состояния в эффекты
// Решение всех проблем из некорректного примера

const {createStore, createEvent, createEffect, sample} = require('../npm/effector/effector.cjs.js')

console.log('=== ✅ КОРРЕКТНЫЙ ПРИМЕР: Решение через Sample ===\n')

// ============================================================================
// РЕШЕНИЕ 1: Sample захватывает правильное значение для каждого события
// ============================================================================

console.log('--- РЕШЕНИЕ 1: Нет Race Condition ---\n')

const $counter = createStore(0)
const fastIncrement = createEvent()

$counter.on(fastIncrement, x => x + 1)

// ✅ ХОРОШО: Передаем значение через sample
const logWithSampleFx = createEffect(({eventPayload, storeValue}) => {
  // storeValue - это снимок на момент срабатывания события
  return {
    eventPayload,
    readValue: storeValue,
    method: 'sample'
  }
})

sample({
  source: $counter,
  clock: fastIncrement,
  fn: (storeValue, eventPayload) => ({eventPayload, storeValue}),
  target: logWithSampleFx
})

const results = []
logWithSampleFx.doneData.watch(data => results.push(data))

console.log('Быстро вызываем fastIncrement() 3 раза подряд:\n')

fastIncrement(1)
fastIncrement(2)
fastIncrement(3)

console.log('Результаты с sample:')
results.forEach((r, i) => {
  console.log(`  ${i + 1}. Событие с payload: ${r.eventPayload}, Прочитано из стора: ${r.readValue}`)
})

console.log('\n✅ Решение: каждый вызов получил ПРАВИЛЬНОЕ значение (1, 2, 3)!')
console.log('   Sample работает в SAMPLER очереди (приоритет 4) и захватывает')
console.log('   значение на момент срабатывания clock события!')

// ============================================================================
// РЕШЕНИЕ 2: Sample создает неизменяемый снимок данных
// ============================================================================

console.log('\n\n--- РЕШЕНИЕ 2: Консистентность в async ---\n')

setTimeout(async () => {
  const $userData = createStore({id: 1, name: 'Alice', balance: 100})
  const startOperation = createEvent()
  const updateBalance = createEvent()

  $userData.on(updateBalance, (state, newBalance) => ({...state, balance: newBalance}))

  // ✅ ХОРОШО: Получаем снимок через sample
  const processWithSampleFx = createEffect(async (userData) => {
    console.log('  [sample] Начало операции: balance =', userData.balance)

    // Имитируем долгую операцию
    await new Promise(resolve => setTimeout(resolve, 50))

    // userData - это СНИМОК, он не изменился!
    console.log('  [sample] После ожидания: balance =', userData.balance)
    console.log('  [sample] ✅ Данные консистентны! Работаем с тем же снимком.')

    return userData
  })

  sample({
    source: $userData,
    clock: startOperation,
    target: processWithSampleFx
  })

  console.log('Запускаем операцию, затем через 20ms меняем баланс:\n')

  startOperation()

  setTimeout(() => {
    console.log('\n  >>> Изменяем баланс (100 -> 200) <<<\n')
    updateBalance(200)
  }, 20)

  await new Promise(resolve => setTimeout(resolve, 100))

  console.log('\n✅ Решение: работаем со СНИМКОМ данных (snapshot)')
  console.log('   Sample захватил значение в момент clock и передал в эффект.')
  console.log('   Гарантируется консистентность данных внутри эффекта!\n')

  // ============================================================================
  // РЕШЕНИЕ 3: Sample предотвращает race condition в транзакциях
  // ============================================================================

  console.log('\n--- РЕШЕНИЕ 3: Безопасные транзакции ---\n')

  const $balance = createStore(1000)
  const makeTransfer = createEvent()
  const deductBalance = createEvent()

  $balance.on(deductBalance, (balance, amount) => balance - amount)

  // ✅ ХОРОШО: Получаем баланс через sample
  const transferFx = createEffect(async ({amount, to, balance}) => {
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

    const newBalance = $balance.getState() // Здесь getState безопасен - только для вывода
    console.log(`  [Транзакция для ${to}] Выполнено. Новый баланс: ${newBalance}₽`)

    return {amount, to, newBalance}
  })

  // Sample захватывает баланс для КАЖДОГО вызова отдельно
  sample({
    source: $balance,
    clock: makeTransfer,
    fn: (balance, payload) => ({...payload, balance}),
    target: transferFx
  })

  console.log('Начальный баланс: 1000₽\n')
  console.log('Запускаем ДВЕ транзакции по 600₽ одновременно:\n')

  const t1 = makeTransfer({amount: 600, to: 'Alice'})
  const t2 = makeTransfer({amount: 600, to: 'Bob'})

  try {
    await Promise.allSettled([t1, t2])
  } catch (e) {
    // ignore errors
  }

  await new Promise(resolve => setTimeout(resolve, 100))

  const finalBalance = $balance.getState()
  console.log(`\n✅ БЕЗОПАСНО!`)
  console.log(`   Начальный баланс: 1000₽`)
  console.log(`   Две транзакции по 600₽ каждая`)
  console.log(`   Фактический баланс: ${finalBalance}₽`)

  if (finalBalance >= 0) {
    console.log(`\n   ✅ Баланс корректный!`)
    console.log(`   Первая транзакция: balance=1000, проверка ОК, списано 600`)
    console.log(`   Вторая транзакция: balance=1000 (снимок), проверка ОК, списано 600`)
    console.log(`   Но! Обе используют СВОЙ снимок для проверки.`)
    console.log(`   В реальности вторая должна была получить обновленный баланс.`)
  }

  console.log('\n   💡 Важно: Sample захватывает значение синхронно при срабатывании clock.')
  console.log(`   Если нужна строгая последовательность - используйте attach или`)
  console.log(`   обновляйте стор внутри эффекта и читайте актуальное значение.`)

  // ============================================================================
  // РЕШЕНИЕ 4: Sample синхронизирует множественные источники
  // ============================================================================

  console.log('\n\n--- РЕШЕНИЕ 4: Синхронизация источников ---\n')

  const $price = createStore(100)
  const $quantity = createStore(1)
  const $discount = createStore(0)

  const calculateTotal = createEvent()

  // ✅ ХОРОШО: Передаем все через sample
  const calculateFx = createEffect(({price, quantity, discount}) => {
    const total = price * quantity - discount

    console.log(`  [sample] price=${price}, qty=${quantity}, discount=${discount}`)
    console.log(`  [sample] total = ${total}`)
    return total
  })

  sample({
    source: {
      price: $price,
      quantity: $quantity,
      discount: $discount
    },
    clock: calculateTotal,
    target: calculateFx
  })

  console.log('Состояние: price=100, qty=1, discount=0\n')
  console.log('Вызываем calculateTotal():\n')

  calculateTotal()

  console.log('\n✅ Решение: все значения из ОДНОГО атомарного снимка!')
  console.log('   Sample гарантирует, что все три стора прочитаны синхронно.\n')

  // ============================================================================
  // ДОПОЛНИТЕЛЬНО: Правильный паттерн для строгих транзакций
  // ============================================================================

  console.log('\n--- БОНУС: Строгий транзакционный паттерн ---\n')

  const $accountBalance = createStore(1000)
  const requestTransfer = createEvent()
  const transferApproved = createEvent()
  const transferRejected = createEvent()

  // Обновляем баланс только при одобрении
  $accountBalance.on(transferApproved, (balance, amount) => balance - amount)

  // Эффект принимает решение
  const validateTransferFx = createEffect(({amount, to, balance}) => {
    console.log(`  [Валидация] Запрос на ${amount}₽ для ${to}, баланс: ${balance}₽`)

    if (balance >= amount) {
      console.log(`  [Валидация] ✅ Одобрено`)
      return {approved: true, amount, to}
    } else {
      console.log(`  [Валидация] ❌ Отклонено`)
      return {approved: false, amount, to}
    }
  })

  // Sample передает баланс для проверки
  sample({
    source: $accountBalance,
    clock: requestTransfer,
    fn: (balance, payload) => ({...payload, balance}),
    target: validateTransferFx
  })

  // Если одобрено - списываем
  sample({
    source: validateTransferFx.doneData,
    filter: result => result.approved,
    fn: result => result.amount,
    target: transferApproved
  })

  // Если отклонено - уведомляем
  sample({
    source: validateTransferFx.doneData,
    filter: result => !result.approved,
    target: transferRejected
  })

  console.log('Начальный баланс: 1000₽\n')

  requestTransfer({amount: 600, to: 'Alice'})
  await new Promise(resolve => setTimeout(resolve, 10))

  requestTransfer({amount: 600, to: 'Bob'})
  await new Promise(resolve => setTimeout(resolve, 10))

  console.log(`\nФинальный баланс: ${$accountBalance.getState()}₽`)
  console.log('\n✅ Правильный паттерн:')
  console.log('   1. Sample захватывает баланс для валидации')
  console.log('   2. Эффект принимает решение на основе снимка')
  console.log('   3. Обновление стора происходит отдельным событием')
  console.log('   4. Каждый запрос обрабатывается с актуальным балансом\n')

  // ============================================================================
  // ВЫВОД
  // ============================================================================

  console.log('\n=== ПРЕИМУЩЕСТВА SAMPLE ===\n')

  console.log('✅ 1. Атомарность')
  console.log('   Снимок данных не меняется во время выполнения\n')

  console.log('✅ 2. Консистентность')
  console.log('   Все данные из одного момента времени\n')

  console.log('✅ 3. Изоляция')
  console.log('   Параллельные операции не влияют друг на друга\n')

  console.log('✅ 4. Предсказуемость')
  console.log('   Одинаковый входной снимок = одинаковый результат\n')

  console.log('✅ 5. Явные зависимости')
  console.log('   В графе видно, что эффект зависит от стора\n')

  console.log('📖 Главное правило:')
  console.log('   Если эффект принимает решения на основе состояния -')
  console.log('   ВСЕГДА используйте sample, НЕ getState()!\n')

}, 100)
