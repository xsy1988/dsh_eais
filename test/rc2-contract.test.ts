import test from 'node:test'
import assert from 'node:assert/strict'
import { apply as applyHost, createEaisHost } from '../src/index.js'
import { apply as applyClient } from '../src/client.js'
import { loginSession } from '../src/session.js'
import { readSettings, resolveVolatile, writeSettings } from '../src/port.js'

const SERVER = 'https://eais.example'

function me() {
  return {
    apiVersion: '1',
    staff: { no: 'E001', name: 'Test User', dept: 'R&D' },
    card: { expiresAt: new Date(Date.now() + 86_400_000).toISOString(), ttl: 300 },
    llm: { baseURL: SERVER, models: [{ id: 'm1', name: 'M1', contextWindow: 8192, maxTokens: 1024, reasoning: false }] },
  } as const
}

class MemorySettings {
  values: Record<string, unknown> = {}
  async get<T = unknown>(namespace: string): Promise<T | undefined> { return this.values[namespace] as T | undefined }
  async update(namespace: string, value: unknown) { this.values[namespace] = value }
}

class DescribeSettings {
  values: Record<string, unknown> = {}
  async describe() {
    return {
      ok: true,
      value: {
        namespaces: [{ ns: 'eais', value: this.values.eais, revision: 1 }],
      },
    }
  }
  async update(_namespace: string, value: unknown) {
    this.values.eais = value
    return { ok: true, value: {} }
  }
}

test('volatile configuration is unwrapped before use', () => {
  assert.equal(resolveVolatile('plain'), 'plain')
  assert.equal(resolveVolatile({ get: () => 'wrapped' }), 'wrapped')
})

test('describe/update remote settings use the EAIS namespace and unwrap results', async () => {
  const settings = new DescribeSettings()
  await writeSettings(settings, { serverUrl: SERVER })
  const value = await readSettings(settings)
  assert.equal(value.serverUrl, SERVER)
})

test('login sends a stable installation id and device name', async () => {
  const settings = new MemorySettings()
  const bodies: string[] = []
  const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(String(init?.body))
    return new Response(JSON.stringify({ token: 'token', expiresAt: new Date(Date.now() + 86_400_000).toISOString(), staff: me().staff }), { status: 200 })
  }
  const credentials = { set: async () => ({ ok: true, value: undefined }) }
  for (let index = 0; index < 2; index++) {
    await loginSession({ settings, credentials, fetchImpl, serverUrl: SERVER, staffNo: 'E001', password: 'password' })
  }
  const first = JSON.parse(bodies[0]!) as { installationId: string; deviceName: string }
  const second = JSON.parse(bodies[1]!) as { installationId: string; deviceName: string }
  assert.ok(first.installationId.startsWith('dsh-'))
  assert.equal(first.deviceName, 'DeepSeek Harness')
  assert.equal(second.installationId, first.installationId)
  assert.equal(second.deviceName, first.deviceName)
})

test('host apply returns a Cordis disposer and uses currentSelection', async () => {
  const settings = new DescribeSettings()
  const selections: unknown[] = []
  const ctx = {
    credentials: { resolve: async () => ({ value: 'token' }) },
    settingsController: settings,
    llm: { registerAdapter: () => Object.assign(() => undefined, { replace: () => undefined }) },
    agentDefaultModel: {
      currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-flash' }),
      saveSelection: async (selection: unknown) => { selections.push(selection) },
    },
    on: () => ({ dispose: () => undefined }),
  }
  const fetchImpl = async () => new Response(JSON.stringify(me()), { status: 200 })
  const host = await createEaisHost(ctx as never, { serverUrl: SERVER, fetchImpl: fetchImpl as never })
  assert.deepEqual(selections[0], { provider: 'eais', model: 'm1' })
  const disposer = await applyHost(ctx as never, { serverUrl: SERVER, fetchImpl: fetchImpl as never })
  assert.equal(typeof disposer, 'function')
  await host.dispose()
  await disposer()
})

test('client apply returns a Cordis disposer and registers through slots.inject', async () => {
  const registrations: unknown[] = []
  const ctx = {
    remote: {
      credentials: {},
      settings: new DescribeSettings(),
    },
    slots: {
      register: () => () => undefined,
      inject: (_name: string, register: () => unknown) => {
        registrations.push(register())
        return () => undefined
      },
    },
  }
  const disposer = await applyClient(ctx as never)
  assert.equal(typeof disposer, 'function')
  assert.equal(registrations.length, 4)
  await disposer()
})
