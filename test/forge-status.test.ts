import test from 'node:test'
import assert from 'node:assert/strict'
import { ForgeSessionController } from '../src/guard/forge-session.js'
import { formatForgeRemaining } from '../src/client/ForgeStatus.js'

test('forge command forwards its requirement and keeps an active session open for edits', async () => {
  const commands = new Map<string, (invocation: never) => unknown>()
  const messages: string[] = []
  const modes: string[] = []
  const controller = new ForgeSessionController({
    commands: { register: (definition) => {
      const value = definition as { name: string, handler: (invocation: never) => unknown }
      commands.set(value.name, value.handler)
      return () => undefined
    } },
    on: () => () => undefined,
  }, {
    readSession: () => ({
      token: 'token',
      me: { staff: { no: 'E1001', name: '员工', dept: '部门' }, mcp: { url: 'http://edge/mcp', serverName: 'eais' } },
    } as never),
    fetchImpl: async (_input, init) => {
      const mode = String(JSON.parse(String(init?.body)).mode)
      modes.push(mode)
      return new Response(JSON.stringify({ expiresAt: new Date(Date.now() + 7_200_000).toISOString() }), { status: 200 })
    },
  })
  const stop = controller.start()
  let allowed: string[] = []
  let lifted = false
  const agent = {
    session: { id: 'session-input' },
    ctx: {
      plugin: () => ({ dispose: () => undefined }),
      tools: {
        schemas: () => [{ name: 'read' }, { name: 'bash' }, { name: 'skill' }, { name: 'ask_user_question' }, { name: 'web_search' }],
        restrict: (filter: { allow: string[] }) => { allowed = filter.allow; return () => { lifted = true } },
      },
    },
    followup: (message: { content: Array<{ text: string }> }) => messages.push(message.content[0]!.text),
  }
  await commands.get('forge')!({ agent, rawInput: ' 看 A 级客户 ' } as never)
  await commands.get('forge')!({ agent, rawInput: ' 增加最后联系时间 ' } as never)
  assert.equal(controller.isForge('session-input'), true)
  assert.match(messages[0]!, /看 A 级客户/)
  assert.match(messages[1]!, /增加最后联系时间/)
  for (const name of ['eais-plugin-starter', 'eais-plugin-data', 'eais-plugin-ui', 'eais-plugin-check', 'eais-plugin-review']) {
    assert.ok(messages[0]!.includes(name), `missing ${name}`)
  }
  assert.deepEqual(modes, ['forge'])
  assert.deepEqual(allowed, ['read', 'bash', 'skill', 'ask_user_question'])
  await controller.exit('session-input', false)
  assert.equal(lifted, true)
  stop()
})

test('forge remaining time is bounded and readable', () => {
  assert.equal(formatForgeRemaining(3_661_000), '1:01:01')
  assert.equal(formatForgeRemaining(65_000), '1:05')
  assert.equal(formatForgeRemaining(-1), '0:00')
})
