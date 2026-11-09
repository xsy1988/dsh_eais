import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ForgeSessionController } from '../src/guard/forge-session.js'
import { InstallPolicy } from '../src/guard/install-policy.js'
import { readManifest } from '../src/guard/manifest.js'

function runtime() {
  return {
    token: 'token',
    me: {
      staff: { no: 'E1001', name: '员工', dept: '部门' },
      mcp: { url: 'http://edge/mcp', serverName: 'eais', revision: 'r1' },
    },
  } as never
}

test('forge command mounts only the receiving agent and exits cleanly', async () => {
  const commands = new Map<string, (invocation: never) => unknown>()
  const mounted: string[] = []
  const modes: string[] = []
  const controller = new ForgeSessionController({
    commands: { register: (definition) => {
      const value = definition as { name: string, handler: (invocation: never) => unknown }
      commands.set(value.name, value.handler)
      return () => undefined
    } },
    on: () => () => undefined,
  }, {
    readSession: () => runtime(),
    fetchImpl: async (_input, init) => {
      modes.push(String(JSON.parse(String(init?.body)).mode))
      return new Response('{}', { status: 200 })
    },
  })
  const stop = controller.start()
  const agent = {
    session: { id: 'session-a' },
    ctx: { plugin: () => {
      mounted.push('session-a')
      return { dispose: () => undefined }
    } },
  }
  const result = await commands.get('插件创作')!({ agent } as never)
  assert.equal((result as { kind: string }).kind, 'success')
  assert.equal(controller.isForge('session-a'), true)
  assert.equal(controller.isForge('session-child'), false)
  assert.deepEqual(mounted, ['session-a'])
  await commands.get('插件创作')!({ agent } as never)
  assert.equal(controller.isForge('session-a'), false)
  assert.deepEqual(modes, ['forge', 'normal'])
  stop()
})

test('forge session survives guard recreation during bundle replacement', async () => {
  const commands = new Map<string, (invocation: never) => unknown>()
  const modes: string[] = []
  const context = {
    commands: { register: (definition: unknown) => {
      const value = definition as { name: string, handler: (invocation: never) => unknown }
      commands.set(value.name, value.handler)
      return () => undefined
    } },
    on: () => () => undefined,
  }
  const options = {
    readSession: () => runtime(),
    fetchImpl: async (_input: RequestInfo | URL, init?: RequestInit) => {
      modes.push(String(JSON.parse(String(init?.body)).mode))
      return new Response('{}', { status: 200 })
    },
  }
  const first = new ForgeSessionController(context, options)
  const stopFirst = first.start()
  const agent = {
    session: { id: 'session-reload' },
    ctx: { plugin: () => ({ dispose: () => undefined }) },
  }
  await commands.get('插件创作')!({ agent } as never)
  stopFirst()
  const second = new ForgeSessionController(context, options)
  const stopSecond = second.start()
  assert.equal(second.isForge('session-reload'), true)
  await second.exit('session-reload', true)
  assert.equal(second.isForge('session-reload'), false)
  assert.deepEqual(modes, ['forge', 'normal'])
  stopSecond()
})

test('install policy blocks ordinary execution and authorizes a signed absolute directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'eais-plugin-'))
  await mkdir(join(root, 'lib'))
  await writeFile(join(root, 'lib', 'index.js'), 'export function apply() {}')
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: '@local/demo', version: '0.1.0' }))
  const computed = readManifest(root, '@local/demo', ['lib', 'index.js', 'locale', 'icon.svg'])
  await writeFile(join(root, '.eais-plugin.json'), JSON.stringify({
    pluginNo: 'PN-2026-0001', ownerStaffNo: 'E1001', packageName: '@local/demo', version: '0.1.0',
    contentHash: computed.contentHash, signature: 'signed',
  }))
  const listeners = new Map<string, (...args: any[]) => unknown>()
  const controller = new ForgeSessionController({
    commands: { register: () => () => undefined }, on: () => () => undefined,
  }, { readSession: () => runtime(), fetchImpl: async () => new Response('{}', { status: 200 }) })
  const policy = new InstallPolicy({ credentials: { resolve: () => 'token' }, on: (event, listener) => listeners.set(event, listener) }, controller)
  policy.start()
  const ordinary = await listeners.get('tools/pre-execute')!({ name: 'run_code', arguments: {}, agent: { session: { id: 'ordinary' } } }, async () => 'next')
  assert.equal((ordinary as { kind: string }).kind, 'deny')
  const agent = { session: { id: 'forge', header: { cwd: root } }, ctx: { plugin: () => ({ dispose: () => undefined }) } }
  await controller.toggle({ agent })
  const authorized = await listeners.get('tools/pre-execute')!({
    name: 'plugin_manager', arguments: { action: 'install_bundle', target: root }, agent,
  }, async () => 'next')
  assert.equal(authorized, 'next')
  await writeFile(join(root, 'lib', 'index.js'), 'export function apply() { return "changed" }')
  const drift = await listeners.get('tools/pre-execute')!({
    name: 'plugin_manager', arguments: { action: 'install_bundle', target: root }, agent,
  }, async () => 'next') as { kind: string, reason: string }
  assert.equal(drift.kind, 'deny')
  assert.match(drift.reason, /先运行 verify，升级 package\.json 版本，再调用 plugin_check/)
  await writeFile(join(root, 'lib', 'index.js'), 'export function apply() {}')
  const relative = await listeners.get('tools/pre-execute')!({
    name: 'plugin_manager', arguments: { action: 'install_bundle', target: '@local/demo' }, agent,
  }, async () => 'next')
  assert.equal((relative as { kind: string }).kind, 'deny')
  await controller.exit('forge', false)
})
