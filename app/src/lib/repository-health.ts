import * as Path from 'path'
import { readdir, realpath } from 'fs/promises'
import { Repository } from '../models/repository'
import { git } from './git/core'
import { listWorktrees } from './git/worktree'
import { getRemotes } from './git/remote'
import { fetch } from './git/fetch'
import { pathExists } from './path-exists'

export interface IHealthBranch {
  readonly name: string
  readonly upstream: string | null
  readonly unpublished: number
  readonly ahead: number
  readonly behind: number
  readonly upstreamMissing: boolean
}

export interface IHealthWorktree {
  readonly path: string
  readonly branch: string | null
  readonly files: ReadonlyArray<string>
  readonly unpublished: number
  readonly error?: string
}

export interface IRepositoryHealth {
  readonly path: string
  readonly commonDirectory: string
  readonly branches: ReadonlyArray<IHealthBranch>
  readonly worktrees: ReadonlyArray<IHealthWorktree>
  readonly unpublished: number
  readonly remotes: ReadonlyArray<string>
  readonly errors: ReadonlyArray<string>
}

export interface IHealthDiscovery {
  readonly paths: ReadonlyArray<string>
  readonly errors: ReadonlyArray<{ path: string; message: string }>
}

export type HealthOperation = 'fetch' | 'update'

export interface IHealthOperationResult {
  readonly path: string
  readonly messages: ReadonlyArray<string>
  readonly errors: ReadonlyArray<string>
}

const excludedDirectories = new Set([
  '.git',
  'node_modules',
  '.pnpm-store',
  '.cache',
  '.codex-cache',
  '.codex-go-cache',
  '.gradle',
  '.dart_tool',
  '__pycache__',
])

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

async function run(path: string, args: string[]) {
  return (await git(args, path, 'repositoryHealth')).stdout
}

/** Scan nested checkouts too, without following directory links or Git internals. */
export async function discoverHealthRepositories(
  root: string,
  signal?: AbortSignal
): Promise<IHealthDiscovery> {
  const paths: string[] = []
  const errors: { path: string; message: string }[] = []
  const pending = [Path.resolve(root)]
  while (pending.length > 0 && !signal?.aborted) {
    const path = pending.pop()!
    try {
      const entries = await readdir(path, { withFileTypes: true })
      if (entries.some(e => e.name === '.git')) {
        paths.push(path)
      }
      for (const entry of entries) {
        if (
          entry.isDirectory() &&
          !entry.isSymbolicLink() &&
          !excludedDirectories.has(entry.name.toLowerCase())
        ) {
          pending.push(Path.join(path, entry.name))
        }
      }
    } catch (error) {
      errors.push({ path, message: errorMessage(error) })
    }
  }
  return { paths, errors }
}

/** Canonical common-directory identity deduplicates registered worktrees. */
export async function getHealthRepositoryIdentity(path: string) {
  const topLevel = (await run(path, ['rev-parse', '--show-toplevel'])).trim()
  const common = (
    await run(topLevel, [
      'rev-parse',
      '--path-format=absolute',
      '--git-common-dir',
    ])
  ).trim()
  return {
    path: Path.normalize(topLevel),
    commonDirectory: await realpath(common),
  }
}

async function unpublishedCount(path: string, refs: string[]) {
  if (refs.length === 0) {
    return 0
  }
  return Number(
    await run(path, [
      'rev-list',
      '--count',
      ...refs,
      '--not',
      '--remotes',
      '--',
    ])
  )
}

export function needsHealthAttention(result: IRepositoryHealth) {
  return (
    result.errors.length > 0 ||
    result.remotes.length === 0 ||
    result.unpublished > 0 ||
    result.worktrees.some(w => w.files.length > 0 || w.error !== undefined) ||
    result.branches.some(
      b =>
        b.upstream === null || b.upstreamMissing || b.ahead > 0 || b.behind > 0
    )
  )
}

/** The report is local-only; remote reachability always uses cached refs. */
export async function inspectHealthRepository(
  path: string
): Promise<IRepositoryHealth> {
  const identity = await getHealthRepositoryIdentity(path)
  const repository = new Repository(identity.path, -1, null, false)
  const errors: string[] = []
  const branches: IHealthBranch[] = []
  const worktrees: IHealthWorktree[] = []
  const heads = new Set<string>()
  const remotes = await getRemotes(repository)
  const branchOutput = await run(identity.path, [
    'for-each-ref',
    '--format=%(refname)%00%(objectname)%00%(upstream)',
    'refs/heads',
  ])
  for (const line of branchOutput.trimEnd().split('\n').filter(Boolean)) {
    const [ref, sha, upstreamRef] = line.trimEnd().split('\0')
    heads.add(sha)
    try {
      let ahead = 0
      let behind = 0
      let upstreamMissing = false
      if (upstreamRef) {
        const upstream = await git(
          ['show-ref', '--verify', '--quiet', upstreamRef],
          identity.path,
          'healthUpstream',
          { successExitCodes: new Set([0, 1]) }
        )
        upstreamMissing = upstream.exitCode === 1
        if (!upstreamMissing) {
          const counts = await run(identity.path, [
            'rev-list',
            '--left-right',
            '--count',
            `${ref}...${upstreamRef}`,
            '--',
          ])
          ;[ahead, behind] = counts.trim().split(/\s+/).map(Number)
        }
      }
      branches.push({
        name: ref.replace(/^refs\/heads\//, ''),
        upstream: upstreamRef || null,
        unpublished: await unpublishedCount(identity.path, [sha]),
        ahead,
        behind,
        upstreamMissing,
      })
    } catch (error) {
      errors.push(`${ref}: ${errorMessage(error)}`)
    }
  }

  for (const worktree of await listWorktrees(repository)) {
    const branch = worktree.branch?.replace(/^refs\/heads\//, '') ?? null
    if (worktree.head && !/^0+$/.test(worktree.head)) {
      heads.add(worktree.head)
    }
    try {
      if (!(await pathExists(worktree.path))) {
        throw new Error('Missing or prunable worktree')
      }
      // Preserve Git's quoted filenames, including names containing newlines.
      const status = await run(worktree.path, [
        'status',
        '--porcelain=v1',
        '--untracked-files=all',
        '--ignore-submodules=none',
      ])
      worktrees.push({
        path: worktree.path,
        branch,
        files: status.trimEnd().split('\n').filter(Boolean),
        unpublished:
          worktree.head && !/^0+$/.test(worktree.head)
            ? await unpublishedCount(identity.path, [worktree.head])
            : 0,
      })
    } catch (error) {
      worktrees.push({
        path: worktree.path,
        branch,
        files: [],
        unpublished: 0,
        error: errorMessage(error),
      })
    }
  }
  let unpublished = 0
  try {
    unpublished = await unpublishedCount(identity.path, [...heads])
  } catch (error) {
    errors.push(errorMessage(error))
  }
  return {
    ...identity,
    branches,
    worktrees,
    unpublished,
    remotes: remotes.map(r => r.name),
    errors,
  }
}

/** Revalidate every worktree immediately before fast-forwarding its upstream. */
export async function safelyUpdateHealthWorktree(
  path: string
): Promise<string> {
  const gitDirectory = (
    await run(path, ['rev-parse', '--absolute-git-dir'])
  ).trim()
  for (const marker of [
    'MERGE_HEAD',
    'CHERRY_PICK_HEAD',
    'REVERT_HEAD',
    'rebase-merge',
    'rebase-apply',
    'sequencer',
    'BISECT_LOG',
    'index.lock',
  ]) {
    if (await pathExists(Path.join(gitDirectory, marker))) {
      return 'Skipped: another Git operation is in progress'
    }
  }
  if (
    (
      await run(path, [
        'status',
        '--porcelain=v1',
        '--untracked-files=all',
        '--ignore-submodules=none',
      ])
    ).length > 0
  ) {
    return 'Skipped: uncommitted files'
  }
  const branch = await git(
    ['symbolic-ref', '--quiet', 'HEAD'],
    path,
    'healthBranch',
    {
      successExitCodes: new Set([0, 1]),
    }
  )
  if (branch.exitCode !== 0) {
    return 'Skipped: detached HEAD'
  }
  const upstream = await git(
    ['rev-parse', '--verify', '@{upstream}'],
    path,
    'healthUpdateUpstream',
    { successExitCodes: new Set([0, 128]) }
  )
  if (upstream.exitCode !== 0) {
    return 'Skipped: no available upstream'
  }
  const counts = (
    await run(path, [
      'rev-list',
      '--left-right',
      '--count',
      'HEAD...@{upstream}',
      '--',
    ])
  )
    .trim()
    .split(/\s+/)
    .map(Number)
  if (counts[0] > 0) {
    return counts[1] > 0
      ? 'Skipped: branch has diverged'
      : 'Skipped: local commits ahead of upstream'
  }
  if (counts[1] === 0) {
    return 'Already up to date'
  }
  await run(path, [
    '-c',
    'merge.autostash=false',
    'merge',
    '--ff-only',
    '--no-autostash',
    upstream.stdout.trim(),
  ])
  return 'Fast-forwarded to upstream'
}

/** Fetch once per repository, keeping per-remote failures visible. */
export async function performHealthOperation(
  path: string,
  operation: HealthOperation,
  signal?: AbortSignal
): Promise<IHealthOperationResult> {
  const messages: string[] = []
  const errors: string[] = []
  const repository = new Repository(path, -1, null, false)
  const remotes = await getRemotes(repository)
  if (remotes.length === 0) {
    messages.push('Skipped: no configured remotes')
    return { path, messages, errors }
  }
  for (const remote of remotes) {
    if (signal?.aborted) {
      break
    }
    try {
      await fetch(repository, remote)
      messages.push(`Fetched ${remote.name}`)
    } catch (error) {
      errors.push(`${remote.name}: ${errorMessage(error)}`)
    }
  }
  if (operation === 'update' && errors.length === 0 && !signal?.aborted) {
    for (const worktree of await listWorktrees(repository)) {
      if (signal?.aborted) {
        break
      }
      try {
        const message = worktree.isLocked
          ? 'Skipped: locked worktree'
          : await safelyUpdateHealthWorktree(worktree.path)
        messages.push(`${worktree.path}: ${message}`)
      } catch (error) {
        errors.push(`${worktree.path}: ${errorMessage(error)}`)
      }
    }
  } else if (operation === 'update' && errors.length > 0) {
    messages.push('Updates skipped because fetching failed')
  }
  return { path, messages, errors }
}
