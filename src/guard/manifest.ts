import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export interface PackageManifest {
  packageName: string
  version: string
  contentHash: string
  dependencyTreeDigest: string
}

interface PackageJSON {
  name?: string
  version?: string
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

const ALWAYS_INCLUDED = ['package.json', 'cordis.patch.yml']

export function resolvePackageRoot(name: string, extraPaths: string[] = []): string {
  const candidates: string[] = []
  try {
    const require = createRequire(import.meta.url)
    candidates.push(dirname(require.resolve(name)))
  } catch {
    // Fall through to the explicit and profile roots.
  }
  for (const path of extraPaths) {
    if (path) candidates.push(path)
  }
  const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const profiles = join(dshHome, 'profiles')
  if (existsSync(profiles)) {
    for (const profile of readdirSync(profiles)) {
      candidates.push(join(profiles, profile, 'node_modules', name))
    }
  }
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    let current = candidate
    for (let depth = 0; depth < 12; depth++) {
      if (existsSync(join(current, 'package.json'))) return current
      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }
  }
  throw new Error(`cannot locate package root for ${name}`)
}

export function readManifest(root: string, packageName?: string, include: string[] = ['lib']): PackageManifest {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as PackageJSON
  if (!pkg.name || !pkg.version) {
    throw new Error(`package.json at ${root} has no name or version`)
  }
  return {
    packageName: packageName ?? pkg.name,
    version: pkg.version,
    contentHash: hashPackageFiles(root, include),
    dependencyTreeDigest: dependencyTreeDigest(pkg),
  }
}

export function hashPackageFiles(root: string, include: string[] = ['lib']): string {
  const files = new Set<string>()
  for (const entry of [...ALWAYS_INCLUDED, ...include]) {
    collectFiles(root, entry, files)
  }
  const sorted = [...files].sort()
  const digest = createHash('sha256')
  for (const file of sorted) {
    const content = readFileSync(join(root, file))
    const fileHash = createHash('sha256').update(content).digest('hex')
    digest.update(`${file.split(sep).join('/')}\0${fileHash}\n`)
  }
  return `sha256:${digest.digest('hex')}`
}

export function dependencyTreeDigest(pkg: PackageJSON): string {
  const dependencies = { ...(pkg.dependencies ?? {}), ...(pkg.optionalDependencies ?? {}), ...(pkg.peerDependencies ?? {}) }
  const lines = Object.entries(dependencies)
    .map(([name, version]) => `${name}@${version}`)
    .sort()
  return `sha256:${createHash('sha256').update(lines.join('\n')).digest('hex')}`
}

function collectFiles(root: string, entry: string, files: Set<string>): void {
  const base = resolve(root)
  const absolute = isAbsolute(entry) ? entry : resolve(base, entry)
  if (absolute !== base && !absolute.startsWith(base + sep)) return
  if (!existsSync(absolute)) return
  const info = statSync(absolute)
  if (info.isDirectory()) {
    for (const child of readdirSync(absolute).sort()) {
      if (child === 'node_modules' || child === '.git') continue
      collectFiles(root, join(absolute, child), files)
    }
    return
  }
  if (!info.isFile()) return
  files.add(relative(root, absolute))
}
