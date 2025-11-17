const {createStore, createEvent, createEffect, sample} = require('../npm/effector/effector.cjs.js')

console.log('✅ CORRECT: sample for quota check\n')

const DAILY_LIMIT = 10

const $requestCount = createStore(0)
const requestApiCall = createEvent()
const approveRequest = createEvent()
const rejectRequest = createEvent()

$requestCount.on(approveRequest, count => count + 1)

const validateQuotaFx = createEffect(({endpoint, currentCount}) => {
  console.log(`[${endpoint}] Checking quota: ${currentCount}/${DAILY_LIMIT}`)

  if (currentCount >= DAILY_LIMIT) {
    return {approved: false, endpoint}
  }

  return {approved: true, endpoint}
})

const executeRequestFx = createEffect(async ({endpoint}) => {
  await new Promise(resolve => setTimeout(resolve, 20))
  return {endpoint}
})

sample({
  clock: requestApiCall,
  source: $requestCount,
  fn: (currentCount, {endpoint}) => ({endpoint, currentCount}),
  target: validateQuotaFx
})

sample({
  clock: validateQuotaFx.doneData,
  filter: ({approved}) => approved,
  fn: ({endpoint}) => ({endpoint}),
  target: [approveRequest, executeRequestFx]
})

sample({
  clock: validateQuotaFx.doneData,
  filter: ({approved}) => !approved,
  target: rejectRequest
})

sample({
  clock: executeRequestFx.done,
  source: $requestCount,
  fn: (count, {params}) => `[${params.endpoint}] Executed, total: ${count}`
}).watch(console.log)

sample({
  clock: rejectRequest,
  fn: ({endpoint}) => `[${endpoint}] Rejected`
}).watch(console.log)

console.log('Sending 12 parallel requests (limit is 10)...\n')

Array.from({length: 12}, (_, i) =>
  requestApiCall({endpoint: `/api/resource/${i + 1}`})
)

setTimeout(() => {
  const total = $requestCount.getState()
  const exceeded = total > DAILY_LIMIT

  console.log(`\nTotal requests executed: ${total}`)
  console.log(`Limit: ${DAILY_LIMIT}`)
  console.log(exceeded ? `💥 QUOTA EXCEEDED by ${total - DAILY_LIMIT}` : '✅ OK')
}, 300)
