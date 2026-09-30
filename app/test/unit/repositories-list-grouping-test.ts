import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as Path from 'path'
import {
  normalizeFolderGroups,
  findFolderGroup,
} from '../../src/ui/repositories-list/folder-groups'
import { groupRepositories } from '../../src/ui/repositories-list/group-repositories'
import { Repository, ILocalRepositoryState } from '../../src/models/repository'
import { CloningRepository } from '../../src/models/cloning-repository'
import { gitHubRepoFixture } from '../helpers/github-repo-builder'

describe('repository list grouping', () => {
  const repositories: Array<Repository | CloningRepository> = [
    new Repository('repo1', 1, null, false),
    new Repository(
      'repo2',
      2,
      gitHubRepoFixture({ owner: 'me', name: 'my-repo2' }),
      false
    ),
    new Repository(
      'repo3',
      3,
      gitHubRepoFixture({
        owner: '',
        name: 'my-repo3',
        endpoint: 'https://github.big-corp.com/api/v3',
      }),
      false
    ),
  ]

  const cache = new Map<number, ILocalRepositoryState>()

  it('keeps Recent first, then folders, with owner fallback for unmatched repositories', () => {
    const root = Path.resolve('folder-group-fixture')
    const folderRepo = new Repository(
      Path.join(root, 'project'),
      10,
      gitHubRepoFixture({ owner: 'me', name: 'project' }),
      false
    )
    const others = Array.from(
      { length: 7 },
      (_, i) =>
        new Repository(
          Path.resolve(`outside-${i}`),
          i,
          gitHubRepoFixture({ owner: 'me', name: `outside-${i}` }),
          false
        )
    )
    const grouped = groupRepositories(
      [folderRepo, ...others],
      cache,
      [10],
      [root]
    )
    assert.deepEqual(
      grouped.map(g => g.identifier.kind),
      ['recent', 'folder', 'dotcom']
    )
    assert.deepEqual(
      grouped[0].items.map(i => i.repository.id),
      [10]
    )
    assert.deepEqual(
      grouped[1].items.map(i => i.repository.id),
      [10]
    )
    assert.equal(grouped[2].items.length, 7)
    assert.equal(
      groupRepositories([folderRepo], cache, [], [])[0].identifier.kind,
      'dotcom'
    )
  })

  it('uses the deepest folder and respects boundaries, roots, and normalized paths', () => {
    const root = Path.resolve('folder-group-fixture')
    const nested = Path.join(root, 'nested')
    assert.equal(
      findFolderGroup(Path.join(nested, 'repo'), [root, nested]),
      nested
    )
    assert.equal(findFolderGroup(root + '-other', [root]), undefined)
    assert.equal(findFolderGroup(root, [root]), root)
    assert.equal(
      findFolderGroup(Path.join(root, 'a', '..', 'repo'), [root]),
      root
    )
    assert.equal(
      findFolderGroup(root, [Path.parse(root).root]),
      Path.parse(root).root
    )
    assert.equal(
      normalizeFolderGroups([root, root + Path.sep, 'relative']).length,
      1
    )
    if (process.platform === 'win32') {
      assert.equal(
        findFolderGroup('d:/REALEASY/repo', ['D:\\RealEasy\\']),
        'D:\\RealEasy\\'
      )
      assert.equal(
        findFolderGroup('E:\\RealEasy\\repo', ['D:\\RealEasy']),
        undefined
      )
      assert.equal(
        findFolderGroup('\\\\server\\share\\group\\repo', [
          '\\\\server\\share\\group',
        ]),
        '\\\\server\\share\\group'
      )
    }
  })

  it('disambiguates equal names from different owners in a folder group', () => {
    const root = Path.resolve('folder-group-fixture')
    const repos = ['alice', 'bob'].map(
      (owner, id) =>
        new Repository(
          Path.join(root, owner, 'repo'),
          id,
          gitHubRepoFixture({ owner, name: 'repo' }),
          false
        )
    )
    const grouped = groupRepositories(repos, cache, [], [root])
    assert.equal(grouped.length, 1)
    assert(grouped[0].items.every(item => item.needsDisambiguation))
  })

  it('groups repositories by owners/Enterprise/Other', () => {
    const grouped = groupRepositories(repositories, cache, [])
    assert.equal(grouped.length, 3)

    assert.equal(grouped[0].identifier.kind, 'dotcom')
    assert.equal((grouped[0].identifier as any).owner.login, 'me')
    assert.equal(grouped[0].items.length, 1)

    let item = grouped[0].items[0]
    assert.equal(item.repository.path, 'repo2')

    assert.equal(grouped[1].identifier.kind, 'enterprise')
    assert.equal(grouped[1].items.length, 1)

    item = grouped[1].items[0]
    assert.equal(item.repository.path, 'repo3')

    assert.equal(grouped[2].identifier.kind, 'other')
    assert.equal(grouped[2].items.length, 1)

    item = grouped[2].items[0]
    assert.equal(item.repository.path, 'repo1')
  })

  it('sorts repositories alphabetically within each group', () => {
    const repoA = new Repository('a', 1, null, false)
    const repoB = new Repository(
      'b',
      2,
      gitHubRepoFixture({ owner: 'me', name: 'b' }),
      false
    )
    const repoC = new Repository('c', 2, null, false)
    const repoD = new Repository(
      'd',
      2,
      gitHubRepoFixture({ owner: 'me', name: 'd' }),
      false
    )
    const repoZ = new Repository('z', 3, null, false)

    const grouped = groupRepositories(
      [repoC, repoB, repoZ, repoD, repoA],
      cache,
      []
    )
    assert.equal(grouped.length, 2)

    assert.equal(grouped[0].identifier.kind, 'dotcom')
    assert.equal((grouped[0].identifier as any).owner.login, 'me')
    assert.equal(grouped[0].items.length, 2)

    let items = grouped[0].items
    assert.equal(items[0].repository.path, 'b')
    assert.equal(items[1].repository.path, 'd')

    assert.equal(grouped[1].identifier.kind, 'other')
    assert.equal(grouped[1].items.length, 3)

    items = grouped[1].items
    assert.equal(items[0].repository.path, 'a')
    assert.equal(items[1].repository.path, 'c')
    assert.equal(items[2].repository.path, 'z')
  })

  it('only disambiguates Enterprise repositories', () => {
    const repoA = new Repository(
      'repo',
      1,
      gitHubRepoFixture({ owner: 'user1', name: 'repo' }),
      false
    )
    const repoB = new Repository(
      'repo',
      2,
      gitHubRepoFixture({ owner: 'user2', name: 'repo' }),
      false
    )
    const repoC = new Repository(
      'enterprise-repo',
      3,
      gitHubRepoFixture({
        owner: 'business',
        name: 'enterprise-repo',
        endpoint: 'https://ghe.io/api/v3',
      }),
      false
    )
    const repoD = new Repository(
      'enterprise-repo',
      3,
      gitHubRepoFixture({
        owner: 'silliness',
        name: 'enterprise-repo',
        endpoint: 'https://ghe.io/api/v3',
      }),
      false
    )

    const grouped = groupRepositories([repoA, repoB, repoC, repoD], cache, [])
    assert.equal(grouped.length, 3)

    assert.equal(grouped[0].identifier.kind, 'dotcom')
    assert.equal((grouped[0].identifier as any).owner.login, 'user1')
    assert.equal(grouped[0].items.length, 1)

    assert.equal(grouped[1].identifier.kind, 'dotcom')
    assert.equal((grouped[1].identifier as any).owner.login, 'user2')
    assert.equal(grouped[1].items.length, 1)

    assert.equal(grouped[2].identifier.kind, 'enterprise')
    assert.equal(grouped[2].items.length, 2)

    assert.equal(grouped[0].items[0].text[0], 'repo')
    assert(!grouped[0].items[0].needsDisambiguation)

    assert.equal(grouped[1].items[0].text[0], 'repo')
    assert(!grouped[1].items[0].needsDisambiguation)

    assert.equal(grouped[2].items[0].text[0], 'enterprise-repo')
    assert(grouped[2].items[0].needsDisambiguation)

    assert.equal(grouped[2].items[1].text[0], 'enterprise-repo')
    assert(grouped[2].items[1].needsDisambiguation)
  })
})
