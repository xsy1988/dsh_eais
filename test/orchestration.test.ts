import assert from 'node:assert/strict'
import test from 'node:test'
import {
  acceptResult, assertActionAllowed, createTaskContract, issueDelegation, loadGuidance, runBoundedSubagent, selectPath,
} from '../src/orchestration.js'

test('router uses templates, direct actions and jobs before subagents', () => {
  assert.equal(selectPath({ template: 'daily', directAction: 'read', jobAction: 'job' }), 'template')
  assert.equal(selectPath({ directAction: 'read', multiStep: true, bounded: true }), 'direct')
  assert.equal(selectPath({ jobAction: 'job', multiStep: true, bounded: true }), 'job')
  assert.equal(selectPath({ multiStep: true, bounded: true }), 'subagent')
  assert.equal(selectPath({ largeData: true }), 'analysis')
  assert.equal(selectPath({}), 'ask')
})

test('subagent contract is read-only and parent validates evidence', async () => {
  const contract = createTaskContract({ goal: 'summarize', runId: 'run-1', allowedActions: ['read'] })
  assert.equal(contract.readOnly, true)
  assert.throws(() => assertActionAllowed(contract, 'write', 'write', false))
  const envelope = {
    conclusion: 'done', confidence: 0.8, status: 'succeeded',
    evidence: { action: 'read', rows: 1, contractVersion: 'v1', runId: 'run-1' },
  }
  const result = await runBoundedSubagent({ spawn: async () => envelope }, contract)
  assert.equal(result.conclusion, 'done')
  assert.throws(() => acceptResult({ ...envelope, evidence: { ...envelope.evidence, runId: 'other' } }, contract))
})

test('delegation and guidance preserve versions and budget', async () => {
  const contract = createTaskContract({ goal: 'analyze', runId: 'run-2', allowedActions: ['read'] })
  const delegation = await issueDelegation(async (_input, init) => {
    const body = JSON.parse(String(init?.body))
    assert.equal(body.read_only, true)
    assert.equal(body.max_calls, 10)
    return new Response(JSON.stringify({ grant_id: 'deleg_1', run_id: 'run-2' }))
  }, 'http://localhost', 'token', contract)
  assert.equal(delegation.grant_id, 'deleg_1')
  const guidance = await loadGuidance({ read: async (uri) => ({ text: uri, versions: [uri + ':v1'] }) }, 'analyze')
  assert.deepEqual(guidance.versions, ['eais://guidance/base:v1', 'eais://guidance/task/analyze:v1'])
})
