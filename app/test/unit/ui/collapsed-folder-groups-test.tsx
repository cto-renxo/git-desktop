import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as React from 'react'
import * as Path from 'path'
import { RepositoriesList } from '../../../src/ui/repositories-list/repositories-list'
import { getGroupKey } from '../../../src/ui/repositories-list/group-repositories'
import { getStringArray, setStringArray } from '../../../src/lib/local-storage'
import { render, waitFor } from '../../helpers/ui/render'
import { Dispatcher } from '../../../src/ui/dispatcher'

describe('collapsed folder group cleanup', () => {
  it('clears storage and component state on removal and does not restore collapse on re-add', async t => {
    const key = 'collapsed-repository-folder-groups'
    const previous = getStringArray(key)
    t.after(() => setStringArray(key, previous))
    const removed = Path.resolve('removed-folder')
    const kept = Path.resolve('kept-folder')
    const removedKey = getGroupKey({ kind: 'folder', path: removed })
    const keptKey = getGroupKey({ kind: 'folder', path: kept })
    setStringArray(key, [removedKey, keptKey])
    const ref = React.createRef<RepositoriesList>()
    const noop = () => {}
    const props = {
      folderGroups: [removed, kept],
      onAddFolderGroup: async () => {},
      onFolderGroupsChanged: noop,
      selectedRepository: null,
      repositories: [],
      recentRepositories: [],
      localRepositoryStateLookup: new Map(),
      onSelectionChanged: noop,
      askForConfirmationOnRemoveRepository: true,
      onRemoveRepository: noop,
      onShowRepository: noop,
      onViewOnGitHub: noop,
      onOpenInShell: noop,
      onOpenInExternalEditor: noop,
      onFilterTextChanged: noop,
      filterText: '',
      dispatcher: {} as Dispatcher,
    }
    const view = render(<RepositoriesList {...props} ref={ref} />)
    view.rerender(
      <RepositoriesList {...props} folderGroups={[kept]} ref={ref} />
    )
    await waitFor(() =>
      assert.deepEqual([...ref.current!.state.collapsedFolderGroups], [keptKey])
    )
    assert.deepEqual(getStringArray(key), [keptKey])
    view.rerender(<RepositoriesList {...props} ref={ref} />)
    await waitFor(() =>
      assert.equal(
        ref.current!.state.collapsedFolderGroups.has(removedKey),
        false
      )
    )
    assert.deepEqual(getStringArray(key), [keptKey])
    view.unmount()
  })
})
