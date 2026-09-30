import { git } from './core'
import { listWorktrees } from './worktree'

export interface IBranchTarget {
  readonly ref: string
  readonly name: string
  readonly remote: boolean
}

export interface IUnmergedBranch extends IBranchTarget {
  readonly commitsOutsideTarget: number
  readonly worktreePaths: ReadonlyArray<string>
}

function parseBranchRefs(output: string): IBranchTarget[] {
  return output
    .trimEnd()
    .split('\n')
    .filter(Boolean)
    .flatMap(line => {
      const [ref, symbolicRef] = line.trimEnd().split('\0')
      if (symbolicRef) {
        return []
      }
      return [
        {
          ref,
          name: ref.replace(/^refs\/(heads|remotes)\//, ''),
          remote: ref.startsWith('refs/remotes/'),
        },
      ]
    })
}

export async function getUnmergedBranchTargets(
  path: string
): Promise<ReadonlyArray<IBranchTarget>> {
  const result = await git(
    [
      'for-each-ref',
      '--format=%(refname)%00%(symref)',
      'refs/heads',
      'refs/remotes',
    ],
    path,
    'unmergedBranchTargets'
  )
  return parseBranchRefs(result.stdout)
}

/** Uses ancestry, like git branch --no-merged; squash merges may still appear. */
export async function getUnmergedBranches(
  path: string,
  target = 'HEAD'
): Promise<ReadonlyArray<IUnmergedBranch>> {
  // Resolve once so all counts refer to the same target even if a ref moves.
  const commit = await git(
    ['rev-parse', '--verify', '--end-of-options', `${target}^{commit}`],
    path,
    'unmergedBranchTarget'
  )
  const sha = commit.stdout.trim()
  const result = await git(
    [
      'for-each-ref',
      `--no-merged=${sha}`,
      '--format=%(refname)%00%(symref)',
      'refs/heads',
      'refs/remotes',
    ],
    path,
    'unmergedBranches'
  )
  const worktrees = await listWorktrees(path)
  const branches: IUnmergedBranch[] = []
  for (const branch of parseBranchRefs(result.stdout)) {
    const count = await git(
      ['rev-list', '--count', `${sha}..${branch.ref}`, '--'],
      path,
      'unmergedBranchCount'
    )
    branches.push({
      ...branch,
      commitsOutsideTarget: Number(count.stdout),
      worktreePaths: worktrees
        .filter(w => w.branch === branch.ref)
        .map(w => w.path),
    })
  }
  return branches
}
