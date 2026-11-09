import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(new URL('../../DSH_pre/dsh/package.json', import.meta.url))
const tsconfigPaths = require('vite-tsconfig-paths').default

export default {
  plugins: [tsconfigPaths({
    projects: [fileURLToPath(new URL('../../DSH_pre/dsh/tsconfig.base.json', import.meta.url))],
  })],
  test: { include: ['integration/**/*.spec.ts'] },
}
