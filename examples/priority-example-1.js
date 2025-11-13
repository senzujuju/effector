// Пример 1: Базовый стор, событие, подписка через on и sample
// Демонстрация порядка выполнения: on (pure) vs sample (sampler)

const {createStore, createEvent, sample} = require('../npm/effector/effector.cjs.js')

console.log('=== ПРИМЕР 1: on vs sample ===\n')

// Создаем стор и события
const $counter = createStore(0)
const increment = createEvent()
const trigger = createEvent()

// Логирование для отслеживания порядка
let executionOrder = []

// 1. Обновление стора через on (приоритет: pure - 1)
$counter.on(increment, (state) => {
  const newState = state + 1
  executionOrder.push(`[PURE] $counter.on: ${state} -> ${newState}`)
  return newState
})

// 2. Подписка на изменения стора через watch (приоритет: effect - 5)
$counter.watch((value) => {
  executionOrder.push(`[EFFECT] $counter.watch: value = ${value}`)
})

// 3. Sample читает значение стора (приоритет: sampler - 4)
const sampled = sample({
  source: $counter,
  clock: trigger,
})

sampled.watch((value) => {
  executionOrder.push(`[EFFECT] sampled.watch: value = ${value}`)
})

// 4. Дополнительная логика на increment через watch (приоритет: effect - 5)
increment.watch(() => {
  executionOrder.push(`[EFFECT] increment.watch: triggered`)
})

// ВЫПОЛНЕНИЕ
console.log('Вызываем increment()\n')
increment()

console.log('\nПорядок выполнения:')
executionOrder.forEach((log, i) => console.log(`${i + 1}. ${log}`))

console.log('\n--- Анализ ---')
console.log('Порядок выполнения:')
console.log('1. [PURE] $counter.on - обновляет стор (приоритет 1)')
console.log('2. [EFFECT] increment.watch - побочный эффект (приоритет 5)')
console.log('3. [EFFECT] $counter.watch - побочный эффект (приоритет 5)')
console.log('\nВажно: on выполняется РАНЬШЕ всех watch, потому что pure < effect\n')

// ВТОРОЙ СЦЕНАРИЙ: вызов через trigger для sample
executionOrder = []
console.log('\n=== СЦЕНАРИЙ 2: Вызов trigger для sample ===\n')

console.log('Вызываем trigger()\n')
trigger()

console.log('\nПорядок выполнения:')
executionOrder.forEach((log, i) => console.log(`${i + 1}. ${log}`))

console.log('\n--- Анализ ---')
console.log('Sample сработал и прочитал текущее значение $counter')
console.log('Это произошло в приоритете sampler (4), но поскольку')
console.log('других операций не было, выполнилось сразу')

// ТРЕТИЙ СЦЕНАРИЙ: одновременное обновление и чтение через sample
executionOrder = []
console.log('\n\n=== СЦЕНАРИЙ 3: Одновременное обновление и sample ===\n')

const updateAndRead = createEvent()

// Обновляем стор (приоритет: pure - 1)
$counter.on(updateAndRead, (state) => {
  const newState = state + 10
  executionOrder.push(`[PURE] $counter.on(updateAndRead): ${state} -> ${newState}`)
  return newState
})

// Sample также срабатывает на updateAndRead (приоритет: sampler - 4)
const sampledOnUpdate = sample({
  source: $counter,
  clock: updateAndRead,
})

sampledOnUpdate.watch((value) => {
  executionOrder.push(`[SAMPLER->EFFECT] sampledOnUpdate.watch: value = ${value}`)
})

// Watch на само событие (приоритет: effect - 5)
updateAndRead.watch(() => {
  executionOrder.push(`[EFFECT] updateAndRead.watch: current store = ${$counter.getState()}`)
})

console.log('Вызываем updateAndRead()\n')
updateAndRead()

console.log('\nПорядок выполнения:')
executionOrder.forEach((log, i) => console.log(`${i + 1}. ${log}`))

console.log('\n--- Анализ ---')
console.log('Порядок:')
console.log('1. [PURE] $counter.on(updateAndRead) - обновление стора (приоритет 1)')
console.log('2. [SAMPLER] sample читает ОБНОВЛЕННОЕ значение (приоритет 4)')
console.log('3. [EFFECT] все watch выполняются последними (приоритет 5)')
console.log('\nКлючевой момент: sample видит УЖЕ обновленное значение,')
console.log('потому что pure (1) < sampler (4)!')

console.log('\n\nТекущее значение $counter:', $counter.getState())
