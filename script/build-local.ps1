param(
    [switch]$Tests,
    [switch]$NonInteractive,
    [switch]$NoLaunch,
    [switch]$LaunchOnly
)

$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskOldLocation = Get-Location
$taskEnvNames = @('NODE_ENV', 'DESKTOP_SKIP_PACKAGE', 'DESKTOP_LOCAL_BUNDLE')
$taskOldEnv = @{}
foreach ($taskName in $taskEnvNames) {
    $taskOldEnv[$taskName] = [Environment]::GetEnvironmentVariable($taskName, 'Process')
}

function Invoke-Yarn {
    param([string[]]$Arguments)
    & node (Join-Path $taskRoot 'vendor\yarn-1.21.1.js') @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Build command failed (exit $LASTEXITCODE): yarn $($Arguments -join ' ')"
    }
}

try {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
        throw 'This build requires Windows PowerShell and Windows Node. From WSL, use bash script/build-local.sh.'
    }
    Set-Location -LiteralPath $taskRoot
    foreach ($taskAsset in @('gemoji\images\emoji', 'gemoji\db\emoji.json', 'app\static\common\choosealicense.com\_licenses', 'app\static\common\gitignore\Global')) {
        if (!(Test-Path -LiteralPath $taskAsset)) {
            throw "Missing submodule asset: $taskAsset. From this checkout, run git submodule update --init before building. Yarn does not install Git submodules."
        }
    }
    if (!(Test-Path 'node_modules\electron\dist\electron.exe')) {
        throw 'Dependencies are missing. Install them before building.'
    }
    while (!$LaunchOnly -and (Get-Process -Name GitHubDesktop -ErrorAction SilentlyContinue)) {
        if ($NonInteractive) {
            throw 'Close GitHub Desktop, then rerun the build. The app is using the output files.'
        }
        Write-Host 'Please close GitHub Desktop before building. Your app will not be stopped automatically.'
        $taskAnswer = Read-Host 'Press Enter after closing it, or type q to cancel'
        if ($taskAnswer -eq 'q') { throw 'Build cancelled.' }
    }

    if (!$LaunchOnly) {
        $env:NODE_ENV = 'production'
        Invoke-Yarn -Arguments @('compile:prod')
        $env:DESKTOP_SKIP_PACKAGE = '1'
        Invoke-Yarn -Arguments @('ts-node', '-P', 'script/tsconfig.json', 'script/build.ts')
        $env:DESKTOP_LOCAL_BUNDLE = 'out'
        Invoke-Yarn -Arguments @('package:local')
    }

    $taskExecutable = Join-Path $taskRoot 'dist\GitHubDesktop-win32-x64\GitHubDesktop.exe'
    if (!(Test-Path -LiteralPath $taskExecutable)) { throw 'Packaging did not produce the executable.' }
    Write-Host "Executable ready: $taskExecutable" -ForegroundColor Green
    if (!$NoLaunch) {
        $taskRunAsNode = [Environment]::GetEnvironmentVariable('ELECTRON_RUN_AS_NODE', 'Process')
        try {
            Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
            $taskAppProcess = Start-Process -FilePath $taskExecutable -WorkingDirectory (Split-Path -Parent $taskExecutable) -PassThru
            $taskWindowOpened = $false
            for ($taskAttempt = 0; $taskAttempt -lt 20; $taskAttempt++) {
                Start-Sleep -Milliseconds 500
                $taskAppProcess.Refresh()
                $taskWindowProcess = Get-Process -Name GitHubDesktop -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and ($_.Id -eq $taskAppProcess.Id -or $_.Path -eq $taskExecutable -or [string]::IsNullOrEmpty($_.Path)) } | Select-Object -First 1
                if ($taskWindowProcess) {
                    $taskWindowOpened = $true
                    break
                }
            }
            if (!$taskWindowOpened) {
                if ($taskAppProcess.HasExited) {
                    $taskLaunchFailure = "The app exited during startup (exit $($taskAppProcess.ExitCode))."
                } else {
                    $taskLaunchFailure = 'The app process started, but no window appeared within 10 seconds. It has been left running.'
                }
                throw "$taskLaunchFailure Build is available at $taskExecutable. Retry without rebuilding using -LaunchOnly. App logs are under the GitHub Desktop profile's logs folder."
            }
            Write-Host "GitHub Desktop window opened (PID $($taskWindowProcess.Id))."
            if ($taskWindowProcess.Id -ne $taskAppProcess.Id -and [string]::IsNullOrEmpty($taskWindowProcess.Path)) {
                Write-Warning 'An existing GitHub Desktop window was found, but Windows did not expose its executable path. Close all GitHub Desktop instances and retry -LaunchOnly to verify this build specifically.'
            }
        } finally {
            [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $taskRunAsNode, 'Process')
        }
    }
    if ($Tests) {
        Write-Host 'The executable is ready. Running tests now; a test failure will leave the build available.'
        Invoke-Yarn -Arguments @('test:unit')
    }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    foreach ($taskName in $taskEnvNames) {
        [Environment]::SetEnvironmentVariable($taskName, $taskOldEnv[$taskName], 'Process')
    }
    Set-Location -LiteralPath $taskOldLocation
}
