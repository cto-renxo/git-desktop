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

## Status at a glance

| # | Finding | Verdict | Status |
| --- | --- | --- | --- |
| B1 | Dev server exits on rebuild errors | Confirmed | Fixed `cb4f55e`; live hot-reload check pending |
| B2 | Folder import accepts submodules | Confirmed | Fixed for import `cbb9956`; Health dialog still lists submodules |
| B3 | Unbounded folder scan | Confirmed (not measured) | Skip list extended `cbb9956`; depth unchanged by design |
| B4 | VS Code action always offered | Confirmed | Open |
| — | Health fetch lacks an account | Rejected | No change; do not add an account argument |
| — | Repository menu child gating | Rejected | No change |
| C1 | Foreground fetch broadens refspecs | Intentional | Confirm policy |
| C2 | Health run locks all repositories | Confirmed | Open |
| C3 | WSL detection always on | Confirmed | Confirm policy |
| C4 | axe DevTools removed | Confirmed | Confirm policy |
| C5 | Updates/deltas off without feed | Confirmed | Document delta consequence |
| M1 | Sequential unmerged-branch counts | Confirmed (not timed) | Open |
| M2 | Stale collapsed folder-group state | Confirmed | Open (storage and component) |
| M3 | `Error:` prefixes | Partly confirmed (2 sites) | Open |
| M4 | Shared reset statistic | Behaviour | Only if stats are reported |
| M5 | Windows x64 local packager | Limitation | None |
| M6 | Gitignore submodule publication | Unresolved | Verify before sharing |
| N1 | Health dialog lists submodules | Confirmed; identified during first-batch review, pre-existing since `6ced712` | Open |
| N2 | Skip list hides repos under `build`/`bin`/`temp`/`library`/`vendor` | Confirmed tradeoff introduced by `cbb9956` | Document or accept |

## Verified findings (2026-09-30)

These verdicts are authoritative; the fix details further down are synced with them. Verification used committed source at `3b336d39ff`, compared with upstream baseline `f2686bcec9`, plus Git history and blame. The configured user identity and authors of the introducing commits are `CTO <cto@renxo.tech>`. The worktree contained concurrent uncommitted changes and advanced to `fd7b03f2e7` during inspection; these verdicts concern the original reviewed endpoint, not a verification of subsequent changes.

No files were changed during verification. No build, application launch, benchmark, private-remote authentication test, or live upstream submodule-availability check was performed. Source and history support four of the five reported bugs. The missing-account claim is incorrect for this version. No confirmed pre-existing upstream bug was identified among these findings.

### Reported bugs

| Finding | Verified verdict | Origin |
| --- | --- | --- |
| B1. Development server exits on rebuild errors | Confirmed: the renderer compiler's `done` hook calls `process.exit(1)` on every compilation error, including watch rebuilds. This terminates the server process; Electron termination was not verified. | Introduced by user commit `62d8d8c`; hook absent upstream. Evidence: `script/start.ts`, `ReportDevelopmentErrors`. |
| B2. Folder import accepts submodules | Confirmed: discovery finds nested `.git` entries, and equality of Git directory and common directory excludes linked worktrees but does not exclude submodules. | Import introduced by user commit `76879b3`, using discovery from `6ced712`. Evidence: `addFolderRepositories` in `app/src/ui/repositories-list/add-folder-repositories.ts`. |
| B3. Unbounded folder scan | Confirmed performance risk: no depth limit, nine excluded names, and traversal continues inside repositories. Actual delay was not measured. Nested discovery is explicitly intentional; stopping at the first repository or imposing depth four changes behavior and needs a design decision. | Introduced by user commit `6ced712`. Evidence: `discoverHealthRepositories` in `app/src/lib/repository-health.ts`. |
| Rejected: Health fetch lacks an account | Rejected: `fetch` and `envForRemoteOperation` have no account parameter in this version or the upstream baseline. Normal GitStore fetch uses the same API. Git execution installs Desktop's credential helper, which obtains stored account tokens. The proposed third account argument would occupy the progress-callback parameter and is not a valid fix. Stale account-related comments are inherited. | No demonstrated authentication regression. Evidence: `app/src/lib/git/fetch.ts`, `environment.ts`, `core.ts`, and `app/src/lib/trampoline/trampoline-environment.ts` / `trampoline-credential-helper.ts`. |
| B4. VS Code action always offered | Confirmed menu-availability defect: item is unconditional and enabled when the directory exists; installed-editor resolution and fallback/error handling occur after clicking. | Introduced by user commit `6ced712`. Evidence: `getFolderActions` in `app/src/ui/lib/folder-actions.ts`. |

### Behavior changes

| Observation | Verified verdict | Origin |
| --- | --- | --- |
| Foreground Fetch broadens refspecs and fetches all configured remotes | Confirmed, explicitly intentional branch discovery. Background fetch preserves configured behavior. Applying the wide refspec only when configuration is narrower still broadens single-branch clones, so that suggestion does not preserve their original restriction. | User commit `6ced712`; `app/src/lib/git/fetch.ts`, `app/src/lib/stores/git-store.ts`. |
| Health operations lock all registered repositories | Confirmed: busy flags cover all registered repositories for the whole run. An unrelated busy repository can also prevent starting the operation. | User commit `6ced712`; `AppStore._performRepositoryHealthOperation`. |
| WSL detection always enabled | Confirmed policy change from `enableBetaFeatures()` to `true`; launch behavior not tested. | User commit `6ced712`; `app/src/lib/feature-flag.ts`. |
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

Do not implement the proposed account argument or change repository-menu child gating based on this review: those findings are not supported by the inspected version.

## Fix progress (2026-09-30)

Work is isolated on `codex/desktop-review-fixes` in `.worktrees/desktop-review-fixes`, based on documentation commit `2e5c746142`.

First batch implemented:

- Renderer watch compilation errors are logged without terminating the development server after the initial compilation. Initial compilation errors still fail startup.
- Folder import excludes submodules using `git rev-parse --show-superproject-working-tree`, preserving independent nested repositories and separate Git-directory checkouts.
- Discovery excludes common generated/dependency directories, including Unity, Flutter, build outputs, virtual environments and plugin-link trees. Nested discovery remains supported; no arbitrary depth cutoff was added.

Validation: all 16 focused repository-health and folder-import tests passed, including new regression cases for submodules and case-insensitive generated-directory exclusions. Prettier and `git diff --check` passed. A local application-dependency junction was needed for the new worktree to resolve `dugite`. Development-server behavior still needs live launch/hot-reload verification.

### Review of the first batch

Checked against the `cb4f55e` and `cbb9956` diffs; the fixes are correct. Two gaps:

- The Repository Health dialog uses the same discovery, so submodules are still listed there as separate repositories; only folder import skips them. This behavior predates `cbb9956` and originates in `6ced712`; it was newly identified during review of the first batch. Apply the `--show-superproject-working-tree` check in discovery or the dialog if they should be hidden there too.
- The new exclusions skip any directory named `build`, `bin`, `temp`, `library`, `vendor` and so on at every level, so an independent repository stored under such a folder is no longer discovered. Acceptable for generated trees; worth one line in the dialog or docs.

## Remaining work

- [x] B1 dev server exit
- [x] B2 submodule exclusion in folder import
- [x] B3 discovery skip list
- [ ] Live launch and hot-reload check of B1
- [ ] N1: hide submodules in the Repository Health dialog too, if wanted
- [ ] B4: gate the VS Code action on installed editors
- [ ] C2: lock only the repositories in a health run
- [ ] M2, M3: stale collapsed state (storage and component) and the two `String(error)` sites
- [ ] C1, C3, C4, C5: confirm fetch, WSL, dev-extension and update policies; document the delta consequence
- [ ] M6: verify the gitignore submodule commit is fetchable before sharing the branch
- [ ] M1, M4: bounded concurrency for unmerged-branch counts; separate reset stat if needed

Looked correct, no change needed: health fetch authentication (`envForRemoteOperation` supplies the credential trampoline, same as `GitStore.fetchRemotes`), Repository menu child gating with no repository selected (`push`/`pull`/`fetch` and the rest are disabled in `getRepositoryMenuBuilder`), the hard-reset confirmation flow, the linked-worktree exclusion in folder import, the fast-forward-only guards in `safelyUpdateHealthWorktree`, folder-group path matching on Windows, and the local packaging script's staging and rename.

## Fix details

Suggested implementations for each finding. Bugs 1–3 are implemented on `codex/desktop-review-fixes` (see Fix progress); the snippets remain as reference.

### Bugs

#### 1. Dev server exits on any renderer compile error (fixed, `cb4f55e`)

`script/start.ts` (`62d8d8c`). The `done` hook calls `process.exit(1)` whenever `stats.hasErrors()`. It fires on every watch rebuild, so a typo saved mid-edit kills the dev server process (Electron termination not verified).

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

#### 2. Folder-group import adds submodules as repositories (fixed for import, `cbb9956`)

`app/src/ui/repositories-list/add-folder-repositories.ts` (`76879b3`). `discoverHealthRepositories` returns every directory containing a `.git` entry, including submodule checkouts whose `.git` is a file pointing into the parent's `.git/modules/`. For a submodule, `git rev-parse --git-common-dir` equals its own git dir, so the main-checkout test passes and the submodule is added as a standalone repository.

Implemented instead with `git rev-parse --show-superproject-working-tree`, which avoids assuming a metadata layout. Original suggestion: skip paths whose git dir lives under another repository's `.git/modules`. `getRepositoryType` already resolves `gitDir`.

```typescript
const gitDirectory = await realpath(type.gitDir)
if (/[\\/]\.git[\\/]modules[\\/]/.test(gitDirectory)) {
  continue // submodule of another checkout
}
```

Also expand the discovery exclusions (see 3). Whether to keep descending into repositories is a design decision: nested discovery was intentional.

#### 3. Folder scan has no depth limit and a short skip list (skip list fixed, `cbb9956`)

`app/src/lib/repository-health.ts` (`6ced712`). The scan walks every subdirectory except nine names and continues inside each repository it finds. On a folder of Unity, Flutter, Node and Go projects this reads `Library/`, `Temp/`, `build/`, `dist/`, `target/`, `vendor/`, `Pods/`, `.next/` and similar, which may be slow (not measured).

Implemented: extend the skip list, accepting that discovery omits independent repositories beneath excluded folder names (N2). The depth cap and stopping at the first `.git` would also change intentional nested discovery; decide those before implementation.

The following is an **unimplemented alternative**, not the committed fix: it includes a depth-four cutoff and stops at discovered repositories. The committed fix only expands exclusions and continues nested discovery.

```typescript
const excludedDirectories = new Set([
  '.git', 'node_modules', '.pnpm-store', '.cache', '.codex-cache',
  '.codex-go-cache', '.gradle', '.dart_tool', '__pycache__',
  'library', 'temp', 'build', 'dist', 'target', 'vendor', 'pods',
  '.next', '.venv', 'venv', 'obj', 'bin', '.idea', '.vs',
])
// Unimplemented alternative: this cutoff and the repository-level continue below
// are not present in the committed fix; both change nested discovery.
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

If nested repositories inside a repository are a requirement, drop the `continue` after `paths.push(path)` and keep the extended skip list.

#### 4. "Open in Visual Studio Code" is always shown

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

### Behaviour changes to confirm

| Change | Where | Effect | If unintended |
| --- | --- | --- | --- |
| User fetch broadens refspecs and fetches all remotes | `lib/git/fetch.ts`, `stores/git-store.ts` (`6ced712`) | Intentional branch discovery. Every manual Fetch passes `--refmap=` and `+refs/heads/*:refs/remotes/<remote>/*`, fetches all configured remotes, and `--prune` prunes against the full set. Background fetch keeps configured behaviour. | Applying the wide refspec only when configuration is narrower still widens single-branch clones. To preserve them, skip it when `remote.<name>.fetch` is a single-branch mapping. |
| Health run locks every repository | `app-store.ts` `_performRepositoryHealthOperation` | Sets `isPushPullFetchInProgress` on all registered repositories for the whole run; push/pull/fetch is disabled app-wide until it finishes or is aborted. An unrelated busy repository also blocks starting it. | Lock only the repositories in the run; release each as its worker finishes. |
| WSL detection always on | `feature-flag.ts` `enableWSLDetection` | Returns `true` regardless of the beta-features setting. Launch behavior not tested. | Restore `enableBetaFeatures()`. |
| axe DevTools extension removed | `main-process/main.ts` (`62d8d8c`) | Dev-time extension only; no app functionality affected. | Restore the `axeDevTools` entry. |
| Auto-update off unless `DESKTOP_UPDATES_URL` is set | `script/dist-info.ts`, `update-store.ts`, `about.tsx` (`ee614fc`) | Correct for a fork. Side effect: without a feed, `shouldMakeDelta()` returns `false`; deltas still build when a feed is configured. | Document the delta consequence in `docs/technical/desktop-local-build.md`. |

### Minor issues

#### Unmerged-branches dialog is slow on large repos

`app/src/lib/git/unmerged-branches.ts`. One awaited `rev-list --count` per returned unmerged branch, sequentially. Not timed.

```typescript
const refs = parseBranchRefs(result.stdout)
const counts = await Promise.all(
  refs.map(branch =>
    git(['rev-list', '--count', `${sha}..${branch.ref}`, '--'], path, 'unmergedBranchCount')
      .then(r => Number(r.stdout))
  )
)
```

Wrap in a limiter (`p-limit` ^2.2.0 is already a direct dependency in `app/package.json`) if process count matters.

#### Removed folder groups leave stale collapsed state

`repositories-list.tsx`. Removing a group prunes neither the persisted `collapsed-repository-folder-groups` keys nor `RepositoriesList`'s in-memory `collapsedFolderGroups` set, so re-adding a group restores its old collapsed state. Clear both: storage in `App.onFolderGroupsChanged` as below, and the component set when `folderGroups` changes.

```typescript
const keys = new Set(this.folderGroups.map(f => `1:folder:${folderGroupKey(f)}`))
setStringArray(
  'collapsed-repository-folder-groups',
  getStringArray('collapsed-repository-folder-groups').filter(k => keys.has(k))
)
```

#### Error strings carry an `Error:` prefix

`unmerged-branches-dialog.tsx` (line 59) and `app-store.ts` `_performRepositoryHealthOperation` (`errors: [String(error)]`). `String(error)` on an `Error` yields `Error: message`. `repository-health.ts` already uses its `errorMessage` helper; export it and use it in these two places.

#### Hard reset and mixed reset share one stat counter

`dispatcher.ts`. Behaviour, not necessarily a defect: the existing total-reset counter now includes hard resets. Add a separate `hardResetToCommitCount` only if the stats are reported.

#### `package-local.mjs` is Windows x64 only

Stated in the script; fine for now. The `finally` `rm(staging)` after a successful rename is a no-op; leave it, it covers the failure path.

#### Submodule commit may not be pushed

`app/static/common/gitignore` at `ebcf0afa6a`. No inspected remote-tracking branch contains it, and the worktree submodule's origin is the other local checkout. That does not prove it is missing on GitHub. Verify it is fetchable from the source the branch will be shared from; do not push to the upstream project automatically.

## Review of the updated document (2026-10-01)

Read the updated document and its working-tree diff on `codex/desktop-review-fixes`, and checked the new observations against `app/src/lib/repository-health.ts`, `app/src/ui/repositories-list/repository-health-dialog.tsx`, and `app/src/ui/repositories-list/add-folder-repositories.ts`. This was a source/documentation consistency check; no new runtime tests, benchmarks or remote publication checks were performed.

Both added observations are confirmed: the Health dialog has no superproject exclusion, and the shared discovery skip list filters matching directory names at every level. The existing authentication rejection and menu-gating verdict remain consistent with the previous verification.

Five documentation findings were recorded and corrected:

1. N1 was newly identified, not introduced by the first fixes. Attribution now identifies `6ced712` as the origin of Health's existing submodule-listing behavior.
2. Expanding the skip list has an explicit discovery tradeoff (N2); removed the claim that it is safe on its own.
3. The verified bug table now uses B1 through B4 consistently with the status table and checklist; the rejected authentication claim is separate.
4. The depth-four/stop-at-repository snippet is labeled as an unimplemented alternative, distinct from the committed nested-discovery behavior.
5. WSL launch evidence now says behavior was not tested, rather than implying a launch check found no failures.

No application source was changed by this document review. N1/N2 behavior decisions and the outstanding fixes remain open as listed above.
