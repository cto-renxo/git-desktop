import webpack from 'webpack'
import DevMiddleware from 'webpack-dev-middleware'
import HotMiddleware from 'webpack-hot-middleware'

import { forceUnwrap as u } from '../app/src/lib/fatal-error'

import configs from '../app/webpack.development'

import { run } from './run'
import { createServer } from 'http'
import { spawnSync } from 'child_process'
import { join } from 'path'

function getPortOrDefault() {
  const port = process.env.PORT
  if (port != null) {
    const result = parseInt(port)
    if (isNaN(result)) {
      throw new Error(`Unable to parse '${port}' into valid number`)
    }
    return result
  }

  return 3000
}

function startApp() {
  console.log('Starting Electron…')
  const runningApp = run({ stdio: 'inherit' })
  if (runningApp == null) {
    console.error(
      "Couldn't launch the app. You probably need to build it first. Run `yarn build:dev`."
    )
    process.exit(1)
  }

  runningApp.on('error', error => {
    console.error('Could not start Electron:', error)
    process.exit(1)
  })
  console.log(`Electron started (PID ${runningApp.pid}).`)
  runningApp.on('close', code => {
    console.log(`Electron exited (code ${code}).`)
    process.exit(code ?? 1)
  })
}

function reportCompilation(
  compiler: webpack.Compiler | webpack.MultiCompiler,
  label: string
) {
  let lastStep = ''
  new webpack.ProgressPlugin((fraction, message) => {
    const step = `${Math.floor(fraction * 10) * 10}% ${message}`
    if (step !== lastStep) {
      console.log(`${label}: ${step}`)
      lastStep = step
    }
  }).apply(compiler)
}

if (process.env.NODE_ENV === 'production') {
  startApp()
} else {
  const rendererConfig = configs[1]
  const compiler = webpack(rendererConfig)
  reportCompilation(compiler, 'Renderer')
  let firstBuild = true
  compiler.hooks.done.tap('ReportDevelopmentErrors', stats => {
    if (stats.hasErrors()) {
      console.error(stats.toString({ all: false, errors: true }))
      if (firstBuild) {
        process.exit(1)
      }
    }
    firstBuild = false
  })
  const port = getPortOrDefault()
  const message = 'Could not find public path from configuration'

  const devMiddleware = DevMiddleware(compiler, {
    // Electron loads the HTML from disk; its scripts are served by middleware.
    writeToDisk: filePath => filePath.endsWith('index.html'),
    publicPath: u(
      message,
      u(message, u(message, rendererConfig).output).publicPath
    ),
  })

  const hotMiddleware = HotMiddleware(compiler)

  const server = createServer((req, res) => {
    devMiddleware(req, res, () => {
      hotMiddleware(req, res, () => {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Not found')
      })
    })
  })

  server.listen(port, 'localhost')
  server.on('listening', () => {
    console.log(`Server running at http://localhost:${port}`)
    // The renderer is served by middleware; compile the other processes to disk.
    const diskCompiler = webpack(configs.filter((_, index) => index !== 1))
    reportCompilation(diskCompiler, 'Application bundles')
    diskCompiler.run((error, stats) => {
      diskCompiler.close(closeError => {
        if (error || closeError || !stats || stats.hasErrors()) {
          console.error(
            error || closeError || stats?.toString({ all: false, errors: true })
          )
          process.exit(1)
        }
        console.log('Preparing development resources (without packaging)…')
        const root = join(__dirname, '..')
        const prepared = spawnSync(
          process.execPath,
          [
            join(root, 'vendor', 'yarn-1.21.1.js'),
            'ts-node',
            '-P',
            'script/tsconfig.json',
            'script/build.ts',
          ],
          {
            cwd: root,
            stdio: 'inherit',
            env: { ...process.env, DESKTOP_SKIP_PACKAGE: '1' },
          }
        )
        if (prepared.error || prepared.status !== 0) {
          console.error(
            prepared.error || 'Development resource preparation failed.'
          )
          process.exit(1)
        }
        devMiddleware.waitUntilValid(() => startApp())
      })
    })
  })
  server.on('error', (err: Error) => {
    console.error(err)
    process.exit(1)
  })
}
