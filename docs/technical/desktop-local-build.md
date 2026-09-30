# Local GitHub Desktop build

This checkout uses the standard GitHub Desktop name, executable, application
profile, credential namespaces, and browser authentication protocols. The local
build includes the repository folder groups, history tag layout, branch discovery,
repository health, and folder actions from the desktop improvements work.

Run `build.cmd` to compile and package the local Windows build. Close GitHub Desktop
first if it is running from this checkout. The output executable is
`dist\GitHubDesktop-win32-x64\GitHubDesktop.exe`. Use
`launch-github-desktop.cmd` to launch it. `build.cmd -Tests` also runs unit tests.

There is no separate profile import or credential migration in this build. It uses
the normal GitHub Desktop profile and credentials. Development builds use the
normal development identity.

Automatic updates remain disabled by default so a downloaded upstream release
does not replace the local changes. An HTTPS update feed for this build can be
configured with `DESKTOP_UPDATES_URL`; the upstream Central feed is rejected.

The earlier separate-profile and branding changes are preserved by the local
Git recovery ref `refs/backup/desktop-improvements-transfer`.
