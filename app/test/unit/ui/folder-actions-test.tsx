import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getFolderActions } from '../../../src/ui/lib/folder-actions'
import { Shell } from '../../../src/lib/shells/win32'
import { generateWorktreeContextMenuItems } from '../../../src/ui/worktrees/worktree-list-item-context-menu'
import { generateBranchContextMenuItems } from '../../../src/ui/branches/branch-list-item-context-menu'
import { generateRepositoryListContextMenu } from '../../../src/ui/repositories-list/repository-list-item-context-menu'
import { Branch, BranchType } from '../../../src/models/branch'
import { Repository } from '../../../src/models/repository'

describe('shared folder actions', () => {
  it('does not offer VS Code when it is not installed, even with a stale preference', () => {
    const actions = getFolderActions({
      path: 'D:/repo',
      missing: false,
      availableEditors: ['Notepad++'],
      editorLabel: 'Visual Studio Code',
      shellLabel: 'Command Prompt',
      openShell: () => {},
      openEditor: () => {},
      reveal: () => {},
      copy: () => {},
    })
    assert.equal(
      actions.some(action => action.label === 'Open in Visual Studio Code'),
      false
    )
  })
  for (const path of [
    'D:\\Projects\\repo',
    "D:\\Projects\\repo worktrees\\fix & user's issue",
  ]) {
    it(`targets the exact checkout path: ${path}`, () => {
      const calls: unknown[][] = []
      const actions = getFolderActions({
        path,
        missing: false,
        availableEditors: ['Visual Studio Code'],
        editorLabel: 'Visual Studio Code',
        shellLabel: 'Windows Terminal',
        openShell: (...args) => calls.push(args),
        openEditor: (p, editor) => calls.push(['editor', p, editor]),
        reveal: p => calls.push(['explorer', p]),
        copy: p => calls.push(['copy', p]),
      })
      if (__WIN32__) {
        actions.find(a => a.label === 'Open in Command Prompt')!.action!()
        actions.find(a => a.label === 'Open in WSL')!.action!()
        assert.deepEqual(calls.splice(0), [
          [path, Shell.Cmd],
          [path, Shell.WSL],
        ])
      }
      actions.find(a => a.label === 'Open in Windows Terminal')!.action!()
      actions.find(a => a.label === 'Open in Visual Studio Code')!.action!()
      actions.find(a => a.label === 'Copy path')!.action!()
      assert.deepEqual(calls, [
        [path],
        ['editor', path, 'Visual Studio Code'],
        ['copy', path],
      ])

      const menu = generateWorktreeContextMenuItems({
        path,
        isMainWorktree: false,
        isLocked: true,
        folderActions: actions,
        onRemoveWorktree: () => {},
      })
      assert.equal(menu.filter(a => a.label === 'Copy path').length, 1)
      assert.ok(actions.every(a => menu.includes(a)))
      assert.equal(menu.find(a => a.label === 'Delete…')!.enabled, false)

      const branchMenu = generateBranchContextMenuItems({
        branch: new Branch(
          'main',
          null,
          { sha: 'abc' },
          BranchType.Local,
          'refs/heads/main'
        ),
        folderActions: actions,
      })
      const noop = () => {}
      const repositoryMenu = generateRepositoryListContextMenu({
        repository: new Repository(path, 1, null, false),
        shellLabel: 'Windows Terminal',
        externalEditorLabel: 'Visual Studio Code',
        askForConfirmationOnRemoveRepository: true,
        onViewOnGitHub: noop,
        onOpenInShell: noop,
        onShowRepository: noop,
        onOpenInExternalEditor: noop,
        onRemoveRepository: noop,
        onChangeRepositoryAlias: noop,
        onRemoveRepositoryAlias: noop,
        getFolderActions: (requestedPath, missing) => {
          assert.equal(requestedPath, path)
          assert.equal(missing, false)
          return actions
        },
      })
      for (const contextMenu of [branchMenu, repositoryMenu]) {
        assert.deepEqual(
          contextMenu.filter(item => actions.includes(item)),
          actions
        )
        assert.equal(
          contextMenu.filter(item => item.label === 'Copy path').length,
          1
        )
        contextMenu.find(item => item.label === 'Copy path')!.action!()
        assert.deepEqual(calls[calls.length - 1], ['copy', path])
      }
    })
  }

  it('keeps copying available for a missing checkout and disables launches', () => {
    let copied = ''
    const actions = getFolderActions({
      path: 'D:\\missing',
      missing: true,
      availableEditors: ['Visual Studio Code'],
      editorLabel: undefined,
      shellLabel: 'Command Prompt',
      openShell: () => {},
      openEditor: () => {},
      reveal: () => {},
      copy: p => {
        copied = p
      },
    })
    assert.ok(
      actions
        .filter(
          a =>
            a.label?.startsWith('Open') ||
            a.label?.startsWith('Reveal') ||
            a.label?.startsWith('Show')
        )
        .every(a => a.enabled === false)
    )
    actions.find(a => a.label === 'Copy path')!.action!()
    assert.equal(copied, 'D:\\missing')
    if (__WIN32__) {
      assert.equal(
        actions.filter(a => a.label === 'Open in Command Prompt').length,
        1
      )
    }
  })
})
