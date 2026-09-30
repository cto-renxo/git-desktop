import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'

import { Repository } from '../../../src/models/repository'
import { reset, resetPaths, GitResetMode } from '../../../src/lib/git/reset'
import { getStatusOrThrow } from '../../helpers/status'
import { setupFixtureRepository } from '../../helpers/repositories'
import { exec } from 'dugite'

import { unlink, writeFile } from 'fs/promises'

describe('git/reset', () => {
  describe('reset', () => {
    it('can hard reset a repository', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(testRepoPath, -1, null, false)

      const repoPath = repository.path
      const fileName = 'README.md'
      const filePath = path.join(repoPath, fileName)

      await writeFile(filePath, 'Hi world\n')

      await reset(repository, GitResetMode.Hard, 'HEAD')

      const status = await getStatusOrThrow(repository)
      assert.equal(status.workingDirectory.files.length, 0)
    })

    it('rewinds commits and discards staged and unstaged changes', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(testRepoPath, -1, null, false)
      const filePath = path.join(testRepoPath, 'README.md')
      const target = await exec(['rev-parse', 'HEAD'], testRepoPath)
      assert.equal(target.exitCode, 0)
      const targetSHA = target.stdout.trim()

      await writeFile(filePath, 'Committed change\n')
      assert.equal((await exec(['add', 'README.md'], testRepoPath)).exitCode, 0)
      assert.equal(
        (await exec(['commit', '-m', 'Change README'], testRepoPath)).exitCode,
        0
      )
      await writeFile(filePath, 'Staged change\n')
      assert.equal((await exec(['add', 'README.md'], testRepoPath)).exitCode, 0)
      await writeFile(filePath, 'Unstaged change\n')

      await reset(repository, GitResetMode.Hard, targetSHA)

      const head = await exec(['rev-parse', 'HEAD'], testRepoPath)
      assert.equal(head.exitCode, 0)
      assert.equal(head.stdout.trim(), targetSHA)
      assert.equal(
        (await getStatusOrThrow(repository)).workingDirectory.files.length,
        0
      )
    })
  })

  describe('resetPaths', () => {
    it.skip('resets discarded staged file', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(testRepoPath, -1, null, false)

      const repoPath = repository.path
      const fileName = 'README.md'
      const filePath = path.join(repoPath, fileName)

      // modify the file
      await writeFile(filePath, 'Hi world\n')

      // stage the file, then delete it to mimic discarding
      exec(['add', fileName], repoPath)
      await unlink(filePath)

      await resetPaths(repository, GitResetMode.Mixed, 'HEAD', [filePath])

      // then checkout the version from the index to restore it
      await exec(['checkout-index', '-f', '-u', '-q', '--', fileName], repoPath)

      const status = await getStatusOrThrow(repository)
      assert.equal(status.workingDirectory.files.length, 0)
    })
  })
})
