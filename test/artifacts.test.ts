import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { installPluginArtifact, packPlugin, uploadPluginArtifact } from '../src/guard/artifacts.js'

test('signed artifact uploads and installs through the host manager with matching hashes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'eais-artifact-source-'))
  const generated = spawnSync(process.execPath, [resolve('templates/scaffold.mjs'), '--template', 'list', '--target', root,
    '--package', '@eais/e1001.demo', '--action', 'crm.customer.read', '--label', '客户列表', '--description', '客户列表'], { encoding: 'utf8' })
  assert.equal(generated.status, 0, generated.stderr)
  const verified = spawnSync(process.execPath, [resolve('templates/verify.mjs'), root], { encoding: 'utf8' })
  assert.equal(verified.status, 0, verified.stdout)
  const manifest = JSON.parse(verified.stdout).manifest
  const signed = {
    pluginNo: 'PN-2026-0001', ownerStaffNo: 'E1001', packageName: manifest.package_name,
    version: manifest.version, contentHash: manifest.content_hash.replace(/^sha256:/, ''), signature: 'signed',
  }
  await writeFile(join(root, '.eais-plugin.json'), JSON.stringify(signed))
  const packed = await packPlugin(root)
  let uploaded = ''
  await uploadPluginArtifact(root, {
    serverUrl: 'http://edge', token: 'token',
    fetchImpl: async (_input, init) => { uploaded = String(init?.body); return new Response('{}', { status: 200 }) },
  })
  assert.equal(uploaded, packed)
  let installed = false
  const result = await installPluginArtifact(signed.pluginNo, signed.version, {
    serverUrl: 'http://edge', token: 'token',
    fetchImpl: async () => new Response(packed, { status: 200, headers: { 'x-eais-artifact-sha256': createHash('sha256').update(packed).digest('hex') } }),
    pluginManager: { installBundle: async target => {
      assert.equal(JSON.parse(await readFile(join(target, 'package.json'), 'utf8')).name, '@eais/e1001.demo')
      assert.equal(JSON.parse(await readFile(join(target, '.eais-plugin.json'), 'utf8')).signature, 'signed')
      installed = true
      return { application: 'applied' }
    } },
  })
  assert.equal(result.application, 'applied')
  assert.equal(installed, true)
})

test('packing rejects source drift after signing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'eais-artifact-drift-'))
  const generated = spawnSync(process.execPath, [resolve('templates/scaffold.mjs'), '--template', 'list', '--target', root,
    '--package', '@eais/e1001.demo', '--action', 'crm.customer.read', '--label', '客户列表', '--description', '客户列表'], { encoding: 'utf8' })
  assert.equal(generated.status, 0)
  await writeFile(join(root, '.eais-plugin.json'), JSON.stringify({ contentHash: '0'.repeat(64) }))
  await assert.rejects(() => packPlugin(root), /重新提交/)
})
