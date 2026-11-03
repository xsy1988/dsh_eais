import { build } from 'esbuild'

await build({
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  external: ['react', 'react-dom', '@deepseek-ai/*'],
  banner: {
    js: 'window.__ModuleLoader__.load({\n  id: "@corp/dsh-eais",\n  factory: (require) => {\n    var module = { exports: {} };\n    var exports = module.exports;',
  },
  footer: {
    js: '    return module.exports;\n  }\n});',
  },
  logLevel: 'silent',
})
