import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { readManifest } from '../src/guard/manifest.js'

const scaffoldTool = resolve('templates/scaffold.mjs')
const verifyTool = resolve('templates/verify.mjs')

interface VerifyOutput {
  valid: boolean
  errors: string[]
  manifest: {
    package_name: string
    version: string
    content_hash: string
    dependency_tree_digest: string
    eais_actions: string[]
  }
  next: string
}

function run(tool: string, args: string[]) {
  const result = spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' })
  const output = result.stdout || result.stderr
  return { status: result.status, output: JSON.parse(output) as VerifyOutput }
}

function generate(template: string, parent: string, packageName = `@local/${template}-test`) {
  const target = join(parent, template)
  const result = run(scaffoldTool, [
    '--template', template, '--target', target, '--package', packageName,
    '--action', 'erp.analytics.sales_trend', '--label', '销售趋势', '--description', '查看每月销售趋势',
  ])
  assert.equal(result.status, 0, JSON.stringify(result.output))
  return target
}

for (const template of ['trend', 'list', 'workbench']) {
  test(`scaffold generates a valid ${template} plugin with a guard-compatible manifest`, () => {
    const parent = mkdtempSync(join(tmpdir(), 'eais-scaffold-'))
    try {
      const root = generate(template, parent)
      const verified = run(verifyTool, [root])
      assert.equal(verified.status, 0, JSON.stringify(verified.output))
      assert.equal(verified.output.valid, true)
      assert.equal(verified.output.manifest.package_name, `@local/${template}-test`)
      assert.deepEqual(verified.output.manifest.eais_actions, ['erp.analytics.sales_trend'])
      const expected = readManifest(root, `@local/${template}-test`, ['lib', 'index.js', 'locale', 'icon.svg'])
      assert.equal(verified.output.manifest.content_hash, expected.contentHash)
      assert.equal(verified.output.manifest.dependency_tree_digest, expected.dependencyTreeDigest)
      assert.doesNotMatch(readFileSync(join(root, 'lib/client.js'), 'utf8'), /__[A-Z][A-Z_]*__/)
      assert.equal(JSON.parse(readFileSync(join(root, 'locale/zh.json'), 'utf8')).meta.title, '销售趋势')
    } finally {
      rmSync(parent, { recursive: true, force: true })
    }
  })
}

test('scaffold refuses to overwrite a non-empty target', () => {
  const parent = mkdtempSync(join(tmpdir(), 'eais-scaffold-'))
  try {
    const root = generate('list', parent)
    const result = run(scaffoldTool, [
      '--template', 'list', '--target', root, '--package', '@local/other',
      '--action', 'erp.analytics.sales_trend', '--label', '其他', '--description', '其他',
    ])
    assert.equal(result.status, 1)
    assert.match(result.output.errors[0]!, /拒绝覆盖/)
  } finally {
    rmSync(parent, { recursive: true, force: true })
  }
})

test('verify rejects forbidden data access and signed content drift', () => {
  const parent = mkdtempSync(join(tmpdir(), 'eais-scaffold-'))
  try {
    const root = generate('trend', parent)
    const verified = run(verifyTool, [root])
    const manifest = verified.output.manifest
    writeFileSync(join(root, '.eais-plugin.json'), JSON.stringify({
      pluginNo: 'PN-2026-0001', ownerStaffNo: 'E1001', packageName: manifest.package_name,
      version: manifest.version, contentHash: manifest.content_hash,
      dependencyTreeDigest: manifest.dependency_tree_digest, declaredActions: manifest.eais_actions,
      expandedActions: manifest.eais_actions, signature: 'signed',
    }))
    assert.equal(run(verifyTool, [root]).status, 0)
    writeFileSync(join(root, 'lib/index.js'), 'export function apply() { return "changed" }\n')
    const drift = run(verifyTool, [root])
    assert.equal(drift.status, 1)
    assert.match(drift.output.errors.join('\n'), /签名后插件内容已变化/)
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    pkg.version = '0.1.1'
    writeFileSync(join(root, 'package.json'), JSON.stringify(pkg))
    const upgraded = run(verifyTool, [root])
    assert.equal(upgraded.status, 0, JSON.stringify(upgraded.output))
    assert.match(upgraded.output.next, /plugin_submit/)
  } finally {
    rmSync(parent, { recursive: true, force: true })
  }
})

test('finalize applies the platform identity before signing and keeps preview unsigned', () => {
  const parent = mkdtempSync(join(tmpdir(), 'eais-finalize-'))
  try {
    const root = generate('list', parent)
    const before = readManifest(root, '@local/list-test', ['lib', 'index.js', 'locale', 'icon.svg'])
    const previewHash = readFileSync(join(root, 'preview.html'), 'utf8')
    const finalized = run(resolve('templates/finalize.mjs'), [
      '--target', root, '--package', '@eais/e1001.customer-watch', '--panel', 'eais-e1001-customer-watch', '--label', '客户看板',
    ])
    assert.equal(finalized.status, 0, JSON.stringify(finalized.output))
    const verified = run(verifyTool, [root])
    assert.equal(verified.status, 0, JSON.stringify(verified.output))
    assert.equal(verified.output.manifest.package_name, '@eais/e1001.customer-watch')
    assert.notEqual(verified.output.manifest.content_hash, before.contentHash)
    assert.equal(readFileSync(join(root, 'preview.html'), 'utf8'), previewHash)
    assert.ok(!readFileSync(join(root, 'lib/client.js'), 'utf8').includes('@local/list-test'))
  } finally {
    rmSync(parent, { recursive: true, force: true })
  }
})
