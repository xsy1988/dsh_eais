import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { readManifest } from './manifest.js'

interface BundleFile {
  path: string
  data: string
}

interface PluginManagerPort {
  installBundle(spec: string): Promise<{ application?: string, error?: { diagnostic?: string } }>
}

interface ArtifactOptions {
  serverUrl: string
  token: string
  fetchImpl?: typeof fetch
  pluginManager: PluginManagerPort
}

const ROOT_FILES = ['package.json', 'cordis.patch.yml', '.eais-plugin.json', 'index.js', 'icon.svg']

export async function packPlugin(root: string): Promise<string> {
  const signed = JSON.parse(await readFile(resolve(root, '.eais-plugin.json'), 'utf8')) as { contentHash?: string }
  const actual = readManifest(root, '', ['lib', 'index.js', 'locale', 'icon.svg']).contentHash.replace(/^sha256:/, '')
  if (signed.contentHash?.replace(/^sha256:/, '') !== actual) throw new Error('插件内容在签名后发生了变化，请重新提交')
  const files: BundleFile[] = []
  for (const path of ROOT_FILES) {
    try { files.push({ path, data: (await readFile(resolve(root, path))).toString('base64') }) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  for (const directory of ['lib', 'locale']) {
    for (const entry of await readdir(resolve(root, directory), { withFileTypes: true, recursive: true })) {
      if (!entry.isFile()) continue
      const path = `${directory}/${entry.name}`
      if (entry.parentPath.split('/').length > 1) {
        const relative = entry.parentPath.replace(resolve(root, directory), '').replace(/^\//, '')
        files.push({ path: relative ? `${directory}/${relative}/${entry.name}` : path, data: (await readFile(join(entry.parentPath, entry.name))).toString('base64') })
      } else files.push({ path, data: (await readFile(join(entry.parentPath, entry.name))).toString('base64') })
    }
  }
  return JSON.stringify({ files: files.sort((a, b) => a.path.localeCompare(b.path)) })
}

export async function uploadPluginArtifact(root: string, options: Omit<ArtifactOptions, 'pluginManager'>): Promise<void> {
  const signed = JSON.parse(await readFile(resolve(root, '.eais-plugin.json'), 'utf8')) as { pluginNo: string, version: string }
  const body = await packPlugin(root)
  const response = await (options.fetchImpl ?? fetch)(`${options.serverUrl}/plugins/${encodeURIComponent(signed.pluginNo)}/versions/${encodeURIComponent(signed.version)}/artifact`, {
    method: 'PUT', headers: { authorization: `Bearer ${options.token}`, 'content-type': 'application/json' }, body,
  })
  if (!response.ok) throw new Error(await errorMessage(response, '安装包上传失败'))
}

export async function installPluginArtifact(pluginNo: string, version: string, options: ArtifactOptions): Promise<{ application?: string }> {
  const response = await (options.fetchImpl ?? fetch)(`${options.serverUrl}/plugins/${encodeURIComponent(pluginNo)}/versions/${encodeURIComponent(version)}/artifact`, {
    headers: { authorization: `Bearer ${options.token}`, accept: 'application/octet-stream' },
  })
  if (!response.ok) throw new Error(await errorMessage(response, '安装包下载失败'))
  const raw = await response.text()
  const transportHash = response.headers.get('x-eais-artifact-sha256')
  if (transportHash && createHash('sha256').update(raw).digest('hex') !== transportHash) throw new Error('安装包传输校验失败')
  const target = await mkdtemp(join(tmpdir(), 'eais-plugin-artifact-'))
  try {
    const signed = await unpackPlugin(raw, target)
    if (signed.pluginNo !== pluginNo || signed.version !== version) throw new Error('安装包与所选插件不一致')
    const result = await options.pluginManager.installBundle(target)
    if (result.application === 'failed') throw new Error(result.error?.diagnostic ?? '插件安装失败')
    return result
  } finally {
    await rm(target, { recursive: true, force: true })
  }
}

async function unpackPlugin(raw: string, target: string): Promise<{ pluginNo: string, version: string }> {
  const bundle = JSON.parse(raw) as { files?: BundleFile[] }
  if (!Array.isArray(bundle.files) || bundle.files.length === 0) throw new Error('安装包内容为空')
  const files = new Map<string, Buffer>()
  for (const file of bundle.files) {
    if (!validPath(file.path) || files.has(file.path)) throw new Error('安装包包含无效文件')
    files.set(file.path, Buffer.from(file.data, 'base64'))
  }
  const signed = JSON.parse(files.get('.eais-plugin.json')?.toString('utf8') ?? '{}') as { pluginNo?: string, version?: string, contentHash?: string }
  if (!signed.pluginNo || !signed.version) throw new Error('安装包缺少签名身份')
  const hash = createHash('sha256')
  for (const path of [...files.keys()].filter(path => path !== '.eais-plugin.json').sort()) {
    hash.update(`${path}\0${createHash('sha256').update(files.get(path)!).digest('hex')}\n`)
  }
  if (signed.contentHash?.replace(/^sha256:/, '') !== hash.digest('hex')) throw new Error('安装包内容校验失败')
  for (const [path, content] of files) {
    const destination = resolve(target, path)
    await mkdir(dirname(destination), { recursive: true })
    await writeFile(destination, content, { flag: 'wx' })
  }
  return { pluginNo: signed.pluginNo, version: signed.version }
}

function validPath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\\') || path.includes('..')) return false
  return ROOT_FILES.includes(path) || path.startsWith('lib/') || path.startsWith('locale/')
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => undefined) as { error?: { message?: string } } | undefined
  return payload?.error?.message ?? `${fallback}（HTTP ${response.status}）`
}
