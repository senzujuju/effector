// Пример 4: Проблемы с store.getState() vs безопасность sample
// Демонстрация race conditions и потери синхронизации

const {createStore, createEvent, createEffect, sample} = require('../npm/effector/effector.cjs.js')

console.log('=== ПРИМЕР 4: getState() vs Sample ===\n')

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

// ✅ ХОРОШО: Использование sample для передачи значения
const logWithSampleFx = createEffect(({eventPayload, storeValue}) => {
  return {
    eventPayload,
    readValue: storeValue,
    method: 'sample'
  }
})

// Подключаем эффекты
fastIncrement.watch(payload => logWithGetStateFx(payload))

sample({
  source: $counter,
  clock: fastIncrement,
  fn: (storeValue, eventPayload) => ({eventPayload, storeValue}),
  target: logWithSampleFx
})

const results1 = []
logWithGetStateFx.doneData.watch(data => results1.push(data))

const results2 = []
logWithSampleFx.doneData.watch(data => results2.push(data))

console.log('Быстро вызываем fastIncrement() 3 раза подряд:\n')

fastIncrement(1)
fastIncrement(2)
fastIncrement(3)

console.log('Результаты с getState():')
results1.forEach((r, i) => {
  console.log(`  ${i + 1}. Payload: ${r.eventPayload}, Прочитано: ${r.readValue}`)
})

console.log('\nРезультаты с sample:')
results2.forEach((r, i) => {
  console.log(`  ${i + 1}. Payload: ${r.eventPayload}, Прочитано: ${r.readValue}`)
})

console.log('\n❌ Проблема с getState(): все 3 вызова прочитали ОДНО И ТО ЖЕ значение (3)!')
console.log('   Потому что эффекты выполняются в EFFECT очереди (приоритет 5),')
console.log('   а обновления $counter - в PURE очереди (приоритет 1).')
console.log('   К моменту выполнения эффектов счетчик уже = 3!\n')

console.log('✅ Решение с sample: каждый вызов получил ПРАВИЛЬНОЕ значение (1, 2, 3)')
console.log('   Sample работает в SAMPLER очереди (приоритет 4) и захватывает')
console.log('   значение в момент срабатывания clock события!\n')

// ============================================================================
// ПРОБЛЕМА 2: Асинхронный эффект - состояние меняется во время выполнения
// ============================================================================

console.log('\n--- ПРОБЛЕМА 2: Асинхронность ---\n')

setTimeout(async () => {
  const $userData = createStore({id: 1, name: 'Alice', balance: 100})
  const startOperation = createEvent()
  const updateUser = createEvent()

  $userData.on(updateUser, (state, newData) => ({...state, ...newData}))

  // ❌ ПЛОХО: Читаем состояние через getState в async эффекте
  const processWithGetStateFx = createEffect(async () => {
    const userBefore = $userData.getState()
    console.log('  [getState] Начало: user =', JSON.stringify(userBefore))

    // Имитируем долгую операцию (запрос к API, вычисления)
    await new Promise(resolve => setTimeout(resolve, 50))

    // За это время состояние могло измениться!
    const userAfter = $userData.getState()
    console.log('  [getState] После ожидания: user =', JSON.stringify(userAfter))
    console.log('  [getState] ❌ Данные изменились во время выполнения!')

    return userAfter
  })

  // ✅ ХОРОШО: Передаем значение через sample
  const processWithSampleFx = createEffect(async (userData) => {
    console.log('  [sample] Начало: user =', JSON.stringify(userData))

    await new Promise(resolve => setTimeout(resolve, 50))

    console.log('  [sample] После ожидания: user =', JSON.stringify(userData))
    console.log('  [sample] ✅ Работаем с тем же снимком данных!')

    return userData
  })

  startOperation.watch(() => processWithGetStateFx())

  sample({
    source: $userData,
    clock: startOperation,
    target: processWithSampleFx
  })

  console.log('Вызываем startOperation(), затем через 20ms меняем данные:\n')

  startOperation()

  // Через 20ms (пока эффекты еще выполняются) меняем данные
  setTimeout(() => {
    console.log('\n  >>> Изменяем пользователя (balance: 100 -> 200) <<<\n')
    updateUser({balance: 200})
  }, 20)

  await new Promise(resolve => setTimeout(resolve, 100))

  console.log('\n❌ Проблема с getState(): прочитали РАЗНЫЕ значения до и после await!')
  console.log('   Это может привести к багам: начали операцию с balance=100,')
  console.log('   а закончили с balance=200. Логика может сломаться!\n')

  console.log('✅ Решение с sample: работаем со СНИМКОМ данных (snapshot)')
  console.log('   Sample захватил значение в момент clock и передал его в эффект.')
  console.log('   Гарантируется консистентность данных внутри эффекта!\n')

  // ============================================================================
  // ПРОБЛЕМА 3: Множественные зависимости - синхронизация
  // ============================================================================

  console.log('\n--- ПРОБЛЕМА 3: Множественные зависимости ---\n')

  const $price = createStore(100)
  const $quantity = createStore(1)
  const $discount = createStore(0)
  const calculateTotal = createEvent()

  $price.on(calculateTotal, x => x * 1.1)
  $quantity.on(calculateTotal, x => x + 1)
  $discount.on(calculateTotal, x => x + 10)

  // ❌ ПЛОХО: Читаем несколько сторов через getState
  const calcWithGetStateFx = createEffect(() => {
    const price = $price.getState()
    const quantity = $quantity.getState()
    const discount = $discount.getState()
    const total = price * quantity - discount

    console.log(`  [getState] price=${price}, qty=${quantity}, discount=${discount} -> total=${total}`)
    return total
  })

  // ✅ ХОРОШО: Передаем все через sample
  const calcWithSampleFx = createEffect(({price, quantity, discount}) => {
    const total = price * quantity - discount

    console.log(`  [sample] price=${price}, qty=${quantity}, discount=${discount} -> total=${total}`)
    return total
  })

  calculateTotal.watch(() => calcWithGetStateFx())

  sample({
    source: {price: $price, quantity: $quantity, discount: $discount},
    clock: calculateTotal,
    target: calcWithSampleFx
  })

  console.log('Вызываем calculateTotal() (обновляет все 3 стора):\n')
  calculateTotal()

  console.log('\n❌ С getState(): читаем УЖЕ ОБНОВЛЕННЫЕ значения (price=110, qty=2, discount=10)')
  console.log('   Потому что эффект выполняется ПОСЛЕ всех обновлений в PURE очереди.\n')

  console.log('✅ С sample: получаем значения В МОМЕНТ срабатывания события')
  console.log('   Sample захватывает значения синхронно, до обновлений!\n')

  // ============================================================================
  // ВЫВОД
  // ============================================================================

  console.log('\n=== ИТОГОВЫЕ РЕКОМЕНДАЦИИ ===\n')

  console.log('❌ НЕ используйте getState() когда:')
  console.log('  1. События происходят быстро друг за другом')
  console.log('  2. Эффект асинхронный (async/await)')
  console.log('  3. Нужна синхронизация нескольких сторов')
  console.log('  4. Важна консистентность данных')
  console.log('  5. Состояние может измениться во время выполнения\n')

  console.log('✅ ИСПОЛЬЗУЙТЕ sample когда:')
  console.log('  1. Нужен снимок состояния в момент события')
  console.log('  2. Работаете с асинхронными эффектами')
  console.log('  3. Комбинируете несколько источников данных')
  console.log('  4. Нужна гарантия консистентности\n')

  console.log('💡 Когда getState() БЕЗОПАСЕН:')
  console.log('  1. Чтение для отладки/логирования')
  console.log('  2. Синхронные вычисления без side effects')
  console.log('  3. Чтение состояния вне графа Effector')
  console.log('  4. Получение текущего значения для UI (React/Vue/Solid)\n')

  console.log('📚 Главное правило:')
  console.log('  Если эффект зависит от стора - используйте sample!')
  console.log('  getState() - это "выход" из реактивного графа, используйте осторожно!\n')

}, 200)
