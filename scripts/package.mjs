import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { packager } from '@electron/packager'

const root = resolve(import.meta.dirname, '..')
const outputDirectory = join(root, 'release')

const electronVersion = JSON.parse(
  readFileSync(join(root, 'node_modules', 'electron', 'package.json'), 'utf8')
).version

// packager 交给 ignore 的是相对仓库根、带前导斜杠、分隔符统一成 / 的路径，
// 所以这里一律按这个形状写；`out` 是打包输入，不能忽略。
const ignore = [
  /^\/(?:src|e2e|docs|tools|scripts|\.agents|\.git|\.vscode|\.tmp-[^/]*|test-results|playwright-report|release|真题PDF)(?:\/|$)/,
  /^\/(?:\.env[^/]*|\.gitignore|\.tmp-[^/]*|[^/]+\.md|[^/]+\.pdf|package-lock\.json|skills-lock\.json|playwright\.config\.ts|vitest\.config\.ts|electron\.vite\.config\.ts|tsconfig[^/]*\.json)$/
]

const packagedPaths = await packager({
  dir: root,
  out: outputDirectory,
  name: 'english-learning',
  productName: '素读',
  executableName: '素读',
  electronVersion,
  overwrite: true,
  asar: { unpack: '**/*.node' },
  ignore
})

const [appPath] = packagedPaths
if (!appPath) {
  throw new Error('打包没有产出应用目录')
}

const executablePath =
  process.platform === 'win32'
    ? join(appPath, '素读.exe')
    : process.platform === 'darwin'
      ? join(appPath, '素读.app', 'Contents', 'MacOS', '素读')
      : join(appPath, '素读')

const manifestPath = join(outputDirectory, 'packaged-app.json')
await writeFile(manifestPath, `${JSON.stringify({ appPath, executablePath }, null, 2)}\n`, 'utf8')

console.log(`打包完成：${appPath}`)
console.log(`可执行文件：${executablePath}`)
