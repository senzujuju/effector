const {createStore, createEvent, createEffect, sample} = require('../npm/effector/effector.cjs.js')

console.log('❌ INCORRECT: getState for quota check\n')

const DAILY_LIMIT = 10

const $requestCount = createStore(0)
const makeApiRequest = createEvent()
const incrementCount = createEvent()

$requestCount.on(incrementCount, count => count + 1)

const apiRequestFx = createEffect(async ({endpoint}) => {
  const currentCount = $requestCount.getState()

  console.log(`[${endpoint}] Checking quota: ${currentCount}/${DAILY_LIMIT}`)

  if (currentCount >= DAILY_LIMIT) {
    throw new Error('Quota exceeded')
  }

  await new Promise(resolve => setTimeout(resolve, 20))

  incrementCount()

  console.log(`[${endpoint}] Request completed, count: ${$requestCount.getState()}`)

  return {endpoint, success: true}
})

sample({
  clock: makeApiRequest,
  target: apiRequestFx
})

console.log('Sending 12 parallel requests (limit is 10)...\n')

const requests = Array.from({length: 12}, (_, i) =>
  makeApiRequest({endpoint: `/api/resource/${i + 1}`})
)

Promise.allSettled(requests).then(() => {
  setTimeout(() => {
    const total = $requestCount.getState()
    const exceeded = total > DAILY_LIMIT

    console.log(`\nTotal requests executed: ${total}`)
    console.log(`Limit: ${DAILY_LIMIT}`)
    console.log(exceeded ? `💥 QUOTA EXCEEDED by ${total - DAILY_LIMIT}` : '✅ OK')
  }, 100)
})
