#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const bundles = process.env.EAIS_PLUGIN_BUNDLE_ROOT
if (!bundles) throw new Error('EAIS_PLUGIN_BUNDLE_ROOT 必须指向已上线签名制品的解包目录')
const dsh = process.env.EAIS_DSH_CLI ?? '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh'
if (!existsSync(dsh)) throw new Error(`找不到 DSH CLI：${dsh}`)
const home = await mkdtemp(join(tmpdir(), 'eais-plugin-upgrade-'))
const failures = []
try {
  for (const entry of await readdir(bundles, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const root = resolve(bundles, entry.name)
    if (!existsSync(join(root, '.eais-plugin.json'))) continue
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
    const profile = `eais-upgrade-${Date.now()}-${failures.length}`
    const verified = spawnSync(process.execPath, [resolve('templates/verify.mjs'), root], { encoding: 'utf8' })
    if (verified.status !== 0) { failures.push(`${pkg.name}: ${verified.stdout || verified.stderr}`); continue }
    const installed = spawnSync(dsh, ['plugin', '--profile', profile, 'add', root], { encoding: 'utf8', env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config') } })
    if (installed.status !== 0) { failures.push(`${pkg.name}: ${installed.stdout || installed.stderr}`); continue }
    const dumped = spawnSync(dsh, ['--profile', profile, '--dump-config'], { encoding: 'utf8', env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config') } })
    const client = await readFile(join(root, 'lib/client.js'), 'utf8')
    if (dumped.status !== 0 || !dumped.stdout.includes(pkg.name) || !client.includes('sidebar.panellist') || !client.includes("'main'")) {
      failures.push(`${pkg.name}: 安装或主区入口检查失败`)
    }
  }
} finally {
  await rm(home, { recursive: true, force: true })
}
if (failures.length) throw new Error(`插件升级回归失败：\n${failures.join('\n')}`)
console.log('所有已上线签名制品均通过安装与入口回归')
