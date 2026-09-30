# Local Git Desktop build

For development, run `yarn start` from the checkout root. It compiles development
bundles, prepares resources without packaging, and launches the installed Electron
runtime against `out`. No `yarn build:dev` prerequisite is required. Leave the
terminal running: renderer edits use hot reload. Restart `yarn start` after changes
to the main process or other bundles. Development compilation uses a filesystem
cache, so the first start is heavier than subsequent starts. Production and
development share `out`; stop development before building production, then restart
development afterward. Development uses the separate Git Desktop development
profile.

This checkout uses the standard Git Desktop name, executable, application
profile, credential namespaces, and browser authentication protocols. The local
build includes the repository folder groups, history tag layout, branch discovery,
repository health, and folder actions from the desktop improvements work.

Run `build.cmd` to compile and package the local Windows build. Close Git Desktop
first if it is running from this checkout. The output executable is
`dist\GitDesktop-win32-x64\GitDesktop.exe`. Use
`launch-github-desktop.cmd` to launch it. `build.cmd -Tests` also runs unit tests.

There is no separate profile import or credential migration in this build. It uses
the normal Git Desktop profile and credentials. Development builds use the
normal development identity.

Automatic updates remain disabled by default so a downloaded upstream release
does not replace the local changes. An HTTPS update feed for this build can be
configured with `DESKTOP_UPDATES_URL`; the upstream Central feed is rejected.

The earlier separate-profile and branding changes are preserved by the local
Git recovery ref `refs/backup/desktop-improvements-transfer`.

## Repository discovery and updates

Folder scans preserve nested repositories but skip generated and dependency directory names at every level, including build, bin, temp, library, vendor, Pods, target, virtual environments and plugin-link trees. Independent repositories beneath those names will not be discovered automatically; add them directly or select their repository directory as the scan root. Submodules are omitted from folder import and Repository Health results.

Automatic updates are disabled without DESKTOP_UPDATES_URL. Delta packages are also disabled without a feed; production and beta builds with a configured feed remain eligible for deltas.
