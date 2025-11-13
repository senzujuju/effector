// Пример 2: Стор, событие и эффект через sample
// При вызове события: обновление стора И вызов эффекта через один sample

const {createStore, createEvent, createEffect, sample} = require('../npm/effector/effector.cjs.js')

console.log('=== ПРИМЕР 2: Стор + Эффект через Sample ===\n')

// Создаем стор, событие и эффект
const $userData = createStore({name: 'Guest', points: 0})
const userAction = createEvent()
const saveToServerFx = createEffect(async (data) => {
  executionOrder.push(`[EFFECT-HANDLER] saveToServerFx.handler: saving ${JSON.stringify(data)}`)
  // Имитация асинхронного запроса
  await new Promise(resolve => setTimeout(resolve, 10))
  return {success: true, savedData: data}
})

let executionOrder = []

// 1. Обновляем стор при событии (приоритет: pure - 1)
$userData.on(userAction, (state, payload) => {
  const newState = {
    ...state,
    points: state.points + payload
  }
  executionOrder.push(`[PURE] $userData.on: points ${state.points} -> ${newState.points}`)
  return newState
})

// 2. Sample: читаем стор И вызываем эффект (приоритет: sampler - 4)
sample({
  source: $userData,
  clock: userAction,
  target: saveToServerFx
})

// 3. Watch на стор (приоритет: effect - 5)
$userData.watch((data) => {
  executionOrder.push(`[EFFECT] $userData.watch: ${JSON.stringify(data)}`)
})

// 4. Watch на событие (приоритет: effect - 5)
userAction.watch((payload) => {
  executionOrder.push(`[EFFECT] userAction.watch: payload = ${payload}`)
})

// 5. Watch на эффект перед выполнением (приоритет: effect - 5)
saveToServerFx.watch((params) => {
  executionOrder.push(`[EFFECT] saveToServerFx.watch (before): params = ${JSON.stringify(params)}`)
})

// 6. Watch на эффект после выполнения (приоритет: effect - 5)
saveToServerFx.done.watch(({params, result}) => {
  executionOrder.push(`[EFFECT] saveToServerFx.done: ${JSON.stringify(result)}`)
})

// 7. Watch на состояния эффекта
saveToServerFx.pending.watch((isPending) => {
  executionOrder.push(`[EFFECT] saveToServerFx.pending: ${isPending}`)
})

// ВЫПОЛНЕНИЕ
console.log('Вызываем userAction(100)\n')

userAction(100)

// Ждем завершения эффекта
setTimeout(() => {
  console.log('Порядок выполнения:')
  executionOrder.forEach((log, i) => console.log(`${i + 1}. ${log}`))

  console.log('\n--- Детальный анализ порядка выполнения ---')
  console.log('\nОчередь PURE (приоритет 1):')
  console.log('  ✓ $userData.on - обновление стора {points: 0 -> 100}')

  console.log('\nОчередь SAMPLER (приоритет 4):')
  console.log('  ✓ sample читает ОБНОВЛЕННОЕ значение $userData')
  console.log('  ✓ sample передает его в target: saveToServerFx')

  console.log('\nОчередь EFFECT (приоритет 5):')
  console.log('  ✓ userAction.watch')
  console.log('  ✓ $userData.watch')
  console.log('  ✓ saveToServerFx.pending (true)')
  console.log('  ✓ saveToServerFx.watch (before handler)')
  console.log('  ✓ saveToServerFx handler - начало выполнения')
  console.log('  ✓ saveToServerFx.done (после завершения async)')
  console.log('  ✓ saveToServerFx.pending (false)')

  console.log('\n--- Ключевые моменты ---')
  console.log('1. Стор обновляется ПЕРВЫМ (pure приоритет)')
  console.log('2. Sample видит УЖЕ обновленное значение (sampler приоритет)')
  console.log('3. Эффект получает обновленные данные через sample')
  console.log('4. Все watch срабатывают ПОСЛЕДНИМИ (effect приоритет)')
  console.log('5. Асинхронная часть эффекта выполняется вне очереди')

  console.log('\n\nТекущее состояние $userData:', $userData.getState())
}, 50)

// ВТОРОЙ СЦЕНАРИЙ: множественные обновления с batch
console.log('\n\n=== СЦЕНАРИЙ 2: Batch режим в sample ===\n')

setTimeout(() => {
  executionOrder = []

  const $counter = createStore(0)
  const tick = createEvent()
  const logFx = createEffect((value) => {
    executionOrder.push(`[EFFECT-HANDLER] logFx: received ${value}`)
    return value
  })

  // Обновляем счетчик при каждом tick
  $counter.on(tick, (state) => {
    const newState = state + 1
    executionOrder.push(`[PURE] $counter.on: ${state} -> ${newState}`)
    return newState
  })

  // Sample с batch: true (по умолчанию)
  sample({
    source: $counter,
    clock: tick,
    target: logFx,
    batch: true  // Выполнится в sampler очереди ПОСЛЕ всех pure обновлений
  })

  // Sample с batch: false
  const instantSample = sample({
    source: $counter,
    clock: tick,
    batch: false  // Выполнится в pure очереди ВМЕСТЕ с обновлениями
  })

  instantSample.watch((value) => {
    executionOrder.push(`[PURE->EFFECT] instantSample (batch:false): ${value}`)
  })

  console.log('Вызываем tick() три раза подряд\n')

  tick()
  tick()
  tick()

  setTimeout(() => {
    console.log('Порядок выполнения:')
    executionOrder.forEach((log, i) => console.log(`${i + 1}. ${log}`))

    console.log('\n--- Анализ batch режима ---')
    console.log('\nС batch: true (по умолчанию):')
    console.log('  • Все обновления стора выполняются в PURE очереди')
    console.log('  • Sample ждет завершения PURE очереди')
    console.log('  • Sample видит финальное значение после всех обновлений')

    console.log('\nС batch: false:')
    console.log('  • Sample срабатывает СРАЗУ после каждого обновления')
    console.log('  • Видит промежуточные значения')
    console.log('  • Меньше оптимизации, но быстрее реакция')

    console.log('\n\nФинальное значение $counter:', $counter.getState())
  }, 50)
}, 100)
