import test from 'node:test'
import assert from 'node:assert/strict'
import { friendlyPluginError, selectPluginCard } from '../src/client/PluginCards.js'

const preview = JSON.stringify({
  eais: 'plugin-preview/v1', previewPath: '/tmp/demo/preview.html', candidatePackageName: '@eais/e1001.demo',
  panelId: 'eais-e1001-demo', displayName: '演示插件', access: [{ name: '客户查询' }],
})
const submitted = JSON.stringify({
  eais: 'plugin-submit/v1',
  plugin: { pluginNo: 'PN-2026-0001', displayName: '演示插件', panelId: 'eais-e1001-demo', currentVersion: '0.1.0' },
})

test('plugin cards select preview and require applied installation for completion', () => {
  assert.equal(selectPluginCard([{ toolName: 'mcp__eais__plugin_check', text: preview }])?.kind, 'preview')
  assert.equal(selectPluginCard([{ toolName: 'mcp__eais__plugin_submit', text: submitted }]), undefined)
  assert.equal(selectPluginCard([
    { toolName: 'mcp__eais__plugin_submit', text: submitted },
    { toolName: 'plugin_manager', text: '{"application":"restart-required"}' },
  ]), undefined)
  assert.equal(selectPluginCard([
    { toolName: 'mcp__eais__plugin_submit', text: submitted },
    { toolName: 'plugin_manager', text: '{"application":"applied"}' },
  ])?.kind, 'completed')
})

test('plugin errors use employee wording', () => {
  assert.equal(friendlyPluginError('E_SCOPE_DENIED', 'manifest verify failed'), '这个插件需要的数据权限目前不可用')
  assert.ok(!friendlyPluginError('E_CONTENT_LOCK', 'hash mismatch').includes('hash'))
})
