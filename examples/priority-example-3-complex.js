// Пример 3: Сложный сценарий с всеми приоритетами
// Демонстрация: child, pure, read, barrier, sampler, effect

const {createStore, createEvent, createEffect, sample, combine, forward} = require('../npm/effector/effector.cjs.js')

console.log('=== ПРИМЕР 3: Все приоритеты в одном сценарии ===\n')

let executionOrder = []

// Создаем базовые элементы
const trigger = createEvent()
const $price = createStore(100)
const $quantity = createStore(1)
const $discount = createStore(0)

// 1. CHILD приоритет: forward (приоритет 0)
const priceChanged = createEvent()
forward({
  from: priceChanged,
  to: $price
})

// 2. PURE приоритет: map (приоритет 1)
const doubled = $price.map((price) => {
  executionOrder.push(`[PURE] $price.map: ${price} -> ${price * 2}`)
  return price * 2
})

// 3. BARRIER приоритет: combine (приоритет 3)
const $total = combine(
  $price,
  $quantity,
  $discount,
  (price, qty, discount) => {
    const total = price * qty - discount
    executionOrder.push(`[BARRIER] combine: price=${price}, qty=${qty}, discount=${discount} -> ${total}`)
    return total
  }
)

// 4. SAMPLER приоритет: sample (приоритет 4)
const checkout = sample({
  source: $total,
  clock: trigger,
})

checkout.watch((total) => {
  executionOrder.push(`[SAMPLER->EFFECT] checkout.watch: total = ${total}`)
})

// 5. EFFECT приоритет: watch (приоритет 5)
$price.watch((price) => {
  executionOrder.push(`[EFFECT] $price.watch: ${price}`)
})

$quantity.watch((qty) => {
  executionOrder.push(`[EFFECT] $quantity.watch: ${qty}`)
})

$total.watch((total) => {
  executionOrder.push(`[EFFECT] $total.watch: ${total}`)
})

trigger.watch(() => {
  executionOrder.push(`[EFFECT] trigger.watch: fired`)
})

// Обновления для демонстрации
$price.on(trigger, (price) => {
  const newPrice = price + 50
  executionOrder.push(`[PURE] $price.on: ${price} -> ${newPrice}`)
  return newPrice
})

$quantity.on(trigger, (qty) => {
  const newQty = qty + 1
  executionOrder.push(`[PURE] $quantity.on: ${qty} -> ${newQty}`)
  return newQty
})

console.log('=== Начальное состояние ===')
console.log('$price:', $price.getState())
console.log('$quantity:', $quantity.getState())
console.log('$discount:', $discount.getState())
console.log('$total:', $total.getState())

console.log('\n=== Вызываем trigger() ===\n')

trigger()

console.log('\nПорядок выполнения:')
executionOrder.forEach((log, i) => console.log(`${i + 1}. ${log}`))

console.log('\n--- Детальный анализ ---')
console.log('\n📊 ОЧЕРЕДЬ CHILD (приоритет 0):')
console.log('   • forward() - перенаправление событий')
console.log('   • Внутренние связи графа вычислений')

console.log('\n🔄 ОЧЕРЕДЬ PURE (приоритет 1):')
console.log('   • $price.on(trigger) - обновление стора')
console.log('   • $quantity.on(trigger) - обновление стора')
console.log('   • $price.map() - производная')

console.log('\n📖 ОЧЕРЕДЬ READ (приоритет 2):')
console.log('   • Внутреннее чтение состояния для combine')
console.log('   • (не видно в логах, происходит внутри)')

console.log('\n🚧 ОЧЕРЕДЬ BARRIER (приоритет 3):')
console.log('   • combine() - синхронизация множества источников')
console.log('   • Ждет завершения всех PURE обновлений')

console.log('\n🎯 ОЧЕРЕДЬ SAMPLER (приоритет 4):')
console.log('   • sample() - выборка значения в момент clock')
console.log('   • Видит результат после BARRIER')

console.log('\n⚡ ОЧЕРЕДЬ EFFECT (приоритет 5):')
console.log('   • Все .watch() - побочные эффекты')
console.log('   • Выполняются ПОСЛЕДНИМИ')

console.log('\n=== Финальное состояние ===')
console.log('$price:', $price.getState())
console.log('$quantity:', $quantity.getState())
console.log('$total:', $total.getState())

console.log('\n\n=== СЦЕНАРИЙ 2: Цепочка forward (child приоритет) ===\n')

executionOrder = []

const event1 = createEvent()
const event2 = createEvent()
const event3 = createEvent()

// Цепочка forward (все приоритет child - 0)
forward({from: event1, to: event2})
forward({from: event2, to: event3})

event1.watch(() => executionOrder.push('[EFFECT] event1.watch'))
event2.watch(() => executionOrder.push('[EFFECT] event2.watch'))
event3.watch(() => executionOrder.push('[EFFECT] event3.watch'))

console.log('Вызываем event1()\n')
event1()

console.log('Порядок выполнения:')
executionOrder.forEach((log, i) => console.log(`${i + 1}. ${log}`))

console.log('\n--- Анализ ---')
console.log('Все forward выполняются в CHILD очереди (приоритет 0)')
console.log('Они распространяют значение ДО того, как сработают watch')
console.log('Поэтому все три watch видят событие и выполняются вместе')

console.log('\n\n=== СЦЕНАРИЙ 3: Разница между combine и sample ===\n')

executionOrder = []

const $a = createStore(1)
const $b = createStore(2)
const updateBoth = createEvent()

$a.on(updateBoth, x => {
  executionOrder.push(`[PURE] $a.on: ${x} -> ${x + 1}`)
  return x + 1
})

$b.on(updateBoth, x => {
  executionOrder.push(`[PURE] $b.on: ${x} -> ${x + 1}`)
  return x + 1
})

// combine (приоритет: barrier - 3)
const $combined = combine($a, $b, (a, b) => {
  executionOrder.push(`[BARRIER] combine: a=${a}, b=${b}`)
  return a + b
})

$combined.watch(sum => {
  executionOrder.push(`[EFFECT] $combined.watch: ${sum}`)
})

// sample (приоритет: sampler - 4)
const sampled = sample({
  source: {a: $a, b: $b},
  clock: updateBoth,
})

sampled.watch(({a, b}) => {
  executionOrder.push(`[SAMPLER->EFFECT] sampled.watch: a=${a}, b=${b}`)
})

console.log('Вызываем updateBoth()\n')
updateBoth()

console.log('Порядок выполнения:')
executionOrder.forEach((log, i) => console.log(`${i + 1}. ${log}`))

console.log('\n--- Анализ ---')
console.log('1. PURE: Оба стора обновляются одновременно')
console.log('2. BARRIER: combine реагирует на изменения (приоритет 3)')
console.log('3. SAMPLER: sample читает значения при clock (приоритет 4)')
console.log('4. EFFECT: Все watch выполняются последними (приоритет 5)')
console.log('\nВажно: combine (barrier) выполняется РАНЬШЕ чем sample (sampler)!')
