// ❌ НЕКОРРЕКТНЫЙ ПРИМЕР: Использование getState() в эффекте
// Демонстрация критического бага с балансом

const {createStore, createEvent, createEffect} = require('../npm/effector/effector.cjs.js')

console.log('═══════════════════════════════════════════════════════')
console.log('❌ НЕКОРРЕКТНЫЙ ПРИМЕР: getState() в эффекте')
console.log('═══════════════════════════════════════════════════════\n')

// Создаем стор с балансом
const $balance = createStore(1000)

// Событие для перевода денег
const transfer = createEvent()

// Событие для списания денег со счета
const deductBalance = createEvent()

// Обновляем баланс через событие (публичный API)
$balance.on(deductBalance, (balance, amount) => {
  console.log(`  💸 Списываем ${amount}₽ (текущий баланс: ${balance}₽)`)
  return balance - amount
})

// ❌ ПЛОХО: Эффект использует getState() для проверки баланса
const transferMoneyFx = createEffect(async ({amount, to}) => {
  console.log(`\n  🔍 [${to}] Проверяем баланс...`)

  // Читаем баланс через getState()
  const balance = $balance.getState()
  console.log(`  📊 [${to}] Баланс через getState(): ${balance}₽`)

  // Проверяем достаточно ли денег
  if (balance < amount) {
    console.log(`  ❌ [${to}] Недостаточно средств!`)
    throw new Error(`Недостаточно средств для ${to}`)
  }

  console.log(`  ✅ [${to}] Проверка пройдена! Можно переводить ${amount}₽`)

  // Имитируем задержку сети (API запрос)
  await new Promise(resolve => setTimeout(resolve, 30))

  // Списываем деньги
  deductBalance(amount)

  const newBalance = $balance.getState()
  console.log(`  💰 [${to}] Транзакция завершена. Новый баланс: ${newBalance}₽`)

  return {to, amount, newBalance}
})

// Подключаем эффект к событию transfer
transfer.watch(payload => transferMoneyFx(payload))

// Показываем начальный баланс
console.log(`💰 Начальный баланс: ${$balance.getState()}₽\n`)

// ТЕСТ: Запускаем ДВЕ транзакции по 600₽ одновременно
console.log('🚀 Запускаем ДВЕ транзакции по 600₽ одновременно...\n')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

// Первая транзакция
const transaction1 = transfer({amount: 600, to: 'Alice'})

// Вторая транзакция (практически одновременно)
const transaction2 = transfer({amount: 600, to: 'Bob'})

// Ждем завершения обеих транзакций
Promise.allSettled([transaction1, transaction2]).then(() => {
  setTimeout(() => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    const finalBalance = $balance.getState()

    console.log('📊 ИТОГОВЫЙ РЕЗУЛЬТАТ:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`  Начальный баланс:  1000₽`)
    console.log(`  Транзакция Alice:   -600₽`)
    console.log(`  Транзакция Bob:     -600₽`)
    console.log(`  Ожидаемый баланс:   400₽ (одна должна быть отклонена)`)
    console.log(`  Фактический баланс: ${finalBalance}₽`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    if (finalBalance < 0) {
      console.log('💥 КРИТИЧЕСКИЙ БАГ!')
      console.log(`   Баланс ушел в МИНУС! Овердрафт: ${Math.abs(finalBalance)}₽\n`)
      console.log('❌ ЧТО ПОШЛО НЕ ТАК:')
      console.log('   1. Обе транзакции вызвали getState() одновременно')
      console.log('   2. Обе получили одинаковое значение: 1000₽')
      console.log('   3. Обе прошли проверку (1000 >= 600)')
      console.log('   4. Обе списали по 600₽')
      console.log('   5. Результат: 1000 - 600 - 600 = -200₽\n')
      console.log('💡 ПРИЧИНА:')
      console.log('   getState() читает состояние в момент ВЫПОЛНЕНИЯ эффекта,')
      console.log('   а не в момент ВЫЗОВА события. К этому времени состояние')
      console.log('   может измениться другими параллельными операциями.\n')
      console.log('✅ РЕШЕНИЕ:')
      console.log('   Используйте sample() для передачи снимка баланса в эффект.')
      console.log('   Смотрите: example-correct-sample.js\n')
    } else {
      console.log('✅ Баланс корректный, проблема не воспроизвелась.\n')
    }
  }, 100)
})
