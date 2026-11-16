#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

function parse(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 2) result[argv[index]?.slice(2)] = argv[index + 1]
  for (const key of ['target', 'package', 'panel', 'label']) if (!result[key]) throw new Error('需要 --target --package --panel --label')
  if (!/^@eais\/[a-z0-9][a-z0-9._-]*\.[a-z0-9][a-z0-9-]*$/.test(result.package)) throw new Error('正式包名必须由 plugin_check 返回')
  if (!/^eais-[a-z0-9-]+$/.test(result.panel)) throw new Error('面板编号无效')
  return result
}

export async function finalizePlugin(options) {
  const root = resolve(options.target)
  if (existsSync(resolve(root, '.eais-plugin.json'))) throw new Error('已签名插件不能改名；请另存为新插件')
  const packagePath = resolve(root, 'package.json')
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'))
  const oldPackage = pkg.name
  const oldPanel = oldPackage.split('/').at(-1)
  const files = ['package.json', 'cordis.patch.yml', 'lib/client.js', 'locale/zh.json', 'locale/en.json']
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const names = new RegExp(`${escape(oldPackage)}|${escape(oldPanel)}`, 'g')
  for (const file of files) {
    const path = resolve(root, file)
    const source = await readFile(path, 'utf8')
    let output = source.replace(names, match => match === oldPackage ? options.package : options.panel)
    if (file === 'package.json') {
      const updated = JSON.parse(output)
      updated.name = options.package
      output = JSON.stringify(updated, null, 2) + '\n'
    }
    if (file === 'locale/zh.json') {
      const locale = JSON.parse(output)
      locale.meta.title = options.label
      output = JSON.stringify(locale, null, 2) + '\n'
    }
    await writeFile(path, output)
  }
  return { valid: true, packageName: options.package, panelId: options.panel, next: `node templates/verify.mjs ${JSON.stringify(root)}` }
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  try {
    console.log(JSON.stringify(await finalizePlugin(parse(process.argv.slice(2))), null, 2))
  } catch (error) {
    console.error(JSON.stringify({ valid: false, errors: [error instanceof Error ? error.message : String(error)] }))
    process.exitCode = 1
  }
}
