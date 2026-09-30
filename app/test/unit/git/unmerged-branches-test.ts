import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as Path from 'path'
import { setupEmptyRepository } from '../../helpers/repositories'
import { createTempDirectory } from '../../helpers/temp'
import { git } from '../../../src/lib/git/core'
import {
  getUnmergedBranches,
  getUnmergedBranchTargets,
} from '../../../src/lib/git/unmerged-branches'

async function run(path: string, ...args: string[]) {
  return (await git(args, path, 'unmergedTest')).stdout.trim()
}

describe('unmerged branches', () => {
  it('compares all local and remote branches with the chosen target', async t => {
    const repository = await setupEmptyRepository(t)
    const path = repository.path
    await run(path, 'commit', '--allow-empty', '-m', 'base')
    await run(path, 'branch', 'already-merged')
    await run(path, 'checkout', '-b', 'feature')
    await run(path, 'commit', '--allow-empty', '-m', 'feature')
    await run(path, 'update-ref', 'refs/remotes/origin/feature', 'HEAD')
    await run(
      path,
      'symbolic-ref',
      'refs/remotes/origin/HEAD',
      'refs/remotes/origin/feature'
    )
    await run(path, 'checkout', 'master')
    const branches = await getUnmergedBranches(path)
    assert.deepEqual(
      branches.map(b => b.name),
      ['feature', 'origin/feature']
    )
    assert(branches.every(b => b.commitsOutsideTarget === 1))
    assert.deepEqual(await getUnmergedBranches(path, 'refs/heads/feature'), [])
    const targets = await getUnmergedBranchTargets(path)
    assert(!targets.some(b => b.name === 'origin/HEAD'))
    assert(targets.some(b => b.ref === 'refs/heads/already-merged'))
  })

  it('uses the selected linked worktree HEAD and records branch checkout paths', async t => {
    const repo = await setupEmptyRepository(t)
    await run(repo.path, 'commit', '--allow-empty', '-m', 'base')
    const linked = Path.join(await createTempDirectory(t), 'linked')
    await run(repo.path, 'worktree', 'add', '-b', 'feature', linked)
    await run(linked, 'commit', '--allow-empty', '-m', 'feature')
    const fromMain = await getUnmergedBranches(repo.path)
    assert.equal(fromMain.length, 1)
    assert.deepEqual(
      fromMain[0].worktreePaths.map(p => Path.resolve(p)),
      [Path.resolve(linked)]
    )
    assert.deepEqual(await getUnmergedBranches(linked), [])
    await run(linked, 'checkout', '--detach')
    assert.deepEqual(await getUnmergedBranches(linked), [])
  })

  it('reports invalid or unborn targets as errors', async t => {
    const repo = await setupEmptyRepository(t)
    await assert.rejects(getUnmergedBranches(repo.path))
    await run(repo.path, 'commit', '--allow-empty', '-m', 'base')
    await assert.rejects(getUnmergedBranches(repo.path, 'refs/heads/missing'))
  })
})
