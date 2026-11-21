# Runs the app server (python -m app, 127.0.0.1:8000 only) and starts it again whenever it
# exits. The "HeavenlyRestriction Server" scheduled task runs this at logon; see
# scripts\windows\server.ps1 to install, check or stop it.
#
# Log: %LOCALAPPDATA%\HeavenlyRestriction\logs\server.log (outside the repo). Rolled to
# server.log.1 when it passes 5 MB.

$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$python = Join-Path $repo '.venv\Scripts\python.exe'
$logDir = Join-Path $env:LOCALAPPDATA 'HeavenlyRestriction\logs'
$log = Join-Path $logDir 'server.log'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-ServerLog([string]$message) {
    Add-Content -Path $log -Value ('{0} [runner] {1}' -f (Get-Date -Format s), $message) -Encoding Ascii
}

$env:PYTHONUNBUFFERED = '1'
$env:HR_BIND_HOST = '127.0.0.1'
Set-Location (Join-Path $repo 'backend')

while ($true) {
    if ((Test-Path $log) -and ((Get-Item $log).Length -gt 5MB)) {
        Move-Item -Force -Path $log -Destination "$log.1"
    }
    Write-ServerLog 'starting python -m app on 127.0.0.1:8000'
    # cmd appends the server's output to the log as plain bytes (PowerShell 5.1 would write
    # UTF-16 and turn every stderr line into an error record).
    & cmd.exe /d /s /c "`"$python`" -m app >> `"$log`" 2>&1"
    Write-ServerLog "server exited with code $LASTEXITCODE; starting again in 10 seconds"
    Start-Sleep -Seconds 10
}
