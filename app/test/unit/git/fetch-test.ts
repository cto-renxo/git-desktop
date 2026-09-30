import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Repository } from '../../../src/models/repository'
import {
  setupFixtureRepository,
  setupEmptyRepository,
} from '../../helpers/repositories'
import {
  getBranches,
  getBranchesDifferingFromUpstream,
} from '../../../src/lib/git/for-each-ref'
import { Branch } from '../../../src/models/branch'
import { fastForwardBranches } from '../../../src/lib/git'
import * as Path from 'path'
import { readFile } from 'fs/promises'
import { fetch } from '../../../src/lib/git/fetch'
import { git } from '../../../src/lib/git/core'

function branchWithName(branches: ReadonlyArray<Branch>, name: string) {
  return branches.filter(branch => branch.name === name)[0]
}

describe('git/fetch', () => {
  it('discovers new remote branches even with a single-branch fetch refspec', async t => {
    const remote = await setupEmptyRepository(t)
    const local = await setupEmptyRepository(t)
    const config = '+refs/heads/master:refs/remotes/origin/master'
    await git(
      ['commit', '--allow-empty', '-m', 'initial'],
      remote.path,
      'testSetup'
    )
    await git(['remote', 'add', 'origin', remote.path], local.path, 'testSetup')
    await git(
      ['config', 'remote.origin.fetch', config],
      local.path,
      'testSetup'
    )
    await fetch(local, { name: 'origin', url: remote.path })
    assert(
      !(await getBranches(local)).some(b => b.name === 'origin/new-feature')
    )
    await git(['checkout', '-b', 'new-feature'], remote.path, 'testSetup')
    await git(
      ['commit', '--allow-empty', '-m', 'new remote work'],
      remote.path,
      'testSetup'
    )
    const remoteSha = (
      await git(['rev-parse', 'HEAD'], remote.path, 'testSetup')
    ).stdout.trim()

    await fetch(local, { name: 'origin', url: remote.path })
    const branch = (await getBranches(local)).find(
      b => b.name === 'origin/new-feature'
    )
    assert.ok(branch, 'The newly created remote branch must be discoverable')
    assert.equal(branch.tip.sha, remoteSha)
    assert.equal(
      (
        await git(
          ['config', '--get', 'remote.origin.fetch'],
          local.path,
          'testSetup'
        )
      ).stdout.trim(),
      config
    )
  })

  describe('fastForwardBranches', () => {
    it('fast-forwards branches using fetch', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'repo-with-non-updated-branches'
      )
      const repository = new Repository(testRepoPath, -1, null, false)

      const eligibleBranches = await getBranchesDifferingFromUpstream(
        repository
      )

      await fastForwardBranches(repository, eligibleBranches)

      const resultBranches = await getBranches(repository)

      // Only the branch behind was updated to match its upstream
      const branchBehind = branchWithName(resultBranches, 'branch-behind')
      assert(branchBehind.upstream !== null)

      const branchBehindUpstream = branchWithName(
        resultBranches,
        branchBehind.upstream
      )
      assert.equal(branchBehindUpstream.tip.sha, branchBehind.tip.sha)

      // The branch ahead is still ahead
      const branchAhead = branchWithName(resultBranches, 'branch-ahead')
      assert(branchAhead.upstream !== null)

      const branchAheadUpstream = branchWithName(
        resultBranches,
        branchAhead.upstream
      )

      assert.notEqual(branchAheadUpstream.tip.sha, branchAhead.tip.sha)

      // The branch ahead and behind is still ahead and behind
      const branchAheadAndBehind = branchWithName(
        resultBranches,
        'branch-ahead-and-behind'
      )
      assert(branchAheadAndBehind.upstream !== null)

      const branchAheadAndBehindUpstream = branchWithName(
        resultBranches,
        branchAheadAndBehind.upstream
      )
      assert.notEqual(
        branchAheadAndBehindUpstream.tip.sha,
        branchAheadAndBehind.tip.sha
      )

      // The main branch hasn't been updated, since it's the current branch
      const mainBranch = branchWithName(resultBranches, 'main')
      assert(mainBranch.upstream !== null)

      const mainUpstream = branchWithName(resultBranches, mainBranch.upstream)
      assert.notEqual(mainUpstream.tip.sha, mainBranch.tip.sha)

      // The up-to-date branch is still matching its upstream
      const upToDateBranch = branchWithName(resultBranches, 'branch-up-to-date')
      assert(upToDateBranch.upstream !== null)
      const upToDateBranchUpstream = branchWithName(
        resultBranches,
        upToDateBranch.upstream
      )
      assert.equal(upToDateBranchUpstream.tip.sha, upToDateBranch.tip.sha)
    })

    // We want to avoid messing with the FETCH_HEAD file. Normally, it shouldn't
    // be something users would rely on, but we want to be good gitizens
    // (:badpundog:) when possible.
    it('does not change FETCH_HEAD after fast-forwarding branches with fetch', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'repo-with-non-updated-branches'
      )
      const repository = new Repository(testRepoPath, -1, null, false)

      const eligibleBranches = await getBranchesDifferingFromUpstream(
        repository
      )

      const fetchHeadPath = Path.join(repository.path, '.git', 'FETCH_HEAD')
      const previousFetchHead = await readFile(fetchHeadPath, 'utf-8')

      await fastForwardBranches(repository, eligibleBranches)

      const currentFetchHead = await readFile(fetchHeadPath, 'utf-8')

      assert.equal(currentFetchHead, previousFetchHead)
    })
  })
})
