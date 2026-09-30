import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Row } from '../lib/row'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Commit } from '../../models/commit'

interface IWarningBeforeResetProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly commit: Commit
  readonly hard?: boolean
  readonly onDismissed: () => void
}

interface IWarningBeforeResetState {
  readonly isLoading: boolean
}

/**
 * Confirms a hard reset, or warns about uncommitted changes before a mixed reset.
 */
export class WarningBeforeReset extends React.Component<
  IWarningBeforeResetProps,
  IWarningBeforeResetState
> {
  public constructor(props: IWarningBeforeResetProps) {
    super(props)
    this.state = { isLoading: false }
  }

  public render() {
    const title = this.props.hard
      ? __DARWIN__
        ? 'Hard Reset to Commit'
        : 'Hard reset to commit'
      : __DARWIN__
      ? 'Reset to Commit'
      : 'Reset to commit'

    return (
      <Dialog
        id="warning-before-reset"
        type="warning"
        title={title}
        loading={this.state.isLoading}
        disabled={this.state.isLoading}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
        role="alertdialog"
        ariaDescribedBy="reset-warning-message"
      >
        <DialogContent>
          <Row id="reset-warning-message">
            {this.props.hard ? (
              <span>
                Reset the current branch to commit{' '}
                <strong>{this.props.commit.sha.slice(0, 7)}</strong> (
                {this.props.commit.summary})? All uncommitted changes to tracked
                files will be discarded. Commits after this target will be
                removed from the current branch, including published commits.
                Untracked files that obstruct restoring the target may also be
                deleted. The remote branch will remain unchanged.
              </span>
            ) : (
              <span>
                You have changes in progress. Resetting to a previous commit
                might result in some of these changes being lost. Do you want to
                continue anyway?
              </span>
            )}
          </Row>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            destructive={true}
            okButtonText={this.props.hard ? 'Hard reset' : 'Continue'}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onSubmit = async () => {
    const { dispatcher, repository, commit, onDismissed } = this.props
    this.setState({ isLoading: true })

    try {
      await dispatcher.resetToCommit(repository, commit, false, this.props.hard)
    } finally {
      this.setState({ isLoading: false })
    }

    onDismissed()
  }
}
