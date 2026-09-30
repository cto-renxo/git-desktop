import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mkdir, symlink } from 'fs/promises'
import * as Path from 'path'
import { git } from '../../../src/lib/git/core'
import { createTempDirectory } from '../../helpers/temp'
import { addFolderRepositories } from '../../../src/ui/repositories-list/add-folder-repositories'

async function run(path: string, ...args: string[]) {
  return git(args, path, 'folderImportTest')
}

async function checkout(path: string) {
  await mkdir(path, { recursive: true })
  await run(path, 'init')
}

describe('adding repositories from folder groups', () => {
  it('imports main and nested repositories but skips worktrees, existing repos and dependency trees', async t => {
    const root = await createTempDirectory(t)
    const existing = Path.join(root, 'existing')
    const nested = Path.join(root, 'projects', 'nested')
    const linked = Path.join(root, 'linked')
    await checkout(root)
    await checkout(existing)
    await checkout(nested)
    await run(root, 'commit', '--allow-empty', '-m', 'initial')
    await run(root, 'worktree', 'add', '-b', 'linked', linked)
    await checkout(Path.join(root, 'node_modules', 'ignored'))
    await mkdir(Path.join(root, '.git', 'ignored', '.git'), { recursive: true })
    const added: string[] = []
    const errors = await addFolderRepositories(
      root,
      [existing + Path.sep],
      async paths => {
        added.push(...paths)
      }
    )
    assert.deepEqual(new Set(added), new Set([root, nested]))
    assert.deepEqual(errors, [])
    await addFolderRepositories(root, [...added, existing], async () => {
      assert.fail('Already added repositories must be skipped')
    })
  })

  it('does not import a linked worktree when its main checkout is outside the folder', async t => {
    const root = await createTempDirectory(t)
    const main = await createTempDirectory(t)
    await checkout(main)
    await run(main, 'commit', '--allow-empty', '-m', 'initial')
    const linked = Path.join(root, 'linked')
    await run(main, 'worktree', 'add', '-b', 'linked', linked)
    for (const folder of [root, linked]) {
      const errors = await addFolderRepositories(folder, [], async () => {
        assert.fail('Worktrees must not become repository entries')
      })
      assert.deepEqual(errors, [])
    }
  })

  it('skips submodules while retaining independent nested repositories', async t => {
    const root = await createTempDirectory(t)
    const source = await createTempDirectory(t)
    await checkout(root)
    await checkout(source)
    await run(source, 'commit', '--allow-empty', '-m', 'submodule base')
    await run(
      root,
      '-c',
      'protocol.file.allow=always',
      'submodule',
      'add',
      source,
      'module'
    )
    const nested = Path.join(root, 'nested')
    await checkout(nested)
    const added: string[] = []
    const errors = await addFolderRepositories(root, [], async paths => {
      added.push(...paths)
    })
    assert.deepEqual(new Set(added), new Set([root, nested]))
    assert.deepEqual(errors, [])
    await addFolderRepositories(Path.join(root, 'module'), [], async () => {
      assert.fail('A directly selected submodule must also be skipped')
    })
  })
  it('imports a main checkout with a separate Git directory', async t => {
    const root = await createTempDirectory(t)
    const metadata = Path.join(await createTempDirectory(t), 'metadata')
    await run(root, 'init', '--separate-git-dir', metadata)
    const added: string[] = []
    const errors = await addFolderRepositories(root, [], async paths => {
      added.push(...paths)
    })
    assert.deepEqual(added, [root])
    assert.deepEqual(errors, [])
  })

  it('continues adding remaining repositories after an individual failure', async t => {
    const root = await createTempDirectory(t)
    const paths = ['one', 'two', 'three'].map(name => Path.join(root, name))
    for (const path of paths) {
      await checkout(path)
    }
    const attempted: string[] = []
    const errors = await addFolderRepositories(root, [], async paths => {
      attempted.push(paths[0])
      if (attempted.length === 1) {
        throw new Error('Cannot add repository')
      }
    })
    assert.equal(attempted.length, 3)
    assert.equal(errors.length, 1)
    assert.equal(errors[0], attempted[0] + ': Cannot add repository')
  })

  it('reports unreadable folders and handles empty folders', async t => {
    const root = await createTempDirectory(t)
    const add = async () => assert.fail('No repositories should be added')
    assert.deepEqual(await addFolderRepositories(root, [], add), [])
    const errors = await addFolderRepositories(
      Path.join(root, 'missing'),
      [],
      add
    )
    assert.equal(errors.length, 1)
    assert.match(errors[0], /missing/)
  })

  it('does not follow directory links outside the selected folder', async t => {
    const root = await createTempDirectory(t)
    const outside = await createTempDirectory(t)
    await checkout(outside)
    await symlink(
      outside,
      Path.join(root, 'alias'),
      process.platform === 'win32' ? 'junction' : 'dir'
    )
    const errors = await addFolderRepositories(root, [], async () => {
      assert.fail('Linked directories must not be traversed')
    })
    assert.deepEqual(errors, [])
  })
})
