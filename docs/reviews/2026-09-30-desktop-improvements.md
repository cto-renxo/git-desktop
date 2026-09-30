# Review: desktop-improvements changes of 2026-09-30

Commits `c933d57` through `3b336d3` on `desktop-improvements`. Source changes only; tests under `app/test` were not reviewed, and nothing was built or run.

| Commit | Change |
| --- | --- |
| `3b336d3` | Add confirmed hard reset to History commit menu |
| `1a4c896` | Update gitignore submodule with corrected Clojure template |
| `e0c8f20` | Improve Windows local build and WSL launch tooling |
| `62d8d8c` | Compile and launch development bundles without packaging |
| `a69ec04` | Align history tag spacing and scroll increments |
| `76879b3` | Add discovered main repositories when creating folder groups |
| `ee614fc` | Add local GitHub Desktop build and packaging tools |
| `6ced712` | Improve repository health, branch discovery, and checkout actions |
| `48cd951` | Add configurable collapsible repository folder groups |
| `c933d57` | Show compact scrollable tag lists in history rows |

## Verification and attribution (2026-09-30)

This section supersedes the provisional conclusions and fix suggestions below wherever they disagree. Verification used committed source at `3b336d39ff`, compared with upstream baseline `f2686bcec9`, plus Git history and blame. The configured user identity and authors of the introducing commits are `CTO <cto@renxo.tech>`. The worktree contained concurrent uncommitted changes and advanced to `fd7b03f2e7` during inspection; these verdicts concern the original reviewed endpoint, not a verification of subsequent changes.

No files were changed during verification. No build, application launch, benchmark, private-remote authentication test, or live upstream submodule-availability check was performed. Source and history support four of the five reported bugs. The missing-account claim is incorrect for this version. No confirmed pre-existing upstream bug was identified among these findings.

### Reported bugs

| Finding | Verified verdict | Origin |
| --- | --- | --- |
| 1. Development server exits on rebuild errors | Confirmed: the renderer compiler's `done` hook calls `process.exit(1)` on every compilation error, including watch rebuilds. This terminates the server process; Electron termination was not verified. | Introduced by user commit `62d8d8c`; hook absent upstream. Evidence: `script/start.ts`, `ReportDevelopmentErrors`. |
| 2. Folder import accepts submodules | Confirmed: discovery finds nested `.git` entries, and equality of Git directory and common directory excludes linked worktrees but does not exclude submodules. | Import introduced by user commit `76879b3`, using discovery from `6ced712`. Evidence: `addFolderRepositories` in `app/src/ui/repositories-list/add-folder-repositories.ts`. |
| 3. Unbounded folder scan | Confirmed performance risk: no depth limit, nine excluded names, and traversal continues inside repositories. Actual delay was not measured. Nested discovery is explicitly intentional; stopping at the first repository or imposing depth four changes behavior and needs a design decision. | Introduced by user commit `6ced712`. Evidence: `discoverHealthRepositories` in `app/src/lib/repository-health.ts`. |
| 4. Health fetch lacks an account | Rejected: `fetch` and `envForRemoteOperation` have no account parameter in this version or the upstream baseline. Normal GitStore fetch uses the same API. Git execution installs Desktop's credential helper, which obtains stored account tokens. The proposed third account argument would occupy the progress-callback parameter and is not a valid fix. Stale account-related comments are inherited. | No demonstrated authentication regression. Evidence: `app/src/lib/git/fetch.ts`, `environment.ts`, `core.ts`, and `app/src/lib/trampoline/trampoline-environment.ts` / `trampoline-credential-helper.ts`. |
| 5. VS Code action always offered | Confirmed menu-availability defect: item is unconditional and enabled when the directory exists; installed-editor resolution and fallback/error handling occur after clicking. | Introduced by user commit `6ced712`. Evidence: `getFolderActions` in `app/src/ui/lib/folder-actions.ts`. |

### Behavior changes

| Observation | Verified verdict | Origin |
| --- | --- | --- |
| Foreground Fetch broadens refspecs and fetches all configured remotes | Confirmed, explicitly intentional branch discovery. Background fetch preserves configured behavior. Applying the wide refspec only when configuration is narrower still broadens single-branch clones, so that suggestion does not preserve their original restriction. | User commit `6ced712`; `app/src/lib/git/fetch.ts`, `app/src/lib/stores/git-store.ts`. |
| Health operations lock all registered repositories | Confirmed: busy flags cover all registered repositories for the whole run. An unrelated busy repository can also prevent starting the operation. | User commit `6ced712`; `AppStore._performRepositoryHealthOperation`. |
| WSL detection always enabled | Confirmed policy change from `enableBetaFeatures()` to `true`; no demonstrated launch failure. | User commit `6ced712`; `app/src/lib/feature-flag.ts`. |
| Repository menu available without selection | Confirmed change, but child gating is already correct. Shell, folder and settings actions are scoped; push, pull, fetch and GitHub actions have separate disable logic. All need not be in `repositoryScopedIDs`. No missing-gating defect found. | Parent change in user commit `6ced712`; relevant child gating already existed upstream. Evidence: `app/src/lib/menu-update.ts`. |
| axe DevTools removed | Confirmed removal of automatic development-extension installation, not application functionality. | User commit `62d8d8c`; `app/src/main-process/main.ts`. |
| Updates and delta packages disabled without custom feed | Confirmed. Production/beta delta generation remains possible when a feed is configured. Update policy is documented; the delta consequence is not explicit in the reviewed documentation. | User commit `ee614fc`; `script/dist-info.ts`, `app/src/ui/lib/update-store.ts`, `docs/technical/desktop-local-build.md`. |

### Minor items

| Item | Verified verdict | Origin |
| --- | --- | --- |
| Sequential unmerged-branch counts | Confirmed performance concern; one awaited Git process per returned unmerged branch, not per every remote branch. No timing measured. | User commit `6ced712`; `app/src/lib/git/unmerged-branches.ts`. |
| Stale collapsed folder-group keys | Confirmed: removal does not prune persisted keys or the list component's in-memory collapsed set. Re-adding a group can restore its previous collapsed state. A storage-only correction must also account for component state. | User folder-group work `48cd951` / `6ced712`; `app/src/ui/repositories-list/repositories-list.tsx`, `App.onFolderGroupsChanged`. |
| Error prefixes | Partly confirmed: the AppStore health wrapper and unmerged-branches dialog use `String(error)`. `repository-health.ts` already uses its local `errorMessage` helper and does not need the suggested replacement. | Confirmed occurrences introduced by user commit `6ced712`; `app/src/lib/stores/app-store.ts`, `app/src/ui/branches/unmerged-branches-dialog.tsx`. |
| Shared reset statistic | Confirmed behavior, not necessarily a defect. The existing total-reset counter includes the new hard-reset mode; separate telemetry requires a reporting requirement. | Counter pre-existed; hard-reset inclusion introduced by user commit `3b336d3`; `app/src/ui/dispatcher/dispatcher.ts`. |
| Windows x64 local packager | Confirmed platform limitation, not a bug. The `finally` cleanup is appropriate for failures. | User commit `ee614fc`; `script/package-local.mjs`. |
| Gitignore submodule publication | Unresolved sharing risk: `ebcf0afa6a` exists locally and is the committed parent pointer. No inspected remote-tracking branch contains it. The worktree submodule's origin points to the other local checkout; that checkout's upstream submodule clone lacks the object. This does not prove current absence on GitHub. Verify upstream availability before sharing; do not treat an empty cached branch-containment result as definitive proof or automatically push to the upstream project. | Parent pointer introduced by user commit `1a4c896`; submodule commit also authored by `CTO <cto@renxo.tech>`. |

### Revised action order

- [ ] Fix renderer watch-error termination.
- [ ] Exclude submodules from folder import and expand discovery exclusions; decide depth and nested-repository behavior before changing traversal semantics.
- [ ] Gate explicit VS Code actions by installed-editor availability.
- [ ] Review the scope of health-operation locking.
- [ ] Confirm intended foreground-fetch, WSL, development-extension and update policies; document the delta consequence.
- [ ] Clean up confirmed error-prefix occurrences and stale collapsed state, including component state.
- [ ] Verify the submodule commit is obtainable from the intended published source before sharing.
- [ ] Consider bounded concurrency for unmerged-branch counts and separate reset telemetry if required.

Do not implement the proposed account argument or change repository-menu child gating based on this review: those findings are not supported by the inspected version.

## Original provisional review

The following records the initial review. Read it with the verified verdicts above; its authentication claim, blanket menu-gating concern, and some minor-item details are superseded.

## Bugs

### 1. Dev server exits on any renderer compile error

`script/start.ts` (`62d8d8c`). The `done` hook calls `process.exit(1)` whenever `stats.hasErrors()`. It fires on every watch rebuild, so a typo saved mid-edit kills the dev server, the middleware and Electron.

Fix: exit only on the first compile; afterwards log and keep watching.

```typescript
let firstBuild = true
compiler.hooks.done.tap('ReportDevelopmentErrors', stats => {
  if (stats.hasErrors()) {
    console.error(stats.toString({ all: false, errors: true, colors: true }))
    if (firstBuild) {
      process.exit(1)
    }
  }
  firstBuild = false
})
```

### 2. Folder-group import adds submodules as repositories

`app/src/ui/repositories-list/add-folder-repositories.ts` (`76879b3`). `discoverHealthRepositories` returns every directory containing a `.git` entry, including submodule checkouts whose `.git` is a file pointing into the parent's `.git/modules/`. For a submodule, `git rev-parse --git-common-dir` equals its own git dir, so the main-checkout test passes and the submodule is added as a standalone repository.

Fix: skip paths whose git dir lives under another repository's `.git/modules`. `getRepositoryType` already resolves `gitDir`.

```typescript
const gitDirectory = await realpath(type.gitDir)
if (/[\\/]\.git[\\/]modules[\\/]/.test(gitDirectory)) {
  continue // submodule of another checkout
}
```

Also stop descending into a directory once it is identified as a repository unless nested repositories are wanted (see 3).

### 3. Folder scan has no depth limit and a short skip list

`app/src/lib/repository-health.ts` (`6ced712`). The scan walks every subdirectory except nine names and continues inside each repository it finds. On a folder of Unity, Flutter, Node and Go projects this reads `Library/`, `Temp/`, `build/`, `dist/`, `target/`, `vendor/`, `Pods/`, `.next/` and similar, which can take minutes.

Fix: cap the depth, extend the skip list, and stop at the first `.git` found.

```typescript
const excludedDirectories = new Set([
  '.git', 'node_modules', '.pnpm-store', '.cache', '.codex-cache',
  '.codex-go-cache', '.gradle', '.dart_tool', '__pycache__',
  'library', 'temp', 'build', 'dist', 'target', 'vendor', 'pods',
  '.next', '.venv', 'venv', 'obj', 'bin', '.idea', '.vs',
])
const MaxDepth = 4

const pending: Array<{ path: string; depth: number }> = [
  { path: Path.resolve(root), depth: 0 },
]
while (pending.length > 0 && !signal?.aborted) {
  const { path, depth } = pending.pop()!
  try {
    const entries = await readdir(path, { withFileTypes: true })
    if (entries.some(e => e.name === '.git')) {
      paths.push(path)
      continue // do not scan inside a repository
    }
    if (depth >= MaxDepth) {
      continue
    }
    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        !entry.isSymbolicLink() &&
        !excludedDirectories.has(entry.name.toLowerCase())
      ) {
        pending.push({ path: Path.join(path, entry.name), depth: depth + 1 })
      }
    }
  } catch (error) {
    errors.push({ path, message: errorMessage(error) })
  }
}
```

If nested repositories inside a repository are a requirement, keep descending but keep the depth cap and the extended skip list.

### 4. Health fetch runs without an account

`app/src/lib/repository-health.ts` (`6ced712`). `performHealthOperation` calls `fetch(repository, remote)` with no account. `envForRemoteOperation(remote.url)` then has no token to inject, so private GitHub remotes that rely on Desktop's stored credentials fail with authentication errors. It works on a machine whose credential manager holds a token; it fails elsewhere.

Fix: resolve the account the same way `GitStore.fetch` does and pass it through.

```typescript
// performHealthOperation(path, operation, signal, getAccountForRemote)
for (const remote of remotes) {
  const account = await getAccountForRemote(remote.url)
  await fetch(repository, remote, account ?? undefined)
}
```

In `AppStore._performRepositoryHealthOperation`, pass a resolver built on `this.accounts` with `getAccountForEndpoint` on the remote host.

### 5. "Open in Visual Studio Code" is always shown

`app/src/ui/lib/folder-actions.ts` (`6ced712`). The menu item is unconditional. When VS Code is not installed, `openInSelectedExternalEditor` fails after the click.

Fix: pass the detected editors and only offer VS Code when it is among them.

```typescript
export interface IFolderActions {
  // ...
  readonly availableEditors: ReadonlyArray<string>
}

const hasVSCode = config.availableEditors.includes('Visual Studio Code')
// ...
...(hasVSCode
  ? [{
      label: 'Open in Visual Studio Code',
      action: () => config.openEditor(path, 'Visual Studio Code'),
      enabled: !missing,
    }]
  : []),
```

The list comes from `getAvailableEditors()` in `lib/editors`; cache it once on startup.

## Behaviour changes to confirm

| Change | Where | Effect | If unintended |
| --- | --- | --- | --- |
| User fetch overrides configured refspecs | `lib/git/fetch.ts`, `stores/git-store.ts` (`6ced712`) | Every manual Fetch passes `--refmap=` and `+refs/heads/*:refs/remotes/<remote>/*`, fetches all configured remotes, and `--prune` prunes against the full branch set. Single-branch clones start pulling every branch. Fetch also reloads remotes and branches afterwards. | Add the wide refspec only when `remote.<name>.fetch` is narrower than `refs/heads/*`; read it with `git config --get-all remote.<name>.fetch`. |
| Health run locks every repository | `app-store.ts` `_performRepositoryHealthOperation` | Sets `isPushPullFetchInProgress` on all registered repositories for the whole run; push/pull/fetch is disabled app-wide until it finishes or is aborted. | Lock only the repositories in the run; release each as its worker finishes. |
| WSL detection always on | `feature-flag.ts` `enableWSLDetection` | Returns `true` regardless of the beta-features setting. | Return `enableBetaFeatures() \|\| __WIN32__` or keep the flag. |
| Repository menu always enabled | `menu-update.ts`, `'repository'` removed from `repositoryScopedIDs` | The menu opens with no repository selected so Repository Health is reachable. Its children need their own gating. | Verify `push`, `pull`, `fetch`, `open-in-shell`, `open-working-directory`, `view-repository-on-github`, `repository-settings` are all in the scoped list. |
| axe DevTools extension removed | `main-process/main.ts` (`62d8d8c`) | Only React DevTools is installed in development. | Restore the `axeDevTools` entry. |
| Auto-update off unless `DESKTOP_UPDATES_URL` is set | `script/dist-info.ts`, `update-store.ts`, `about.tsx` (`ee614fc`) | Correct for a fork. Side effect: `shouldMakeDelta()` returns `false`, so production and beta builds ship no delta packages. | Fine as is; note it in `docs/technical/desktop-local-build.md`. |

## Minor issues

### Unmerged-branches dialog is slow on large repos

`app/src/lib/git/unmerged-branches.ts`. One `rev-list --count` per branch, sequentially. 300 remote branches means 300 git processes before the list renders.

```typescript
const refs = parseBranchRefs(result.stdout)
const counts = await Promise.all(
  refs.map(branch =>
    git(['rev-list', '--count', `${sha}..${branch.ref}`, '--'], path, 'unmergedBranchCount')
      .then(r => Number(r.stdout))
  )
)
```

Wrap in a limiter (`p-limit` is a transitive dependency, or a 6-wide manual pool) if process count matters.

### Removed folder groups leave stale collapsed state

`repositories-list.tsx`. `collapsed-repository-folder-groups` keeps the key of a group after it is removed. Fix in `App.onFolderGroupsChanged`:

```typescript
const keys = new Set(this.folderGroups.map(f => `1:folder:${folderGroupKey(f)}`))
setStringArray(
  'collapsed-repository-folder-groups',
  getStringArray('collapsed-repository-folder-groups').filter(k => keys.has(k))
)
```

### Error strings carry an `Error:` prefix

`repository-health.ts`, `unmerged-branches-dialog.tsx`, `app-store.ts`. `String(error)` on an `Error` yields `Error: message`. Use the existing `errorMessage(error)` helper wherever `String(error)` appears.

### Hard reset and mixed reset share one stat counter

`dispatcher.ts`. Both increment `resetToCommitCount`. Add `hardResetToCommitCount` to the stats schema and increment it when `hard` is true.

### `package-local.mjs` is Windows x64 only

Stated in the script; fine for now. The `finally` `rm(staging)` after a successful rename is a no-op; leave it, it covers the failure path.

### Submodule commit may not be pushed

`app/static/common/gitignore` at `ebcf0afa6a`. If that commit exists only in the local submodule clone, a fresh `git submodule update` fails for anyone else. Check with `git -C app/static/common/gitignore branch -r --contains ebcf0afa6a`; if empty, push the submodule branch first.

## Suggested fix order

- [ ] Dev server exit on rebuild errors (bug 1) — blocks daily work, 5-line fix
- [ ] Health fetch without account (bug 4) — breaks the feature on private remotes
- [ ] Submodule import + scan depth/skip list (bugs 2, 3) — same area, fix together
- [ ] VS Code menu item gating (bug 5)
- [ ] Confirm the six behaviour changes; adjust fetch refspec and menu gating if needed
- [ ] `String(error)` → `errorMessage(error)`; stale collapsed keys; hard-reset stat
- [ ] Verify the gitignore submodule commit is pushed before sharing the branch
- [ ] Parallelise unmerged-branch counts when convenient

Looked correct, no change needed: the hard-reset confirmation flow, the linked-worktree exclusion in folder import, the fast-forward-only guards in `safelyUpdateHealthWorktree`, folder-group path matching on Windows, and the local packaging script's staging and rename.
