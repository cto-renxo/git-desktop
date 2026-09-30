import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as Path from 'path'
import { AppStore } from '../../src/lib/stores/app-store'
import { Repository } from '../../src/models/repository'
import { git } from '../../src/lib/git/core'
import { inspectHealthRepository } from '../../src/lib/repository-health'
import { setupEmptyRepository } from '../helpers/repositories'
import { createTempDirectory } from '../helpers/temp'

describe('repository health locking', () => {
  it('locks selected Git identities including linked checkouts, leaving unrelated busy repositories alone', async t => {
    const selected = await setupEmptyRepository(t)
    const unrelated = await setupEmptyRepository(t)
    await git(
      ['commit', '--allow-empty', '-m', 'base'],
      selected.path,
      'healthLockTest'
    )
    const linkedPath = Path.join(await createTempDirectory(t), 'linked')
    await git(
      ['worktree', 'add', '-b', 'linked', linkedPath],
      selected.path,
      'healthLockTest'
    )
    const linked = new Repository(linkedPath, 9999, null, false)
    const busy = new Map([
      [selected.path, false],
      [linked.path, false],
      [unrelated.path, true],
    ])
    const fake = {
      repositories: [selected, linked, unrelated],
      repositoryStateCache: {
        get: (repository: Repository) => ({
          isPushPullFetchInProgress: busy.get(repository.path),
          isCommitting: false,
          checkoutProgress: null,
        }),
        update: (
          repository: Repository,
          change: () => { isPushPullFetchInProgress: boolean }
        ) => {
          busy.set(repository.path, change().isPushPullFetchInProgress)
        },
      },
      emitUpdate: () => {},
      _refreshRepository: async () => {},
    }
    let results = 0
    await AppStore.prototype._performRepositoryHealthOperation.call(
      fake as unknown as AppStore,
      [await inspectHealthRepository(selected.path)],
      'fetch',
      new AbortController().signal,
      result => {
        results++
        assert.deepEqual(result.errors, [])
        assert.equal(busy.get(selected.path), true)
        assert.equal(busy.get(linked.path), true)
        assert.equal(busy.get(unrelated.path), true)
      }
    )
    assert.equal(results, 1)
    assert.equal(busy.get(selected.path), false)
    assert.equal(busy.get(linked.path), false)
    assert.equal(busy.get(unrelated.path), true)
  })
})
