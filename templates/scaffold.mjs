#!/usr/bin/env node
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const TEMPLATES = new Set(['trend', 'list', 'workbench'])
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/

function usage() {
  return 'node templates/scaffold.mjs --template trend|list|workbench --target <目录> --package <包名> --action <动作码> --label <名称> --description <说明>'
}

function parseArgs(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith('--') || !value || value.startsWith('--')) throw new Error(usage())
    options[key.slice(2)] = value
  }
  for (const key of ['template', 'target', 'package', 'action', 'label', 'description']) {
    if (!options[key]) throw new Error(`缺少 --${key}\n${usage()}`)
  }
  if (!TEMPLATES.has(options.template)) throw new Error(`未知模板 ${options.template}；${usage()}`)
  if (!PACKAGE_NAME.test(options.package)) throw new Error('包名必须是小写 npm 包名，例如 @local/sales-trend')
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(options.action)) throw new Error('动作码格式无效；必须使用 capabilities 实际返回的动作码')
  return options
}

async function replacePlaceholders(root, values) {
  for (const entry of await readdir(root, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue
    const path = resolve(entry.parentPath, entry.name)
    const source = await readFile(path, 'utf8')
    let output = source
    for (const [key, value] of Object.entries(values)) output = output.replaceAll(`__${key.toUpperCase()}__`, value)
    if (output !== source) await writeFile(path, output)
  }
}

export async function scaffold(options) {
  const target = resolve(options.target)
  const entries = await readdir(target).catch((error) => {
    if (error?.code === 'ENOENT') return []
    throw error
  })
  if (entries.length > 0) throw new Error(`目标目录不是空目录，拒绝覆盖：${target}`)
  const templateRoot = resolve(dirname(fileURLToPath(import.meta.url)), options.template)
  await mkdir(target, { recursive: true })
  await cp(templateRoot, target, { recursive: true, force: false })
  await cp(resolve(dirname(fileURLToPath(import.meta.url)), 'preview.html'), resolve(target, 'preview.html'))
  const panel = options.package.split('/').at(-1)
  await replacePlaceholders(target, {
    package: options.package,
    panel,
    action: options.action,
    label: options.label,
    description: options.description,
    template: options.template,
  })
  return { target, packageName: options.package, template: options.template, action: options.action }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await scaffold(parseArgs(process.argv.slice(2)))
    console.log(JSON.stringify({ valid: true, ...result, next: `node templates/verify.mjs ${JSON.stringify(result.target)}` }, null, 2))
  } catch (error) {
    console.error(JSON.stringify({ valid: false, errors: [error instanceof Error ? error.message : String(error)] }, null, 2))
    process.exitCode = 1
  }
}
