import { realpath } from 'fs/promises'
import { git } from '../../lib/git/core'
import { getRepositoryType } from '../../lib/git/rev-parse'
import { discoverHealthRepositories } from '../../lib/repository-health'
import { folderGroupKey } from './folder-groups'

/** Add each discovered checkout independently so one failure cannot stop the import. */
export async function addFolderRepositories(
  folder: string,
  existingPaths: ReadonlyArray<string>,
  addRepositories: (paths: ReadonlyArray<string>) => Promise<unknown>
): Promise<ReadonlyArray<string>> {
  const discovered = await discoverHealthRepositories(folder)
  const errors = discovered.errors.map(
    error => error.path + ': ' + error.message
  )
  const known = new Set(existingPaths.map(folderGroupKey))
  for (const path of discovered.paths) {
    const key = folderGroupKey(path)
    if (known.has(key)) {
      continue
    }
    try {
      const type = await getRepositoryType(path)
      if (type.kind !== 'regular') {
        errors.push(path + ': Not an accessible working repository')
        continue
      }
      const commonDirectory = (
        await git(
          ['rev-parse', '--path-format=absolute', '--git-common-dir'],
          path,
          'folderRepositoryImport'
        )
      ).stdout.trimEnd()
      // Linked worktrees have private Git metadata inside the common directory.
      // A main checkout (including --separate-git-dir) uses the common directory itself.
      const [gitDirectory, common] = await Promise.all([
        realpath(type.gitDir),
        realpath(commonDirectory),
      ])
      if (folderGroupKey(gitDirectory) !== folderGroupKey(common)) {
        continue
      }
      await addRepositories([path])
      known.add(key)
    } catch (error) {
      errors.push(
        path + ': ' + (error instanceof Error ? error.message : String(error))
      )
    }
  }
  return errors
}
