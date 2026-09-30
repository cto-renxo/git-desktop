param(
    [switch]$Tests,
    [switch]$NonInteractive
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
    Set-Location -LiteralPath $taskRoot
    if (!(Test-Path 'node_modules\electron\dist\electron.exe')) {
        throw 'Dependencies are missing. Install them before building.'
    }
    while (Get-Process -Name GitHubDesktop -ErrorAction SilentlyContinue) {
        if ($NonInteractive) {
            throw 'Close GitHub Desktop, then rerun the build. The app is using the output files.'
        }
        Write-Host 'Please close GitHub Desktop before building. Your app will not be stopped automatically.'
        $taskAnswer = Read-Host 'Press Enter after closing it, or type q to cancel'
        if ($taskAnswer -eq 'q') { throw 'Build cancelled.' }
    }

    $env:NODE_ENV = 'production'
    Invoke-Yarn -Arguments @('compile:prod')
    $env:DESKTOP_SKIP_PACKAGE = '1'
    Invoke-Yarn -Arguments @('ts-node', '-P', 'script/tsconfig.json', 'script/build.ts')
    $env:DESKTOP_LOCAL_BUNDLE = 'out'
    Invoke-Yarn -Arguments @('package:local')

    $taskExecutable = Join-Path $taskRoot 'dist\GitHubDesktop-win32-x64\GitHubDesktop.exe'
    if (!(Test-Path -LiteralPath $taskExecutable)) { throw 'Packaging did not produce the executable.' }
    Write-Host "Executable ready: $taskExecutable" -ForegroundColor Green
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
