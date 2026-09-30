import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mkdir, writeFile } from 'fs/promises'
import * as Path from 'path'
import { setupEmptyRepository } from '../helpers/repositories'
import { createTempDirectory } from '../helpers/temp'
import { git } from '../../src/lib/git/core'
import {
  discoverHealthRepositories,
  inspectHealthRepository,
  getHealthRepositoryIdentity,
  needsHealthAttention,
  performHealthOperation,
  safelyUpdateHealthWorktree,
} from '../../src/lib/repository-health'

async function run(path: string, ...args: string[]) {
  return (await git(args, path, 'healthTest')).stdout.trim()
}

describe('repository health', () => {
  it('reports uncommitted files in an unborn repository', async t => {
    const repo = await setupEmptyRepository(t)
    await writeFile(Path.join(repo.path, 'new.txt'), 'uncommitted')
    const result = await inspectHealthRepository(repo.path)
    assert.equal(result.unpublished, 0)
    assert.deepEqual(result.worktrees[0].files, ['?? new.txt'])
    assert.equal(needsHealthAttention(result), true)
  })

  it('includes detached commits and deduplicates commits shared by branches', async t => {
    const repo = await setupEmptyRepository(t)
    await run(repo.path, 'commit', '--allow-empty', '-m', 'base')
    await run(repo.path, 'remote', 'add', 'origin', repo.path)
    await run(repo.path, 'update-ref', 'refs/remotes/origin/master', 'HEAD')
    await run(repo.path, 'branch', '--set-upstream-to=origin/master')
    await run(repo.path, 'checkout', '--detach')
    await run(repo.path, 'commit', '--allow-empty', '-m', 'detached')
    await run(repo.path, 'branch', 'also-local')
    const result = await inspectHealthRepository(repo.path)
    assert.equal(result.unpublished, 1)
    assert.equal(result.worktrees[0].unpublished, 1)
    assert.equal(result.worktrees[0].branch, null)
    assert.equal(needsHealthAttention(result), true)
  })

  it('reports every worktree and uses a common identity', async t => {
    const repo = await setupEmptyRepository(t)
    await run(repo.path, 'commit', '--allow-empty', '-m', 'base')
    const root = await createTempDirectory(t)
    const linked = Path.join(root, 'linked')
    await run(repo.path, 'worktree', 'add', '-b', 'linked', linked)
    await writeFile(Path.join(linked, 'local.txt'), 'dirty')
    const result = await inspectHealthRepository(repo.path)
    assert.equal(result.worktrees.length, 2)
    assert.equal(
      result.worktrees.find(w => w.branch === 'linked')?.files.length,
      1
    )
    assert.equal(
      (await getHealthRepositoryIdentity(linked)).commonDirectory,
      result.commonDirectory
    )
  })

  it('finds nested repositories and reports invalid markers instead of hiding them', async t => {
    const repo = await setupEmptyRepository(t)
    const nested = Path.join(repo.path, 'nested')
    await mkdir(nested)
    await run(nested, 'init')
    const stale = Path.join(repo.path, 'stale')
    await mkdir(stale)
    await writeFile(Path.join(stale, '.git'), 'gitdir: missing-git-directory\n')
    const found = await discoverHealthRepositories(repo.path)
    assert.deepEqual(new Set(found.paths), new Set([repo.path, nested, stale]))
    await assert.rejects(inspectHealthRepository(stale))
    const missing = await discoverHealthRepositories(
      Path.join(repo.path, 'missing')
    )
    assert.equal(missing.errors.length, 1)
  })

  it('skips generated and dependency directories regardless of case', async t => {
    const root = await createTempDirectory(t)
    for (const name of [
      'Library',
      'Temp',
      'build',
      'dist',
      'target',
      'vendor',
      'Pods',
      '.next',
      '.venv',
      'obj',
      'bin',
      '.plugin_symlinks',
      '.symlinks',
    ]) {
      await mkdir(Path.join(root, name, 'ignored', '.git'), { recursive: true })
    }
    const nested = Path.join(root, 'projects', 'nested')
    await mkdir(Path.join(nested, '.git'), { recursive: true })
    const result = await discoverHealthRepositories(root)
    assert.deepEqual(result.paths, [nested])
    assert.deepEqual(result.errors, [])
  })
  it('distinguishes an ahead branch from commits unpublished on every remote', async t => {
    const repo = await setupEmptyRepository(t)
    await run(repo.path, 'commit', '--allow-empty', '-m', 'base')
    await run(repo.path, 'remote', 'add', 'origin', repo.path)
    await run(repo.path, 'update-ref', 'refs/remotes/origin/master', 'HEAD')
    await run(repo.path, 'branch', '--set-upstream-to=origin/master')
    await run(repo.path, 'commit', '--allow-empty', '-m', 'published elsewhere')
    await run(repo.path, 'update-ref', 'refs/remotes/backup/master', 'HEAD')
    const result = await inspectHealthRepository(repo.path)
    assert.equal(result.unpublished, 0)
    assert.equal(result.branches[0].ahead, 1)
    assert.equal(needsHealthAttention(result), true)
    await run(repo.path, 'update-ref', '-d', 'refs/remotes/origin/master')
    assert.equal(
      (await inspectHealthRepository(repo.path)).branches[0].upstreamMissing,
      true
    )
  })

  it('fetches every remote while preserving uncommitted files', async t => {
    const repo = await setupEmptyRepository(t)
    const first = await setupEmptyRepository(t)
    const second = await setupEmptyRepository(t)
    await run(first.path, 'commit', '--allow-empty', '-m', 'first')
    await run(second.path, 'commit', '--allow-empty', '-m', 'second')
    await run(repo.path, 'remote', 'add', 'origin', first.path)
    await run(repo.path, 'remote', 'add', 'extra', second.path)
    await writeFile(Path.join(repo.path, 'local.txt'), 'dirty')
    const result = await performHealthOperation(repo.path, 'fetch')
    assert.deepEqual(result.errors, [])
    assert.equal(result.messages.length, 2)
    assert.equal(
      await run(repo.path, 'rev-parse', 'refs/remotes/extra/master'),
      await run(second.path, 'rev-parse', 'HEAD')
    )
    assert.equal(await run(repo.path, 'status', '--porcelain'), '?? local.txt')
  })

  it('continues fetching other remotes after a failure and skips updates', async t => {
    const repo = await setupEmptyRepository(t)
    const remote = await setupEmptyRepository(t)
    await run(remote.path, 'commit', '--allow-empty', '-m', 'base')
    await run(
      repo.path,
      'remote',
      'add',
      'a-broken',
      Path.join(repo.path, 'missing')
    )
    await run(repo.path, 'remote', 'add', 'working', remote.path)
    const result = await performHealthOperation(repo.path, 'update')
    assert.equal(result.errors.length, 1)
    assert(result.messages.includes('Fetched working'))
    assert(result.messages.includes('Updates skipped because fetching failed'))
  })

  it('only fast-forwards clean worktrees and never stashes local files', async t => {
    const repo = await setupEmptyRepository(t)
    await run(repo.path, 'commit', '--allow-empty', '-m', 'base')
    const original = await run(repo.path, 'rev-parse', 'HEAD')
    await run(repo.path, 'branch', 'upstream')
    await run(repo.path, 'config', 'branch.master.remote', '.')
    await run(repo.path, 'config', 'branch.master.merge', 'refs/heads/upstream')
    await run(repo.path, 'checkout', 'upstream')
    await run(repo.path, 'commit', '--allow-empty', '-m', 'new upstream')
    const updated = await run(repo.path, 'rev-parse', 'HEAD')
    await run(repo.path, 'checkout', 'master')
    await writeFile(Path.join(repo.path, 'local.txt'), 'dirty')
    assert.equal(
      await safelyUpdateHealthWorktree(repo.path),
      'Skipped: uncommitted files'
    )
    assert.equal(await run(repo.path, 'rev-parse', 'HEAD'), original)
    await run(repo.path, 'add', 'local.txt')
    await run(repo.path, 'commit', '-m', 'diverge')
    assert.equal(
      await safelyUpdateHealthWorktree(repo.path),
      'Skipped: branch has diverged'
    )
    // A separate clean branch can safely advance to the upstream commit.
    await run(repo.path, 'checkout', '-b', 'clean', original)
    await run(repo.path, 'config', 'branch.clean.remote', '.')
    await run(repo.path, 'config', 'branch.clean.merge', 'refs/heads/upstream')
    assert.equal(
      await safelyUpdateHealthWorktree(repo.path),
      'Fast-forwarded to upstream'
    )
    assert.equal(await run(repo.path, 'rev-parse', 'HEAD'), updated)
    assert.equal(await run(repo.path, 'stash', 'list'), '')
  })
})
