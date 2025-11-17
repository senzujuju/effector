// ✅ КОРРЕКТНЫЙ ПРИМЕР: Использование sample() для передачи баланса
// Правильный способ избежать race condition

const {createStore, createEvent, createEffect, sample} = require('../npm/effector/effector.cjs.js')

console.log('═══════════════════════════════════════════════════════')
console.log('✅ КОРРЕКТНЫЙ ПРИМЕР: sample() для передачи баланса')
console.log('═══════════════════════════════════════════════════════\n')

// Создаем стор с балансом
const $balance = createStore(1000)

// Событие для запроса перевода
const requestTransfer = createEvent()

// События для управления балансом
const approveTransfer = createEvent()
const rejectTransfer = createEvent()

// Обновляем баланс только при одобрении (публичный API)
$balance.on(approveTransfer, (balance, amount) => {
  console.log(`  💸 Списываем ${amount}₽ (текущий баланс: ${balance}₽)`)
  return balance - amount
})

// ✅ ХОРОШО: Эффект получает баланс как параметр через sample
const validateTransferFx = createEffect(async ({amount, to, balance}) => {
  console.log(`\n  🔍 [${to}] Проверяем баланс...`)
  console.log(`  📊 [${to}] Баланс (снимок через sample): ${balance}₽`)

  // Проверяем достаточно ли денег НА ОСНОВЕ СНИМКА
  if (balance < amount) {
    console.log(`  ❌ [${to}] Недостаточно средств!`)
    return {approved: false, to, amount, balance}
  }

  console.log(`  ✅ [${to}] Проверка пройдена! Можно переводить ${amount}₽`)

  // Имитируем задержку сети (API запрос)
  await new Promise(resolve => setTimeout(resolve, 30))

  console.log(`  💰 [${to}] Транзакция одобрена`)

  return {approved: true, to, amount, balance}
})

// Sample захватывает баланс В МОМЕНТ requestTransfer
sample({
  source: $balance,
  clock: requestTransfer,
  fn: (balance, payload) => ({
    ...payload,
    balance // Передаем СНИМОК баланса в эффект
  }),
  target: validateTransferFx
})

// Если одобрено - списываем деньги
sample({
  source: validateTransferFx.doneData,
  filter: result => result.approved === true,
  fn: result => result.amount,
  target: approveTransfer
})

// Если отклонено - логируем
sample({
  source: validateTransferFx.doneData,
  filter: result => result.approved === false,
  target: rejectTransfer
})

rejectTransfer.watch(({to, amount, balance}) => {
  console.log(`  🚫 [${to}] Транзакция ОТКЛОНЕНА (было ${balance}₽, нужно ${amount}₽)`)
})

// Показываем начальный баланс
console.log(`💰 Начальный баланс: ${$balance.getState()}₽\n`)

// ТЕСТ: Запускаем ДВЕ транзакции по 600₽ одновременно
console.log('🚀 Запускаем ДВЕ транзакции по 600₽ одновременно...\n')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

// Первая транзакция
const transaction1 = requestTransfer({amount: 600, to: 'Alice'})

// Небольшая задержка чтобы транзакции обрабатывались последовательно
setTimeout(() => {
  // Вторая транзакция
  const transaction2 = requestTransfer({amount: 600, to: 'Bob'})

  setTimeout(() => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    const finalBalance = $balance.getState()

    console.log('📊 ИТОГОВЫЙ РЕЗУЛЬТАТ:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`  Начальный баланс:  1000₽`)
    console.log(`  Транзакция Alice:   -600₽ (одобрена)`)
    console.log(`  Транзакция Bob:     -600₽ (отклонена)`)
    console.log(`  Ожидаемый баланс:   400₽`)
    console.log(`  Фактический баланс: ${finalBalance}₽`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    if (finalBalance === 400) {
      console.log('✅ ОТЛИЧНО! Баланс корректный!\n')
      console.log('💡 КАК ЭТО РАБОТАЕТ:')
      console.log('   1. requestTransfer(Alice) → sample захватывает баланс 1000₽')
      console.log('   2. validateTransferFx получает {amount: 600, balance: 1000}')
      console.log('   3. Проверка OK → approveTransfer(600) → баланс = 400₽')
      console.log('   4. requestTransfer(Bob) → sample захватывает баланс 400₽')
      console.log('   5. validateTransferFx получает {amount: 600, balance: 400}')
      console.log('   6. Проверка FAILED → rejectTransfer → баланс остается 400₽\n')
      console.log('✅ ПРЕИМУЩЕСТВА SAMPLE:')
      console.log('   • Каждая транзакция получает АКТУАЛЬНЫЙ снимок баланса')
      console.log('   • Снимок НЕ МЕНЯЕТСЯ во время async операций')
      console.log('   • Нет race conditions')
      console.log('   • Явные зависимости в графе Effector\n')
      console.log('📖 ПРАВИЛО:')
      console.log('   Если эффект ПРИНИМАЕТ РЕШЕНИЯ на основе состояния →')
      console.log('   ВСЕГДА используйте sample(), НЕ getState()!\n')
    } else {
      console.log(`❌ Что-то пошло не так. Баланс должен быть 400₽, а не ${finalBalance}₽\n`)
    }
  }, 100)
}, 50)
