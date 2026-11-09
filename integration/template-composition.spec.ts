import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { Context } from '../../DSH_pre/dsh/vendor/cordis/src/index.ts'
import { createClientModuleSystem, type ClientBundleRegistration, type ClientModuleLoaderTarget, type WebBootGraph } from '../../DSH_pre/dsh/packages/client/modules/src/client/index.ts'
import { afterEach, expect, it, vi } from 'vitest'
import { bootClient } from '../../DSH_pre/dsh/packages/client/web/src/boot-client.ts'

const contexts: Context[] = []
afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

class MockComponent {
  props: unknown
  constructor(props: unknown) { this.props = props }
}

it.each(['list', 'trend', 'workbench'])('activates the %s template through the real client loader', async name => {
  const root = new URL(`../templates/${name}/`, import.meta.url)
  const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))
  let registration: ClientBundleRegistration | undefined
  runInNewContext(readFileSync(new URL('lib/client.js', root), 'utf8'), {
    window: { __ModuleLoader__: { load: (value: ClientBundleRegistration) => { registration = value } } },
  })
  expect(registration).toBeDefined()
  const plugin = registration!.factory((moduleName: string) => {
    expect(moduleName).toBe('react')
    return {
      Component: MockComponent,
      createElement: vi.fn(),
      useCallback: vi.fn(),
      useEffect: vi.fn(),
      useMemo: vi.fn(),
      useRef: vi.fn(),
      useState: vi.fn(),
    }
  })
  const graph: WebBootGraph = {
    rev: 'test',
    entries: [
      { id: 'provider', url: '/provider.js', rev: 'test' },
      { id: pkg.name, url: `/${name}.js`, rev: 'test' },
    ],
    batches: [{ phase: 'application', url: '/application.js', rev: 'test', entries: ['provider', pkg.name] }],
  }
  const pendingQueue: ClientBundleRegistration[] = []
  const target: ClientModuleLoaderTarget = {
    mode: 'queue', pendingQueue,
    load: value => { pendingQueue.push(value) },
    create: options => createClientModuleSystem(target, { id: '@deepseek-ai/dsh-client-modules', exports: {} }, options),
  }
  const modules = target.create({
    boot: graph,
    staticModules: {
      provider: {
        apply: (ctx: Context) => {
          ctx.provide('slots', {
            register: vi.fn(),
            inject: async (_name: string, register: () => unknown) => await register(),
          })
          ctx.on('internal/get', (_pluginCtx, service, _error, next) => service === 'eaisData' ? { call: vi.fn() } : next())
        },
      },
      [pkg.name]: plugin,
    },
    loadBundle: async () => {},
  })
  const ctx = new Context()
  contexts.push(ctx)
  await bootClient({ ctx, modules, manifest: modules.manifest })
  const provider = ctx.get('slots') as { register: ReturnType<typeof vi.fn> }
  expect(provider.register).toHaveBeenCalledWith(
    { name: 'sidebar.panellist', id: '__PANEL__', order: 40, label: '__LABEL__' }, expect.any(Function),
  )
  expect(provider.register).toHaveBeenCalledWith(
    { name: 'main', key: '__PANEL__' }, expect.any(Function),
  )
})

it.each(['list', 'trend', 'workbench'])('template %s reads eaisData as a virtual service and handles delivery', name => {
  const source = readFileSync(new URL(`../templates/${name}/lib/client.js`, import.meta.url), 'utf8')
  expect(source).toContain('ctx.eaisData')
  expect(source).toContain("result.delivery === 'digest'")
  expect(source).not.toContain("ctx.get('eaisData')")
  expect(source).not.toContain('fetch(')
  expect(source).toContain('fetch failed')
})

it.each(['list', 'trend', 'workbench'])('template %s root section owns vertical scrolling and native design tokens', name => {
  const source = readFileSync(new URL(`../templates/${name}/lib/client.js`, import.meta.url), 'utf8')
  expect(source).toMatch(/height\s*:\s*100%/)
  expect(source).toMatch(/min-height\s*:\s*0/)
  expect(source).toMatch(/overflow\s*:\s*auto/)
  expect(source).toContain('--dsw-alias-label-primary')
  expect(source).toContain('role: \'alert\'')
})
