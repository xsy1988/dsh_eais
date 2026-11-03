import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { dependencyTreeDigest, hashPackageFiles } from '../src/guard/manifest.js'

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'eais-guard-'))
  mkdirSync(join(root, 'lib'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@corp/dsh-eais', version: '0.1.0' }))
  writeFileSync(join(root, 'cordis.patch.yml'), '- id: eais\n')
  writeFileSync(join(root, 'lib', 'index.js'), 'export const name = "eais"\n')
  return root
}

test('content hash is deterministic and changes with file content', () => {
  const root = fixture()
  try {
    const first = hashPackageFiles(root, ['lib'])
    const second = hashPackageFiles(root, ['lib'])
    assert.equal(first, second)
    assert.match(first, /^sha256:[0-9a-f]{64}$/)

    writeFileSync(join(root, 'lib', 'index.js'), 'export const name = "changed"\n')
    const changed = hashPackageFiles(root, ['lib'])
    assert.notEqual(first, changed)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('dependency tree digest is order independent', () => {
  const first = dependencyTreeDigest({ dependencies: { b: '2.0.0', a: '1.0.0' } })
  const second = dependencyTreeDigest({ dependencies: { a: '1.0.0', b: '2.0.0' } })
  assert.equal(first, second)
  assert.notEqual(first, dependencyTreeDigest({ dependencies: { a: '1.0.0', b: '2.0.1' } }))
})
