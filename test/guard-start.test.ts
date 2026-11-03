import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { startGuard } from '../src/guard/index.js'

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'eais-guard-start-'))
  mkdirSync(join(root, 'lib'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@corp/dsh-eais', version: '0.3.0' }))
  writeFileSync(join(root, 'cordis.patch.yml'), '- insert: []\n')
  writeFileSync(join(root, 'lib', 'index.js'), 'export const name = "eais"\n')
  return root
}

test('guard reports the merged package and releases its listeners on stop', async () => {
  const root = fixture()
  const events: string[] = []
  const disposals: string[] = []
  let report: { items?: Array<{ package_name?: string; version?: string }> } | undefined

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/software/report')) {
      report = JSON.parse(String(init?.body ?? '{}'))
      return new Response(JSON.stringify({ lease_until: '2099-01-01T00:00:00Z', report_interval_seconds: 3600 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const guard = startGuard({
    credentials: { resolve: () => 'token' },
    settingsController: {
      get: async () => undefined,
      update: async () => undefined,
    },
    on: (event) => {
      events.push(event)
      return () => disposals.push(event)
    },
  }, {
    packageRoot: root,
    include: ['lib'],
    fetchImpl,
  })

  try {
    await guard.ready
    assert.deepEqual(report?.items?.map((item) => item.package_name), ['@corp/dsh-eais'])
    assert.deepEqual(report?.items?.map((item) => item.version), ['0.3.0'])
    assert.deepEqual(events, ['agent/created', 'agent/disposed', 'tools/change'])
  } finally {
    await guard.stop()
    rmSync(root, { recursive: true, force: true })
  }

  assert.deepEqual(disposals, ['agent/created', 'agent/disposed', 'tools/change'])
})
