import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { realpath } from 'node:fs/promises'
import { readManifest } from './manifest.js'
import { packPlugin } from './artifacts.js'
import type { ForgeSessionController } from './forge-session.js'
import type { GuardContext } from './index.js'
import { readSettings, settingsControllerOf, writeSettingsWithRetry } from '../port.js'

interface ToolExec {
  name: string
  arguments?: Record<string, unknown>
  agent?: {
    session: { id: unknown, header?: { cwd?: string } }
  }
}

type Next = () => Promise<unknown>

const FORGE_TOOLS = new Set(['run_code', 'plugin_manager', 'workflow', 'bash', 'pwsh', 'subagent', 'subagent_fork'])
const NETWORK_COMMAND = /(^|[\s;&|])(?:sudo\s+)?(?:curl|wget|nc|ssh|scp)(?=\s|$)/u

interface SignedPluginManifest {
  pluginNo: string
  ownerStaffNo: string
  packageName: string
  version: string
  contentHash: string
  signature: string
}

export class InstallPolicy {
  constructor(private readonly ctx: GuardContext, private readonly forge: ForgeSessionController) {}

  start(): () => void {
    const before = this.ctx.on?.('tools/pre-execute', async (exec: ToolExec, next: Next) => this.before(exec, next))
    const after = this.ctx.on?.('tools/post-execute', async (exec: ToolExec, result: unknown, next: Next) => {
      if (exec.name === 'mcp__eais__plugin_submit') await this.uploadSubmittedArtifact(exec, result)
      if (exec.name === 'plugin_manager' && exec.arguments?.action === 'install_bundle') {
        let parsed = result
        if (typeof result === 'string') {
          try { parsed = JSON.parse(result) } catch { parsed = {} }
        }
        const record = typeof parsed === 'object' && parsed !== null ? parsed as { isError?: boolean, application?: string } : {}
        if (record.isError !== true && record.application === 'applied') {
          await this.recordSource(exec)
          await this.forge.exit(String(exec.agent?.session.id ?? ''), true, 'installed')
        }
      }
      return next()
    })
    return () => {
      if (typeof before === 'function') before()
      if (typeof after === 'function') after()
    }
  }

  private async uploadSubmittedArtifact(exec: ToolExec, result: unknown): Promise<void> {
    if (typeof result === 'object' && result !== null && (result as { isError?: boolean }).isError === true) return
    const previewPath = String(exec.arguments?.preview_path ?? '')
    if (!isAbsolute(previewPath)) return
    try {
      const root = dirname(previewPath)
      const signed = JSON.parse(await readFile(resolve(root, '.eais-plugin.json'), 'utf8')) as SignedPluginManifest
      const session = this.forge.session()
      if (!session?.token) throw new Error('员工卡不可用，制品未上传')
      const response = await this.forge.request(`/plugins/${encodeURIComponent(signed.pluginNo)}/versions/${encodeURIComponent(signed.version)}/artifact`, {
        method: 'PUT',
        headers: { authorization: `Bearer ${session.token}`, 'content-type': 'application/json', accept: 'application/json' },
        body: await packPlugin(root),
      })
      if (!response.ok) throw new Error(`制品上传失败（HTTP ${response.status}）`)
    } catch (error) {
      console.warn('[eais] 提交后的制品同步失败', error instanceof Error ? error.message : String(error))
    }
  }

  private async recordSource(exec: ToolExec): Promise<void> {
    try {
      const target = String(exec.arguments?.target ?? '')
      const signed = JSON.parse(await readFile(resolve(target, '.eais-plugin.json'), 'utf8')) as { pluginNo?: string }
      if (!signed.pluginNo) return
      const controller = settingsControllerOf(this.ctx)
      const settings = await readSettings(controller)
      await writeSettingsWithRetry(controller, { pluginSources: { ...(settings.pluginSources ?? {}), [signed.pluginNo]: target } })
    } catch (error) {
      console.warn('[eais] 插件源码位置保存失败', error instanceof Error ? error.message : String(error))
    }
  }

  private async before(exec: ToolExec, next: Next): Promise<unknown> {
    const sessionID = String(exec.agent?.session.id ?? '')
    if (FORGE_TOOLS.has(exec.name) && !this.forge.isForge(sessionID)) {
      return { kind: 'deny', reason: `工具 ${exec.name} 仅在当前会话开启插件创作后可用` }
    }
    if ((exec.name === 'bash' || exec.name === 'pwsh') && NETWORK_COMMAND.test(String(exec.arguments?.command ?? ''))) {
      return { kind: 'deny', reason: '插件创作环境不允许使用网络命令；请使用平台提供的文件与数据工具' }
    }
    if (exec.name !== 'plugin_manager' || exec.arguments?.action !== 'install_bundle') return next()
    try {
      await this.authorizeInstall(exec)
    } catch (error) {
      return { kind: 'deny', reason: error instanceof Error ? error.message : String(error) }
    }
    return next()
  }

  private async authorizeInstall(exec: ToolExec): Promise<void> {
    const target = String(exec.arguments?.target ?? '')
    if (!isAbsolute(target)) throw new Error('只能安装当前工作区里的插件目录，不能安装 registry 包名或相对路径')
    const root = await realpath(target)
    const cwd = exec.agent?.session.header?.cwd
    if (cwd) {
      const outside = relative(await realpath(cwd), root)
      if (outside.startsWith('..') || isAbsolute(outside)) throw new Error('插件目录必须位于当前工作区内')
    }
    const signed = JSON.parse(await readFile(resolve(root, '.eais-plugin.json'), 'utf8')) as SignedPluginManifest
    const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')) as { name: string, version: string }
    if (signed.packageName !== pkg.name || signed.version !== pkg.version) throw new Error('插件签名与包名或版本不一致')
    const computed = readManifest(root, pkg.name, ['lib', 'index.js', 'locale', 'icon.svg'])
    if (computed.contentHash.replace(/^sha256:/, '') !== signed.contentHash.replace(/^sha256:/, '')) {
      throw new Error('插件内容已变化，不要重试安装：先运行 verify，升级 package.json 版本，再调用 plugin_submit 并重写签名 manifest，最后再次 verify')
    }
    const session = this.forge.session()
    if (!session || session.me.staff.no !== signed.ownerStaffNo) throw new Error('试制插件只能由作者本人安装')
    const response = await this.forge.request('/software/authorize', {
      method: 'POST',
      headers: { authorization: `Bearer ${session.token}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        plugin_no: signed.pluginNo,
        package_name: pkg.name,
        version: pkg.version,
        content_hash: computed.contentHash,
        dependency_tree_digest: computed.dependencyTreeDigest,
        plugin_signature: signed.signature,
      }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => undefined) as { error?: { message?: string } } | undefined
      throw new Error(payload?.error?.message ?? `插件安装授权失败（HTTP ${response.status}）`)
    }
  }
}
