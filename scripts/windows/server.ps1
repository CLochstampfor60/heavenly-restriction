# Keeps the app server running on this Windows machine with no window to close.
#
#   .\scripts\windows\server.ps1 install    register the task and start it now
#   .\scripts\windows\server.ps1 status     task, supervisor, server, health, last exit in words, log tail
#   .\scripts\windows\server.ps1 stop       stop it and keep it stopped (also across logons)
#   .\scripts\windows\server.ps1 start      start it again (re-enables the task)
#   .\scripts\windows\server.ps1 uninstall  stop it and remove the task
#   .\scripts\windows\server.ps1 deploy     build frontend\dist from HEAD and restart the server;
#                                          refused unless HEAD is a clean commit already pushed
#
# The task runs as the current user (no stored password, no admin): at logon, and again every
# 5 minutes as a backstop (a no-op while it is running). It never times out, and restarts every
# minute if it fails. It runs scripts\windows\supervise.py under pythonw.exe, which has no
# console; the supervisor starts the server (127.0.0.1:8000 only) with no window and starts it
# again after every exit, logging the reason.
#
# Log and state (outside the repo): %LOCALAPPDATA%\HeavenlyRestriction\

param([ValidateSet('install', 'status', 'stop', 'start', 'uninstall', 'deploy')][string]$Command = 'status')

$ErrorActionPreference = 'Stop'
$TaskName = 'HeavenlyRestriction Server'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$pythonw = Join-Path $repo '.venv\Scripts\pythonw.exe'
$supervisor = Join-Path $PSScriptRoot 'supervise.py'
$home_ = Join-Path $env:LOCALAPPDATA 'HeavenlyRestriction'
$log = Join-Path $home_ 'logs\server.log'
$state = Join-Path $home_ 'state.json'

function Get-ServerTask {
    Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}

function Get-SupervisorProcess {
    Get-CimInstance Win32_Process -Filter "Name = 'pythonw.exe' OR Name = 'python.exe'" |
        Where-Object { $_.CommandLine -like '*supervise.py*' }
}

function Format-ExitCode([long]$code) {
    $code = $code -band 0xFFFFFFFF
    $words = switch ($code) {
        0 { 'finished normally' }
        1 { 'stopped with an error, or was ended by taskkill /F' }
        267008 { 'ready, has not run yet' }
        267009 { 'running now' }
        267011 { 'has not run yet' }
        267014 { 'was stopped by a user or by Task Scheduler' }
        2147750687 { 'was already running, so this start was skipped' }
        3221225786 { 'closed by Ctrl+C or by its console window closing' }
        1073807364 { 'ended by sign-out or shutdown' }
        4294967295 { 'ended by Task Manager or Stop-Process' }
        default { 'exited unexpectedly' }
    }
    '{0} (code {1}, 0x{2:X8})' -f $words, $code, $code
}

function Invoke-Git {
    # Returns git's output; throws if git fails.
    $out = & git -C $repo @args 2>&1
    if ($LASTEXITCODE -ne 0) { throw "git $($args -join ' ') failed: $out" }
    $out
}

# The live server only runs a build made from a clean, pushed commit. Returns HEAD's short hash.
function Assert-DeployableTree {
    $dirty = Invoke-Git status --porcelain --untracked-files=no
    if ($dirty) {
        throw "Refusing to deploy: uncommitted changes in tracked files. Commit and push first.`n$($dirty -join "`n")"
    }
    Invoke-Git fetch --quiet origin | Out-Null
    $onRemote = Invoke-Git branch --remotes --contains HEAD
    if (-not $onRemote) {
        throw 'Refusing to deploy: HEAD is not on any branch of origin. Push it first.'
    }
    Invoke-Git rev-parse --short HEAD
}

function Stop-Server {
    # taskkill reports "not found" for a process its tree kill already ended; that is fine.
    $ErrorActionPreference = 'Continue'
    if (Get-ServerTask) {
        Stop-ScheduledTask -TaskName $TaskName
        Disable-ScheduledTask -TaskName $TaskName | Out-Null
    }
    foreach ($p in Get-SupervisorProcess) { & taskkill.exe /PID $p.ProcessId /T /F 2>$null | Out-Null }
    $listen = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $listen) { & taskkill.exe /PID $c.OwningProcess /T /F 2>$null | Out-Null }
    $global:LASTEXITCODE = 0
}

switch ($Command) {
    'install' {
        if (-not (Test-Path $pythonw)) { throw "Missing $pythonw. Create the .venv first (see README)." }
        Stop-Server
        $taskAction = New-ScheduledTaskAction -Execute $pythonw -Argument "`"$supervisor`"" -WorkingDirectory $repo
        $atLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
        # Backstop: try to start it every 5 minutes; ignored while it is already running.
        $every5 = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 5)
        $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) `
            -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable `
            -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -DontStopOnIdleEnd -MultipleInstances IgnoreNew
        $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
        Register-ScheduledTask -TaskName $TaskName -Action $taskAction -Trigger @($atLogon, $every5) `
            -Settings $settings -Principal $principal `
            -Description 'Heavenly Restriction app server (127.0.0.1:8000), no console window.' -Force | Out-Null
        Start-ScheduledTask -TaskName $TaskName
        Write-Output "Installed and started '$TaskName'. Log: $log"
    }
    'start' {
        Enable-ScheduledTask -TaskName $TaskName | Out-Null
        Start-ScheduledTask -TaskName $TaskName
        Write-Output "Started '$TaskName'."
    }
    'stop' {
        Stop-Server
        Write-Output "Stopped '$TaskName'. It stays stopped, also across logons, until: server.ps1 start"
    }
    'uninstall' {
        Stop-Server
        if (Get-ServerTask) { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false }
        Write-Output "Removed '$TaskName'. Log and state stay in $home_"
    }
    'deploy' {
        $hash = Assert-DeployableTree
        Write-Output "Building frontend\dist from $hash ..."
        & npm --prefix (Join-Path $repo 'frontend') run build
        if ($LASTEXITCODE -ne 0) { throw 'The build failed; the server was not restarted.' }
        $built = Get-ChildItem (Join-Path $repo 'frontend\dist\assets') -Filter 'index-*.js' |
            Select-String -SimpleMatch "build $hash " -List
        if (-not $built) { throw "The new build does not say 'build $hash'; the server was not restarted." }
        Stop-Server
        Enable-ScheduledTask -TaskName $TaskName | Out-Null
        Start-ScheduledTask -TaskName $TaskName
        $ok = $false
        foreach ($i in 1..20) {
            Start-Sleep -Milliseconds 500
            try { $ok = (Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/health' -TimeoutSec 2).status -eq 'ok' } catch { }
            if ($ok) { break }
        }
        if (-not $ok) { throw "Built $hash and restarted, but the server did not answer /api/health. Check: server.ps1 status" }
        Write-Output "Deployed build $hash. The phone offers it as 'Update available - Reload'."
        Write-Output 'Database migrations are not run by deploy (back up data\hr.db, then alembic upgrade head).'
    }
    'status' {
        $task = Get-ServerTask
        if (-not $task) { Write-Output "Task '$TaskName' is not installed."; return }
        $info = $task | Get-ScheduledTaskInfo
        Write-Output ("Task:        {0}, last run {1}: {2}" -f $task.State, $info.LastRunTime, (Format-ExitCode $info.LastTaskResult))
        $sup = @(Get-SupervisorProcess)
        if ($sup.Count) {
            Write-Output ("Supervisor:  running (pid {0})" -f (($sup | ForEach-Object { $_.ProcessId }) -join ', '))
        } else {
            Write-Output 'Supervisor:  not running'
        }
        $listen = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
        if ($listen) {
            Write-Output ("Server:      listening on {0}:8000 (pid {1})" -f $listen[0].LocalAddress, $listen[0].OwningProcess)
        } else {
            Write-Output 'Server:      nothing listening on port 8000'
        }
        try {
            $health = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 http://127.0.0.1:8000/api/health).Content
            Write-Output "Health:      $health"
        } catch {
            Write-Output "Health:      no answer ($($_.Exception.Message))"
        }
        if (Test-Path $state) {
            $s = Get-Content -Raw -Path $state | ConvertFrom-Json
            if ($null -ne $s.last_exit_code) {
                Write-Output ("Last exit:   server {0} at {1}" -f $s.last_exit_reason, $s.last_exit_at)
                Write-Output ("Restarts:    {0} since the supervisor started at {1}" -f $s.restarts, $s.supervisor_started_at)
            } else {
                Write-Output ("Last exit:   none since the supervisor started at {0}" -f $s.supervisor_started_at)
            }
        }
        if (Test-Path $log) {
            Write-Output "Log:         $log (last 5 lines)"
            Get-Content -Path $log -Tail 5
        }
    }
}
