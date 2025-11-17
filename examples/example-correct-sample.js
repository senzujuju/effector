const {createStore, createEvent, createEffect, sample} = require('../npm/effector/effector.cjs.js')

console.log('✅ CORRECT: sample() for state passing\n')

const $balance = createStore(1000)
const requestTransfer = createEvent()
const approveTransfer = createEvent()
const rejectTransfer = createEvent()

$balance.on(approveTransfer, (balance, amount) => balance - amount)

const validateTransferFx = createEffect(async ({amount, to, balance}) => {
  console.log(`[${to}] Balance check: ${balance}₽`)

  if (balance < amount) {
    return {approved: false, to, amount}
  }

  await new Promise(resolve => setTimeout(resolve, 30))

  return {approved: true, to, amount}
})

sample({
  clock: requestTransfer,
  source: $balance,
  fn: (balance, {amount, to}) => ({balance, amount, to}),
  target: validateTransferFx
})

sample({
  clock: validateTransferFx.doneData,
  filter: ({approved}) => approved,
  fn: ({amount}) => amount,
  target: approveTransfer
})

sample({
  clock: validateTransferFx.doneData,
  filter: ({approved}) => !approved,
  target: rejectTransfer
})

sample({
  clock: approveTransfer,
  fn: (amount) => `Approved ${amount}₽`
}).watch(console.log)

sample({
  clock: rejectTransfer,
  fn: ({to}) => `Rejected: ${to}`
}).watch(console.log)

console.log(`Initial balance: ${$balance.getState()}₽`)
console.log('Executing two 600₽ transfers...\n')

requestTransfer({amount: 600, to: 'Alice'})

setTimeout(() => {
  requestTransfer({amount: 600, to: 'Bob'})

  setTimeout(() => {
    const final = $balance.getState()

    console.log(`\nFinal balance: ${final}₽`)
    console.log(final === 400 ? '✅ OK' : '💥 ERROR')
  }, 100)
}, 50)
