#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

const INCLUDED = ['lib', 'index.js', 'locale', 'icon.svg']
const ALWAYS_INCLUDED = ['package.json', 'cordis.patch.yml']
const REQUIRED_FILES = [
  'package.json', 'cordis.patch.yml', 'lib/index.js', 'lib/client.js',
  'locale/zh.json', 'locale/en.json', 'icon.svg', 'preview.html',
]

function collectFiles(root, entry, files) {
  const base = resolve(root)
  const absolute = isAbsolute(entry) ? entry : resolve(base, entry)
  if (absolute !== base && !absolute.startsWith(base + sep)) return
  if (!existsSync(absolute)) return
  const info = statSync(absolute)
  if (info.isDirectory()) {
    for (const child of readdirSync(absolute).sort()) {
      if (child === 'node_modules' || child === '.git') continue
      collectFiles(root, resolve(absolute, child), files)
    }
    return
  }
  if (info.isFile()) files.add(relative(root, absolute))
}

export function hashPackageFiles(root) {
  const files = new Set()
  for (const entry of [...ALWAYS_INCLUDED, ...INCLUDED]) collectFiles(root, entry, files)
  const digest = createHash('sha256')
  for (const file of [...files].sort()) {
    const fileHash = createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')
    digest.update(`${file.split(sep).join('/')}\0${fileHash}\n`)
  }
  return `sha256:${digest.digest('hex')}`
}

export function dependencyTreeDigest(pkg) {
  const dependencies = { ...(pkg.dependencies ?? {}), ...(pkg.optionalDependencies ?? {}), ...(pkg.peerDependencies ?? {}) }
  const lines = Object.entries(dependencies).map(([name, version]) => `${name}@${version}`).sort()
  return `sha256:${createHash('sha256').update(lines.join('\n')).digest('hex')}`
}

function sameDigest(left, right) {
  return String(left ?? '').replace(/^sha256:/, '').toLowerCase() === String(right ?? '').replace(/^sha256:/, '').toLowerCase()
}

function checkSyntax(root, file, errors) {
  const result = spawnSync(process.execPath, ['--check', resolve(root, file)], { encoding: 'utf8' })
  if (result.status !== 0) errors.push(`${file} JavaScript 语法错误：${(result.stderr || result.stdout).trim()}`)
}

export function verifyPlugin(target) {
  const root = resolve(target)
  const errors = []
  for (const file of REQUIRED_FILES) {
    if (!existsSync(resolve(root, file))) errors.push(`缺少 ${file}`)
  }
  if (errors.length > 0) return { valid: false, errors, next: '修复后重新运行 verify；不要安装' }

  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
  if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(pkg.name ?? '')) errors.push('package.json name 必须是小写 npm 包名')
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version ?? '')) errors.push('package.json version 必须是语义化版本')
  if (!Array.isArray(pkg.eaisActions) || pkg.eaisActions.length === 0 || pkg.eaisActions.some((code) => typeof code !== 'string' || !code)) {
    errors.push('package.json eaisActions 必须声明界面实际调用的业务动作')
  }
  const expectedExports = {
    '.': './lib/index.js', './locale/*.json': './locale/*.json', './icon': './icon.svg', './client': './lib/client.js',
  }
  for (const [key, value] of Object.entries(expectedExports)) {
    if (pkg.exports?.[key] !== value) errors.push(`package.json exports[${key}] 必须为 ${value}`)
  }
  for (const entry of ['lib', 'cordis.patch.yml', 'locale/*.json', 'icon.svg']) {
    if (!pkg.files?.includes(entry)) errors.push(`package.json files 必须包含 ${entry}`)
  }
  if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml') errors.push('package.json dsh.bundle.patch 必须为 ./cordis.patch.yml')
  if (pkg.dsh?.client?.platform !== 'web' || pkg.dsh?.client?.immediately !== true) {
    errors.push('package.json 必须声明 web 客户端并立即加载')
  }

  const client = readFileSync(resolve(root, 'lib/client.js'), 'utf8')
  const forbidden = [
    [/ctx\s*\.\s*get\s*\(\s*['"]eaisData['"]\s*\)/, '禁止 ctx.get("eaisData")；必须使用 ctx.eaisData'],
    [/(?:ctx\s*\.\s*)?(?:remote\s*\.\s*)?credentials|\bcard_token\b|\bstaff_card\b|x-eais-staff-card/i, '禁止读取员工卡或凭据；数据访问只能走 ctx.eaisData'],
    [/\bfetch\s*\(|XMLHttpRequest|https?:\/\//i, '禁止插件界面直连 edge 或其他网络地址；只能使用 ctx.eaisData.call'],
    [/pluginCtx\s*\.\s*name|fiber\s*\.\s*name/, '禁止从 pluginCtx.name 或 fiber.name 推导插件包名'],
  ]
  for (const [pattern, message] of forbidden) if (pattern.test(client)) errors.push(message)
  if (!/ctx\s*\.\s*eaisData/.test(client)) errors.push('客户端必须使用 ctx.eaisData 访问企业数据')
  if (!/(?:height\s*:\s*['"]?100%)/.test(client) || !/(?:minHeight|min-height)\s*:\s*['"]?0/.test(client) || !/overflow\s*:\s*['"]?auto/.test(client)) {
    errors.push('插件根节点必须同时设置 height:100%、min-height:0、overflow:auto')
  }
  for (const [pattern, message] of [
    [/\bloading\b/i, '缺少 loading 加载状态'],
    [/\bempty\b|没找到|没有.*记录/i, '缺少 empty 空状态'],
    [/role\s*:\s*['"]alert['"]|role=['"]alert['"]/, '错误状态必须使用 role="alert"'],
    [/\bdelivery\b/, '必须检查 result.delivery，不能把 digest 当作空数据'],
    [/sequence\s*\.\s*current|requestId|requestID/, '刷新必须忽略过期响应'],
  ]) if (!pattern.test(client)) errors.push(message)
  if (/__[A-Z][A-Z_]*__/.test(client) || /__[A-Z][A-Z_]*__/.test(readFileSync(resolve(root, 'package.json'), 'utf8'))) {
    errors.push('模板占位符尚未替换；请使用 scaffold.mjs 生成插件')
  }
  const preview = readFileSync(resolve(root, 'preview.html'), 'utf8')
  if (!preview.includes('数据是假的，样子是真的')) errors.push('预览必须明确标注假数据')
  if (/\b(?:fetch|XMLHttpRequest)\s*\(|https?:\/\//i.test(preview)) errors.push('预览禁止网络访问')
  if (/__[A-Z][A-Z_]*__/.test(preview)) errors.push('预览模板占位符尚未替换')
  checkSyntax(root, 'lib/client.js', errors)
  checkSyntax(root, 'lib/index.js', errors)

  const manifest = {
    package_name: pkg.name,
    version: pkg.version,
    content_hash: hashPackageFiles(root),
    dependency_tree_digest: dependencyTreeDigest(pkg),
    eais_actions: [...new Set(pkg.eaisActions ?? [])].sort(),
  }
  const signedPath = resolve(root, '.eais-plugin.json')
  const hasSignature = existsSync(signedPath)
  let signatureCurrent = false
  if (hasSignature) {
    const signed = JSON.parse(readFileSync(signedPath, 'utf8'))
    signatureCurrent = signed.packageName === pkg.name && signed.version === pkg.version
    if (signed.packageName !== pkg.name) errors.push('签名清单与包名不一致；不要复用其他插件的签名')
    if (signatureCurrent && !sameDigest(signed.contentHash, manifest.content_hash)) {
      errors.push('签名后插件内容已变化；升级 package.json version，重新 verify 和 plugin_submit')
    }
    if (signatureCurrent && signed.dependencyTreeDigest && !sameDigest(signed.dependencyTreeDigest, manifest.dependency_tree_digest)) {
      errors.push('依赖摘要与签名清单不一致；升级版本并重新签名')
    }
    if (signatureCurrent && Array.isArray(signed.declaredActions) && JSON.stringify(signed.declaredActions) !== JSON.stringify(manifest.eais_actions)) {
      errors.push('eaisActions 与签名清单不一致；升级版本并重新签名')
    }
  }
  const signatureStale = hasSignature && !signatureCurrent
  return {
    valid: errors.length === 0,
    errors,
    warnings: signatureStale ? ['版本已升级，旧签名仅作历史记录；必须重新 plugin_submit，不能直接安装'] : [],
    manifest,
    next: errors.length > 0 ? '修复后重新运行 verify；不要安装' : signatureCurrent ? '运行 plugin_manager install_bundle；安装后停止，不再修改文件' : '把 manifest 传给 plugin_submit，并将返回 manifest 原样写入 .eais-plugin.json',
  }
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const target = process.argv[2]
  if (!target) {
    console.error(JSON.stringify({ valid: false, errors: ['用法：node templates/verify.mjs <插件目录>'] }, null, 2))
    process.exitCode = 1
  } else {
    try {
      const result = verifyPlugin(target)
      console.log(JSON.stringify(result, null, 2))
      if (!result.valid) process.exitCode = 1
    } catch (error) {
      console.error(JSON.stringify({ valid: false, errors: [error instanceof Error ? error.message : String(error)], next: '修复后重新运行 verify；不要安装' }, null, 2))
      process.exitCode = 1
    }
  }
}
