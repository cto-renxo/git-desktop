#!/usr/bin/env bash
# Run the Windows build from WSL using the Windows toolchain.
set -euo pipefail

args=()
for arg in "$@"; do
  case "$arg" in
    --tests) args+=('-Tests') ;;
    --non-interactive) args+=('-NonInteractive') ;;
    --no-launch) args+=('-NoLaunch') ;;
    --launch-only) args+=('-LaunchOnly') ;;
    -h|--help)
      printf '%s\n' 'Usage: bash script/build-local.sh [--tests] [--non-interactive] [--no-launch] [--launch-only]' \
        'Builds the Windows executable using Windows PowerShell, Node, and Electron.' \
        'Launches the app after packaging unless --no-launch is supplied.' \
        'Tests run after the executable is ready when --tests is supplied.'
      exit 0
      ;;
    *) printf 'Unknown option: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

if ! command -v wslpath >/dev/null || ! command -v powershell.exe >/dev/null; then
  printf '%s\n' 'Run this script in WSL with Windows interoperability enabled.' >&2
  exit 1
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
windows_script=$(wslpath -w "$script_dir/build-local.ps1")
exec powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$windows_script" "${args[@]}"
