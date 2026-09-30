import { errorMessage } from '../../lib/repository-health'
import * as React from 'react'
import { Repository } from '../../models/repository'
import {
  getUnmergedBranches,
  getUnmergedBranchTargets,
  IBranchTarget,
  IUnmergedBranch,
} from '../../lib/git/unmerged-branches'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Button } from '../lib/button'
import { Select } from '../lib/select'

interface IProps {
  readonly repository: Repository
  readonly onDismissed: () => void
}
interface IState {
  readonly target: string
  readonly targets: ReadonlyArray<IBranchTarget>
  readonly branches: ReadonlyArray<IUnmergedBranch>
  readonly includeRemotes: boolean
  readonly busy: boolean
  readonly error: string | null
}

export class UnmergedBranchesDialog extends React.Component<IProps, IState> {
  private request = 0
  public constructor(props: IProps) {
    super(props)
    this.state = {
      target: 'HEAD',
      targets: [],
      branches: [],
      includeRemotes: true,
      busy: true,
      error: null,
    }
  }
  public componentDidMount() {
    this.refresh()
  }
  public componentWillUnmount() {
    this.request++
  }

  private refresh = async () => {
    const request = ++this.request
    this.setState({ busy: true, error: null })
    try {
      const [targets, branches] = await Promise.all([
        getUnmergedBranchTargets(this.props.repository.path),
        getUnmergedBranches(this.props.repository.path, this.state.target),
      ])
      if (request === this.request) {
        this.setState({ targets, branches, busy: false })
      }
    } catch (error) {
      if (request === this.request) {
        this.setState({ branches: [], busy: false, error: errorMessage(error) })
      }
    }
  }
  private onTargetChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.setState({ target: event.currentTarget.value }, this.refresh)
  }
  private onIncludeRemotesChanged = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    this.setState({ includeRemotes: event.currentTarget.checked })
  }
  public render() {
    const { busy, target, targets, error, includeRemotes } = this.state
    const branches = this.state.branches.filter(
      b => includeRemotes || !b.remote
    )
    return (
      <Dialog
        id="unmerged-branches"
        title="Unmerged branches"
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <p className="health-path">{this.props.repository.path}</p>
          <Select
            label="Not merged into"
            value={target}
            disabled={busy}
            onChange={this.onTargetChanged}
          >
            <option value="HEAD">Current worktree (HEAD)</option>
            {targets.map(branch => (
              <option key={branch.ref} value={branch.ref}>
                {branch.name}
                {branch.remote ? ' (remote)' : ''}
              </option>
            ))}
          </Select>
          <label>
            <input
              type="checkbox"
              checked={includeRemotes}
              onChange={this.onIncludeRemotesChanged}
            />{' '}
            Include remote branches
          </label>
          <p>
            Branches with commits outside the selected target’s history. This
            checks ancestry; squash merges and cherry-picks may still appear.
            Remote branches use cached refs.
          </p>
          <p role="status">
            {busy
              ? 'Checking branches…'
              : `${branches.length} unmerged branches`}
          </p>
          {error && <p className="health-error">{error}</p>}
          {!busy && !error && branches.length === 0 && (
            <p>All branch tips are already contained in this target.</p>
          )}
          {!busy && (
            <ul className="unmerged-branch-results">
              {branches.map(branch => (
                <li key={branch.ref}>
                  <strong>{branch.name}</strong>
                  {branch.remote ? ' (remote)' : ' (local)'}
                  <span>
                    {' '}
                    — {branch.commitsOutsideTarget} commits outside target
                  </span>
                  {branch.worktreePaths.map(path => (
                    <div className="health-path" key={path}>
                      {path}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
        <DialogFooter>
          <Button disabled={busy} onClick={this.refresh}>
            Refresh
          </Button>
          <Button onClick={this.props.onDismissed}>Close</Button>
        </DialogFooter>
      </Dialog>
    )
  }
}
