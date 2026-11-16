import test from 'node:test'
import assert from 'node:assert/strict'
import { writeSettingsWithRetry } from '../src/port.js'

test('settings writes retry nested HMR transactions without losing the update', async () => {
  let attempts = 0
  let saved: any
  await writeSettingsWithRetry({
    get: async () => undefined,
    update: async (_namespace, value) => {
      attempts++
      if (attempts < 3) throw new Error('HMR transactions cannot be nested')
      saved = value
    },
  }, { pluginSources: {} })
  assert.equal(attempts, 3)
  assert.deepEqual(saved.pluginSources, {})
})
