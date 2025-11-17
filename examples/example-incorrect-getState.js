const {createStore, createEvent, createEffect} = require('../npm/effector/effector.cjs.js')

console.log('❌ INCORRECT: getState() in effect\n')

const $balance = createStore(1000)
const transfer = createEvent()
const deductBalance = createEvent()

$balance.on(deductBalance, (balance, amount) => balance - amount)

const transferFx = createEffect(async ({amount, to}) => {
  const balance = $balance.getState()

  console.log(`[${to}] Balance check: ${balance}₽`)

  if (balance < amount) {
    throw new Error('Insufficient funds')
  }

  await new Promise(resolve => setTimeout(resolve, 30))

  deductBalance(amount)

  console.log(`[${to}] Transferred ${amount}₽, new balance: ${$balance.getState()}₽`)
})

transfer.watch(payload => transferFx(payload))

console.log(`Initial balance: ${$balance.getState()}₽`)
console.log('Executing two 600₽ transfers simultaneously...\n')

Promise.allSettled([
  transfer({amount: 600, to: 'Alice'}),
  transfer({amount: 600, to: 'Bob'})
]).then(() => {
  setTimeout(() => {
    const final = $balance.getState()

    console.log(`\nFinal balance: ${final}₽`)
    console.log(final < 0 ? '💥 OVERDRAFT!' : '✅ OK')
  }, 100)
})
