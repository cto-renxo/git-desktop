import { git } from '../../lib/git/core'
import * as React from 'react'
import * as Path from 'path'
import { Repository } from '../../models/repository'
import {
  discoverHealthRepositories,
  errorMessage,
  getHealthRepositoryIdentity,
  inspectHealthRepository,
  needsHealthAttention,
  IRepositoryHealth,
  IHealthBranch,
  IHealthOperationResult,
  HealthOperation,
} from '../../lib/repository-health'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Button } from '../lib/button'
import { Select } from '../lib/select'
import { Dispatcher } from '../dispatcher'
import { showOpenDialog } from '../main-process-proxy'

interface IProps {
  readonly repositories: ReadonlyArray<Repository>
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
}

function upstreamLabel(branch: IHealthBranch | undefined) {
  if (branch === undefined) {
    return 'upstream unavailable'
  }
  if (branch.upstream === null) {
    return 'no upstream'
  }
  const name = branch.upstream.replace(/^refs\/(remotes|heads)\//, '')
  return `${name}${branch.upstreamMissing ? ' (missing)' : ''}`
}

interface IState {
  readonly scope: 'added' | 'folder'
  readonly folder: string
  readonly results: ReadonlyArray<IRepositoryHealth>
  readonly errors: ReadonlyArray<string>
  readonly operations: ReadonlyArray<IHealthOperationResult>
  readonly selected: ReadonlySet<string>
  readonly attentionOnly: boolean
  readonly busy: boolean
  readonly progress: string
}

export class RepositoryHealthDialog extends React.Component<IProps, IState> {
  private controller = new AbortController()
  private mounted = false

  public constructor(props: IProps) {
    super(props)
    this.state = {
      scope: 'added',
      folder: '',
      results: [],
      errors: [],
      operations: [],
      selected: new Set(),
      attentionOnly: true,
      busy: false,
      progress: 'Choose a scope and check repositories.',
    }
  }

  public componentDidMount() {
    this.mounted = true
    this.check()
  }

  public componentWillUnmount() {
    this.mounted = false
    this.controller.abort()
  }

  private scan = async () => {
    const signal = this.controller.signal
    const discovery =
      this.state.scope === 'folder'
        ? await discoverHealthRepositories(this.state.folder, signal)
        : { paths: this.props.repositories.map(r => r.path), errors: [] }
    const seen = new Set<string>()
    const results: IRepositoryHealth[] = []
    const errors = discovery.errors.map(e => `${e.path}: ${e.message}`)
    for (const path of discovery.paths) {
      if (signal.aborted || !this.mounted) {
        break
      }
      this.setState({ progress: `Checking ${path}` })
      try {
        const superproject = await git(
          ['rev-parse', '--show-superproject-working-tree'],
          path,
          'healthSubmoduleCheck'
        )
        if (superproject.stdout.trim().length > 0) {
          continue
        }
        const identity = await getHealthRepositoryIdentity(path)
        if (seen.has(identity.commonDirectory)) {
          continue
        }
        results.push(await inspectHealthRepository(identity.path))
        seen.add(identity.commonDirectory)
      } catch (error) {
        errors.push(`${path}: ${errorMessage(error)}`)
      }
      if (this.mounted) {
        this.setState({ results: [...results], errors: [...errors] })
      }
    }
    if (this.mounted) {
      this.setState({
        results,
        errors,
        selected: new Set(results.map(r => r.commonDirectory)),
        progress: signal.aborted
          ? 'Stopped. Results are incomplete.'
          : `Checked ${results.length} repositories and ${results.reduce(
              (n, r) => n + r.worktrees.length,
              0
            )} worktrees.`,
      })
    }
  }

  private check = async () => {
    if (
      this.state.busy ||
      (this.state.scope === 'folder' && !this.state.folder)
    ) {
      return
    }
    this.controller = new AbortController()
    this.setState({
      busy: true,
      results: [],
      errors: [],
      operations: [],
      selected: new Set(),
      progress: 'Finding repositories…',
    })
    try {
      await this.scan()
    } catch (error) {
      if (this.mounted) {
        this.setState({ errors: [String(error)] })
      }
    } finally {
      if (this.mounted) {
        this.setState({ busy: false })
      }
    }
  }

  private chooseFolder = async () => {
    const folder = await showOpenDialog({ properties: ['openDirectory'] })
    if (folder !== null && this.mounted) {
      this.setState({
        folder,
        scope: 'folder',
        results: [],
        selected: new Set(),
        operations: [],
        errors: [],
      })
    }
  }

  private visibleResults() {
    return this.state.results.filter(
      r => !this.state.attentionOnly || needsHealthAttention(r)
    )
  }

  private selectedResults() {
    // Hidden rows are never acted on. The button count reflects this exact set.
    return this.visibleResults().filter(r =>
      this.state.selected.has(r.commonDirectory)
    )
  }

  private perform = async (operation: HealthOperation) => {
    const selected = this.selectedResults()
    if (this.state.busy || selected.length === 0) {
      return
    }
    this.controller = new AbortController()
    this.setState({
      busy: true,
      operations: [],
      progress:
        operation === 'fetch'
          ? 'Fetching all remotes…'
          : 'Fetching and safely updating worktrees…',
    })
    try {
      await this.props.dispatcher.performRepositoryHealthOperation(
        selected,
        operation,
        this.controller.signal,
        result => {
          if (this.mounted) {
            this.setState(s => ({
              operations: [...s.operations, result],
              progress: `Finished ${result.path}`,
            }))
          }
        }
      )
      if (!this.controller.signal.aborted) {
        await this.scan()
      } else if (this.mounted) {
        this.setState({
          progress:
            'Stopped. Some repositories may not have been processed. Check again to refresh the report.',
        })
      }
    } catch (error) {
      if (this.mounted) {
        this.setState(s => ({ errors: [...s.errors, String(error)] }))
      }
    } finally {
      if (this.mounted) {
        this.setState({ busy: false })
      }
    }
  }

  private open = async (path: string) => {
    try {
      const existing = this.props.repositories.find(r => r.path === path)
      const repository =
        existing ?? (await this.props.dispatcher.addRepositories([path]))[0]
      if (repository) {
        this.props.onDismissed()
        await this.props.dispatcher.selectRepository(repository)
      }
    } catch (error) {
      if (this.mounted) {
        this.setState(s => ({ errors: [...s.errors, String(error)] }))
      }
    }
  }

  private onSelectionChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = new Set(this.state.selected)
    if (event.currentTarget.checked) {
      selected.add(event.currentTarget.value)
    } else {
      selected.delete(event.currentTarget.value)
    }
    this.setState({ selected })
  }

  private onScopeChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.setState({
      scope: event.currentTarget.value as 'added' | 'folder',
      results: [],
      selected: new Set(),
      operations: [],
      errors: [],
      progress: 'Choose a scope and check repositories.',
    })
  }

  private onAttentionChanged = (event: React.ChangeEvent<HTMLInputElement>) =>
    this.setState({ attentionOnly: event.currentTarget.checked })

  private selectVisible = () =>
    this.setState({
      selected: new Set(this.visibleResults().map(r => r.commonDirectory)),
    })
  private clearSelection = () => this.setState({ selected: new Set() })
  private fetchSelected = () => this.perform('fetch')
  private updateSelected = () => this.perform('update')
  private stop = () => {
    this.controller.abort()
    this.setState({
      progress: 'Stopping after in-flight Git operations finish…',
    })
  }

  private onOpenWorktree = (event: React.MouseEvent<HTMLButtonElement>) => {
    const path =
      event.currentTarget.closest<HTMLElement>('[data-health-path]')?.dataset
        .healthPath
    if (path) {
      this.open(path)
    }
  }

  private renderRepository = (result: IRepositoryHealth) => (
    <article className="health-repository" key={result.commonDirectory}>
      <div className="health-repository-heading">
        <label>
          <input
            type="checkbox"
            disabled={this.state.busy}
            checked={this.state.selected.has(result.commonDirectory)}
            value={result.commonDirectory}
            onChange={this.onSelectionChanged}
          />
          <strong>{Path.basename(result.path)}</strong>
        </label>
        <span>{result.unpublished} unpublished commits</span>
      </div>
      <div className="health-path">{result.path}</div>
      {result.remotes.length === 0 && (
        <p>No configured remotes — repository is unpublished.</p>
      )}
      {result.errors.map((error, i) => (
        <p className="health-error" key={i}>
          {error}
        </p>
      ))}
      {result.worktrees.map(worktree => (
        <details
          className="health-worktree"
          key={worktree.path}
          open={
            worktree.files.length > 0 ||
            worktree.unpublished > 0 ||
            !!worktree.error
          }
        >
          <summary>
            {worktree.branch ?? 'Detached HEAD'}
            {worktree.branch !== null &&
              ` → ${upstreamLabel(
                result.branches.find(branch => branch.name === worktree.branch)
              )}`}
            {' · '}
            {worktree.files.length} uncommitted files · {worktree.unpublished}{' '}
            unpublished commits
          </summary>
          <div
            className="health-worktree-content"
            data-health-path={worktree.path}
          >
            <div className="health-path">{worktree.path}</div>
            {worktree.error && <p className="health-error">{worktree.error}</p>}
            {worktree.files.length > 0 && (
              <pre>{worktree.files.join('\n')}</pre>
            )}
            <Button
              disabled={this.state.busy || !!worktree.error}
              onClick={this.onOpenWorktree}
            >
              Open in Desktop
            </Button>
          </div>
        </details>
      ))}
      <details
        open={result.branches.some(
          b =>
            b.unpublished > 0 ||
            b.ahead > 0 ||
            b.behind > 0 ||
            b.upstreamMissing ||
            b.upstream === null
        )}
      >
        <summary>All local branches ({result.branches.length})</summary>
        <ul className="health-branches">
          {result.branches.map(branch => (
            <li key={branch.name}>
              <strong>{branch.name}</strong> → {upstreamLabel(branch)}:{' '}
              {branch.unpublished} unpublished commits
              {branch.upstream !== null &&
                !branch.upstreamMissing &&
                ` · ${branch.ahead} ahead, ${branch.behind} behind`}
            </li>
          ))}
        </ul>
      </details>
    </article>
  )

  public render() {
    const { busy, scope, folder, attentionOnly } = this.state
    const visible = this.visibleResults()
    const selectedCount = this.selectedResults().length
    return (
      <Dialog
        id="repository-health"
        title="Repository health"
        onDismissed={this.props.onDismissed}
        dismissDisabled={busy}
      >
        <DialogContent>
          <div className="health-scope">
            <Select
              label="Repositories"
              disabled={busy}
              value={scope}
              onChange={this.onScopeChanged}
            >
              <option value="added">Added to Desktop</option>
              <option value="folder">Folder and subfolders</option>
            </Select>
            {scope === 'folder' && (
              <Button disabled={busy} onClick={this.chooseFolder}>
                Choose folder…
              </Button>
            )}
            <Button
              disabled={busy || (scope === 'folder' && !folder)}
              onClick={this.check}
            >
              Check repositories
            </Button>
          </div>
          {scope === 'folder' && (
            <p className="health-path">
              {folder || 'Choose the folder to scan.'}
            </p>
          )}
          <p className="health-description">
            Includes registered worktrees, even outside the selected folder.
            Folder scans skip Git internals, dependency caches, and directory
            links. Publication checks use cached remote refs; fetch to refresh
            them.
          </p>
          <div className="health-filter">
            <label>
              <input
                type="checkbox"
                checked={attentionOnly}
                disabled={busy}
                onChange={this.onAttentionChanged}
              />{' '}
              Needs attention only
            </label>
            <Button
              disabled={busy || visible.length === 0}
              onClick={this.selectVisible}
            >
              Select visible
            </Button>
            <Button
              disabled={busy || selectedCount === 0}
              onClick={this.clearSelection}
            >
              Clear selection
            </Button>
          </div>
          <p role="status">{this.state.progress}</p>
          {this.state.errors.map((error, i) => (
            <p className="health-error" key={i}>
              {error}
            </p>
          ))}
          {this.state.operations.length > 0 && (
            <details className="health-operation-results" open={true}>
              <summary>
                Operation results ({this.state.operations.length})
              </summary>
              {this.state.operations.map(result => (
                <div key={result.path}>
                  <strong className="health-path">{result.path}</strong>
                  {result.messages.map((message, i) => (
                    <div key={i}>{message}</div>
                  ))}
                  {result.errors.map((error, i) => (
                    <div className="health-error" key={i}>
                      {error}
                    </div>
                  ))}
                </div>
              ))}
            </details>
          )}
          {!busy && visible.length === 0 && (
            <p>
              {this.state.results.length > 0
                ? 'No repositories need attention.'
                : 'No repositories found in this scope.'}
            </p>
          )}
          <div className="health-results">
            {visible.map(this.renderRepository)}
          </div>
        </DialogContent>
        <DialogFooter>
          {busy ? (
            <Button onClick={this.stop}>Stop</Button>
          ) : (
            <>
              <Button
                disabled={selectedCount === 0}
                onClick={this.fetchSelected}
              >
                Fetch selected ({selectedCount})
              </Button>
              <Button
                disabled={selectedCount === 0}
                onClick={this.updateSelected}
                tooltip="Fetch all remotes, then fast-forward clean worktrees with an available upstream. Dirty, detached, diverged, and locked worktrees are skipped."
              >
                Safely update selected
              </Button>
              <Button onClick={this.props.onDismissed}>Close</Button>
            </>
          )}
        </DialogFooter>
      </Dialog>
    )
  }
}
