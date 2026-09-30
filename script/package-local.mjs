// Package the compiled local bundle using the already installed Electron runtime.
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundle = join(root, 'out')
const dist = join(root, 'dist')
const target = join(dist, 'GitDesktop-win32-x64')
if (dirname(target) !== dist || !dist.startsWith(`${root}\\`)) {
  throw new Error('The local package must stay inside this checkout')
}
const pkg = JSON.parse(
  await readFile(join(root, 'app', 'package.json'), 'utf8')
)
if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('This local packaging command currently supports Windows x64')
}
await stat(join(bundle, 'main.js'))
await mkdir(dist, { recursive: true })
const staging = await mkdtemp(join(dist, 'local-package-'))
if (dirname(staging) !== dist) {
  throw new Error('The staging directory must stay inside dist')
}
try {
  await cp(join(root, 'node_modules', 'electron', 'dist'), staging, {
    recursive: true,
  })
  const executable = join(staging, 'GitDesktop.exe')
  await rename(join(staging, 'electron.exe'), executable)
  const app = join(staging, 'resources', 'app')
  await cp(bundle, app, {
    recursive: true,
    filter: path =>
      !path.endsWith('renderer.report.html') &&
      !path.includes(`${join(root, 'out', 'transition-qa')}`) &&
      !path.includes(`${join(root, 'out', 'health-preview')}`),
  })
  await writeFile(
    join(app, 'package.json'),
    JSON.stringify({ ...pkg, dependencies: {}, devDependencies: {} })
  )
  const { resedit } = require(join(
    dirname(require.resolve('@electron/packager')),
    'resedit.js'
  ))
  await resedit(executable, {
    productName: pkg.productName,
    productVersion: pkg.version,
    fileVersion: pkg.version,
    iconPath: join(root, 'app', 'static', 'logos', 'prod', 'icon-logo.ico'),
    win32Metadata: {
      CompanyName: pkg.companyName,
      FileDescription: pkg.productName,
      ProductName: pkg.productName,
      InternalName: 'GitDesktop',
      OriginalFilename: 'GitDesktop.exe',
    },
  })
  // The fixed target is entirely inside this checkout's dist directory.
  await rm(target, { recursive: true, force: true })
  await rename(staging, target)
  console.log(join(target, 'GitDesktop.exe'))
} finally {
  await rm(staging, { recursive: true, force: true })
}
