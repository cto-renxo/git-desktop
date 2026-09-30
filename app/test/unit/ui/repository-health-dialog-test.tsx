import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as React from 'react'
import { writeFile } from 'fs/promises'
import * as Path from 'path'
import { setupEmptyRepository } from '../../helpers/repositories'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'
import { RepositoryHealthDialog } from '../../../src/ui/repositories-list/repository-health-dialog'
import { UnmergedBranchesDialog } from '../../../src/ui/branches/unmerged-branches-dialog'
import { Dispatcher } from '../../../src/ui/dispatcher'
import {
  HealthOperation,
  IRepositoryHealth,
  IHealthOperationResult,
} from '../../../src/lib/repository-health'
import { git } from '../../../src/lib/git/core'

const onDismissed = () => {}

describe('repository health dialogs', () => {
  it('fetches only selected visible repositories and retains operation errors', async t => {
    const electron = await import('electron')
    const previousSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    t.after(() => {
      electron.ipcRenderer.send = previousSend
    })
    const dirty = await setupEmptyRepository(t)
    const clean = await setupEmptyRepository(t)
    await writeFile(Path.join(dirty.path, 'local.txt'), 'dirty')
    for (const args of [
      ['commit', '--allow-empty', '-m', 'base'],
      ['remote', 'add', 'origin', clean.path],
      ['update-ref', 'refs/remotes/origin/master', 'HEAD'],
      ['branch', '--set-upstream-to=origin/master'],
    ]) {
      await git(args, clean.path, 'healthDialogTest')
    }
    const performed: string[][] = []
    const dispatcher = {
      async performRepositoryHealthOperation(
        repositories: ReadonlyArray<IRepositoryHealth>,
        operation: HealthOperation,
        _signal: AbortSignal,
        onResult: (result: IHealthOperationResult) => void
      ) {
        assert.equal(operation, 'fetch')
        performed.push(repositories.map(r => r.path))
        onResult({
          path: dirty.path,
          messages: [],
          errors: ['Remote fetch failed'],
        })
      },
    } as unknown as Dispatcher
    const view = render(
      <RepositoryHealthDialog
        repositories={[dirty, clean]}
        dispatcher={dispatcher}
        onDismissed={onDismissed}
      />
    )
    await waitFor(
      () =>
        assert.ok(
          screen.getByRole('button', {
            name: 'Fetch selected (1)',
            hidden: true,
          })
        ),
      { timeout: 15000 }
    )
    assert.match(view.container.textContent ?? '', /local.txt/)
    fireEvent.click(screen.getByLabelText('Needs attention only'))
    assert.ok(
      screen.getByRole('button', { name: 'Fetch selected (2)', hidden: true })
    )
    fireEvent.click(screen.getByLabelText('Needs attention only'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Fetch selected (1)', hidden: true })
    )
    await waitFor(() => assert.equal(performed.length, 1))
    assert.deepEqual(performed[0], [dirty.path])
    await waitFor(
      () =>
        assert.ok(
          screen.getByRole('button', {
            name: 'Fetch selected (1)',
            hidden: true,
          })
        ),
      { timeout: 15000 }
    )
    assert.ok(screen.getByText('Remote fetch failed'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Clear selection', hidden: true })
    )
    assert.equal(
      screen
        .getByRole('button', { name: 'Fetch selected (0)', hidden: true })
        .getAttribute('aria-disabled'),
      'true'
    )
    view.unmount()
  })

  it('updates the unmerged list when the comparison target changes', async t => {
    const electron = await import('electron')
    const previousSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    t.after(() => {
      electron.ipcRenderer.send = previousSend
    })
    const repository = await setupEmptyRepository(t)
    for (const args of [
      ['commit', '--allow-empty', '-m', 'base'],
      ['checkout', '-b', 'feature'],
      ['commit', '--allow-empty', '-m', 'feature'],
      ['checkout', 'master'],
    ]) {
      await git(args, repository.path, 'unmergedDialogTest')
    }
    const view = render(
      <UnmergedBranchesDialog
        repository={repository}
        onDismissed={onDismissed}
      />
    )
    await waitFor(() => assert.ok(screen.getByText('1 unmerged branches')), {
      timeout: 15000,
    })
    fireEvent.change(screen.getByLabelText('Not merged into'), {
      target: { value: 'refs/heads/feature' },
    })
    await waitFor(
      () =>
        assert.ok(
          screen.getByText(
            'All branch tips are already contained in this target.'
          )
        ),
      { timeout: 15000 }
    )
    assert.equal(
      view.container.querySelectorAll('.unmerged-branch-results li').length,
      0
    )
    view.unmount()
  })
})
