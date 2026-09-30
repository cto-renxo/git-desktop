import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { IBranchesState } from '../../src/lib/app-state'
import {
  ForcePushBranchState,
  getCurrentBranchForcePushState,
} from '../../src/lib/rebase'
import { Branch, BranchType } from '../../src/models/branch'
import { TipState } from '../../src/models/tip'

function state(
  recordedSHA?: string
): Pick<IBranchesState, 'tip' | 'forcePushBranches'> {
  return {
    tip: {
      kind: TipState.Valid,
      branch: new Branch(
        'main',
        'origin/main',
        { sha: 'target' },
        BranchType.Local,
        'refs/heads/main'
      ),
    },
    forcePushBranches: recordedSHA
      ? new Map([['main', recordedSHA]])
      : new Map(),
  }
}

describe('force push availability after reset', () => {
  it('recommends force push for an intentional reset behind the remote', () => {
    assert.equal(
      getCurrentBranchForcePushState(state('target'), { ahead: 0, behind: 3 }),
      ForcePushBranchState.Recommended
    )
  })
  it('does not offer force push for an ordinary behind-only branch', () => {
    assert.equal(
      getCurrentBranchForcePushState(state(), { ahead: 0, behind: 3 }),
      ForcePushBranchState.NotAvailable
    )
  })
  it('does not use a stale history rewrite marker', () => {
    assert.equal(
      getCurrentBranchForcePushState(state('old-tip'), { ahead: 0, behind: 3 }),
      ForcePushBranchState.NotAvailable
    )
  })
  it('does not offer force push after the remote matches the reset', () => {
    assert.equal(
      getCurrentBranchForcePushState(state('target'), { ahead: 0, behind: 0 }),
      ForcePushBranchState.NotAvailable
    )
  })
  it('preserves force push availability for diverged branches', () => {
    assert.equal(
      getCurrentBranchForcePushState(state(), { ahead: 1, behind: 3 }),
      ForcePushBranchState.Available
    )
  })
  it('requires a tracking branch', () => {
    assert.equal(
      getCurrentBranchForcePushState(state('target'), null),
      ForcePushBranchState.NotAvailable
    )
  })
})
