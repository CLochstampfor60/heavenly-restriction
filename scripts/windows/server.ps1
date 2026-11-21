# Keeps the app server running on this Windows machine without a terminal open.
#
#   .\scripts\windows\server.ps1 install    register the logon task and start it now
#   .\scripts\windows\server.ps1 status     task state, the 127.0.0.1:8000 listener, health, log tail
#   .\scripts\windows\server.ps1 stop       stop the task and the server it started
#   .\scripts\windows\server.ps1 start      start it again (it also starts at every logon)
#   .\scripts\windows\server.ps1 uninstall  stop it and remove the task
#
# The task runs as the current user at logon (no stored password, no admin), runs
# scripts\windows\run-server.ps1 hidden, never times out, and restarts every minute if the
# runner itself fails. The runner starts the server again whenever it exits.
# The server binds 127.0.0.1 only; tailscale serve publishes it to the tailnet.

param([ValidateSet('install', 'status', 'stop', 'start', 'uninstall')][string]$Action = 'status')

$ErrorActionPreference = 'Stop'
$TaskName = 'HeavenlyRestriction Server'
$runner = Join-Path $PSScriptRoot 'run-server.ps1'
$log = Join-Path $env:LOCALAPPDATA 'HeavenlyRestriction\logs\server.log'

function Get-ServerTask {
    Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}

function Stop-Server {
    if (Get-ServerTask) { Stop-ScheduledTask -TaskName $TaskName }
    # Stopping the task ends the runner but can leave the server it started; end that too.
    $runners = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
        Where-Object { $_.CommandLine -like '*run-server.ps1*' }
    foreach ($r in $runners) { & taskkill.exe /PID $r.ProcessId /T /F | Out-Null }
    $listen = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $listen) { & taskkill.exe /PID $c.OwningProcess /T /F | Out-Null }
}

switch ($Action) {
    'install' {
        $taskAction = New-ScheduledTaskAction -Execute 'powershell.exe' `
            -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runner`""
        $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
        $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) `
            -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable `
            -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
        $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
        Register-ScheduledTask -TaskName $TaskName -Action $taskAction -Trigger $trigger -Settings $settings `
            -Principal $principal -Description 'Heavenly Restriction app server (127.0.0.1:8000).' -Force | Out-Null
        Start-ScheduledTask -TaskName $TaskName
        Write-Output "Installed and started '$TaskName'. Log: $log"
    }
    'start' {
        Start-ScheduledTask -TaskName $TaskName
        Write-Output "Started '$TaskName'."
    }
    'stop' {
        Stop-Server
        Write-Output "Stopped '$TaskName'. It starts again at the next logon, or with: server.ps1 start"
    }
    'uninstall' {
        Stop-Server
        if (Get-ServerTask) { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false }
        Write-Output "Removed '$TaskName'. The log stays in $log"
    }
    'status' {
        $task = Get-ServerTask
        if (-not $task) { Write-Output "Task '$TaskName' is not installed."; return }
        $info = $task | Get-ScheduledTaskInfo
        Write-Output ("Task:     {0} (last run {1}, result {2})" -f $task.State, $info.LastRunTime, $info.LastTaskResult)
        $listen = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
        if ($listen) {
            Write-Output ("Listener: {0}:8000, process {1}" -f $listen[0].LocalAddress, $listen[0].OwningProcess)
        } else {
            Write-Output 'Listener: nothing on port 8000'
        }
        try {
            $health = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 http://127.0.0.1:8000/api/health).Content
            Write-Output "Health:   $health"
        } catch {
            Write-Output "Health:   no answer ($($_.Exception.Message))"
        }
        if (Test-Path $log) {
            Write-Output "Log:      $log (last 5 lines)"
            Get-Content -Path $log -Tail 5
        }
    }
}
