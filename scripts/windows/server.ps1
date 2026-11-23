# Keeps the app server running on this Windows machine with no window to close.
#
#   .\scripts\windows\server.ps1 install    register the task and start it now
#   .\scripts\windows\server.ps1 status     task, supervisor, server, health, last exit in words, log tail
#   .\scripts\windows\server.ps1 stop       stop it and keep it stopped (also across logons)
#   .\scripts\windows\server.ps1 start      start it again (re-enables the task)
#   .\scripts\windows\server.ps1 uninstall  stop it and remove the task
#   .\scripts\windows\server.ps1 deploy     build frontend\dist from HEAD and restart the server;
#                                          refused unless HEAD is a clean commit already pushed
#   .\scripts\windows\server.ps1 doctor     check everything the phone depends on: PASS/FAIL, with the fix
#   .\scripts\windows\server.ps1 backup     copy the database to data\backups\ (safe while it runs)
#
# The task runs as the current user (no stored password, no admin): at logon, and again every
# 5 minutes as a backstop (a no-op while it is running). It never times out, and restarts every
# minute if it fails. It runs scripts\windows\supervise.py under pythonw.exe, which has no
# console; the supervisor starts the server (127.0.0.1:8000 only) with no window and starts it
# again after every exit, logging the reason.
#
# Log and state (outside the repo): %LOCALAPPDATA%\HeavenlyRestriction\

param([ValidateSet('install', 'status', 'stop', 'start', 'uninstall', 'deploy', 'doctor', 'backup')][string]$Command = 'status')

$ErrorActionPreference = 'Stop'
$TaskName = 'HeavenlyRestriction Server'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$pythonw = Join-Path $repo '.venv\Scripts\pythonw.exe'
$supervisor = Join-Path $PSScriptRoot 'supervise.py'
$home_ = Join-Path $env:LOCALAPPDATA 'HeavenlyRestriction'
$log = Join-Path $home_ 'logs\server.log'
$state = Join-Path $home_ 'state.json'
$python = Join-Path $repo '.venv\Scripts\python.exe'
$backups = Join-Path $repo 'data\backups'

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
        2147946720 { 'still running; the last repeat start was skipped because it was already running' }
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
# Untracked files count: anything new under frontend\public or design-system would be built in.
# Files hidden from status with --assume-unchanged or --skip-worktree are refused too.
function Assert-DeployableTree {
    $dirty = Invoke-Git status --porcelain --untracked-files=all
    if ($dirty) {
        throw "Refusing to deploy: uncommitted or untracked files. Commit (or delete) them and push first.`n$($dirty -join "`n")"
    }
    $hidden = Invoke-Git ls-files -v | Where-Object { $_ -cmatch '^([a-z]|S) ' }
    if ($hidden) {
        throw "Refusing to deploy: files marked assume-unchanged or skip-worktree.`n$($hidden -join "`n")"
    }
    Invoke-Git fetch --quiet --prune origin | Out-Null
    & git -C $repo merge-base --is-ancestor HEAD origin/main
    if ($LASTEXITCODE -ne 0) {
        throw 'Refusing to deploy: HEAD is not on origin/main (only reviewed, merged work goes live). Merge and push it to main first.'
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

# A value from .env (local only), or $null.
function Get-EnvValue([string]$name) {
    $file = Join-Path $repo '.env'
    if (-not (Test-Path $file)) { return $null }
    $line = Get-Content $file | Where-Object { $_ -match "^\s*$name\s*=" } | Select-Object -Last 1
    if (-not $line) { return $null }
    ($line -split '=', 2)[1].Trim().Trim('"')
}

# The database file named by DATABASE_URL in .env, else data\hr.db.
function Get-DatabasePath {
    $url = Get-EnvValue 'DATABASE_URL'
    if ($url -and $url.StartsWith('sqlite:///')) {
        $p = $url.Substring(10)
        if (-not [IO.Path]::IsPathRooted($p)) { $p = Join-Path (Join-Path $repo 'backend') $p }
        return [IO.Path]::GetFullPath($p)
    }
    Join-Path $repo 'data\hr.db'
}

# Browsers started by the test helper (frontend\scripts\browser.mjs) or any older Playwright run.
function Get-TestBrowsers {
    Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe' OR Name='chrome-headless-shell.exe'" |
        Where-Object { $_.CommandLine -match 'hr-test-browser=|playwright_chromiumdev_profile|--remote-debugging-pipe' }
}

# The build the server is actually serving, read from its own index.html and script.
function Get-LiveBuild {
    $index = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 'http://127.0.0.1:8000/').Content
    $m = [regex]::Match($index, '/assets/index-[A-Za-z0-9_-]+\.js')
    if (-not $m.Success) { throw 'index.html names no app script' }
    $js = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 ('http://127.0.0.1:8000' + $m.Value)).Content
    $b = [regex]::Match($js, 'build ([0-9a-f]{7,40}(\+changes)?|unknown) ')
    if (-not $b.Success) { throw 'the app script names no build' }
    $b.Groups[1].Value
}

function Invoke-Doctor {
    $script:fails = 0
    $script:warns = 0
    function Report([string]$result, [string]$what, [string]$fix) {
        Write-Output ('{0,-5} {1}' -f $result, $what)
        if ($fix -and $result -ne 'PASS') { Write-Output "      Fix: $fix" }
        if ($result -eq 'FAIL') { $script:fails++ }
        if ($result -eq 'WARN') { $script:warns++ }
    }
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $ErrorActionPreference = 'Continue'

    # 1. Scheduled task, supervisor, server address.
    $task = Get-ServerTask
    if (-not $task) {
        Report FAIL "Scheduled task '$TaskName' is not installed" '.\scripts\windows\server.ps1 install'
    } elseif ($task.State -eq 'Disabled') {
        Report FAIL 'Scheduled task is disabled (server.ps1 stop was run), so it will not start at logon' '.\scripts\windows\server.ps1 start'
    } elseif ($task.State -ne 'Running') {
        Report FAIL "Scheduled task is $($task.State), not running" '.\scripts\windows\server.ps1 start'
    } else {
        $logon = @($task.Triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskLogonTrigger' -and $_.Enabled })
        if ($logon.Count) { Report PASS 'Scheduled task: installed, enabled, running, starts at logon' }
        else { Report FAIL 'Scheduled task has no enabled logon trigger' '.\scripts\windows\server.ps1 install' }
    }
    $sup = @(Get-SupervisorProcess)
    if ($sup.Count) { Report PASS ('Supervisor: running (pid {0})' -f (($sup | ForEach-Object { $_.ProcessId }) -join ', ')) }
    else { Report FAIL 'Supervisor: not running' '.\scripts\windows\server.ps1 start   (if it stops again: .\scripts\windows\server.ps1 status, then read the log)' }

    $listen = @(Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue)
    $wrong = @($listen | Where-Object { $_.LocalAddress -ne '127.0.0.1' })
    if (-not $listen.Count) {
        Report FAIL 'Server: nothing listening on 127.0.0.1:8000' '.\scripts\windows\server.ps1 status   (the log tail says why it stopped)'
    } elseif ($wrong.Count) {
        Report FAIL ('Server: port 8000 is also open on {0}, not only 127.0.0.1' -f (($wrong | ForEach-Object { $_.LocalAddress }) -join ', ')) 'Stop whatever owns it (Get-Process -Id <pid>); the app only ever binds 127.0.0.1'
    } else {
        Report PASS 'Server: listening on 127.0.0.1:8000 only'
    }

    # 2. Health, locally and over the tailnet.
    try {
        $h = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/health' -TimeoutSec 5
        if ($h.status -eq 'ok') { Report PASS 'Health on this PC: http://127.0.0.1:8000/api/health is ok' }
        else { Report FAIL "Health on this PC answered: $h" '.\scripts\windows\server.ps1 status' }
    } catch {
        Report FAIL "Health on this PC: no answer ($($_.Exception.Message))" '.\scripts\windows\server.ps1 status'
    }
    $proton = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { ($_.Name -like '*Proton*' -or $_.InterfaceDescription -like '*Proton*') -and $_.Status -eq 'Up' })
    $rp = Get-EnvValue 'WEBAUTHN_RP_ID'
    if (-not $rp -or $rp -eq 'localhost') {
        Report FAIL 'Tailnet health: WEBAUTHN_RP_ID in .env is not the service hostname' 'Set WEBAUTHN_RP_ID=hr.<tailnet>.ts.net in .env (see docs\TAILSCALE.md)'
    } else {
        try {
            $h = Invoke-RestMethod -Uri "https://$rp/api/health" -TimeoutSec 10
            if ($h.status -eq 'ok') { Report PASS 'Health over the tailnet: https://<service hostname>/api/health is ok' }
            else { Report FAIL "Health over the tailnet answered: $h" '.\scripts\windows\server.ps1 status' }
        } catch {
            $fix = 'Check the Tailscale lines below; then tailscale serve status'
            if ($proton.Count) { $fix = 'ProtonVPN is connected and blocks this PC from the tailnet: disconnect it, or in ProtonVPN Settings > Split tunneling (Exclude) add 100.64.0.0/10 and fd7a:115c:a1e0::/48' }
            Report FAIL "Health over the tailnet: no answer ($($_.Exception.Message))" $fix
        }
    }

    # 3. Tailscale and the serve config for svc:hr.
    $tsService = Get-Service -Name Tailscale -ErrorAction SilentlyContinue
    $ts = $null
    try { $ts = & tailscale status --json 2>$null | ConvertFrom-Json } catch { }
    if (-not $tsService -or $tsService.Status -ne 'Running') {
        Report FAIL 'Tailscale: the Windows service is not running' 'Start-Service Tailscale   (elevated PowerShell), or open the Tailscale app'
    } elseif (-not $ts -or $ts.BackendState -ne 'Running') {
        Report FAIL ("Tailscale: service running, but not connected (state {0})" -f $ts.BackendState) 'Open the Tailscale app and connect, or run: tailscale up'
    } else {
        Report PASS 'Tailscale: running and connected'
    }
    $serve = $null
    try { $serve = & tailscale serve status --json 2>$null | ConvertFrom-Json } catch { }
    $svc = if ($serve -and $serve.Services) { $serve.Services.'svc:hr' } else { $null }
    $proxy = $null
    if ($svc -and $svc.Web) {
        foreach ($site in $svc.Web.PSObject.Properties) { $proxy = $site.Value.Handlers.'/'.Proxy }
    }
    if ($serve -and $serve.AllowFunnel) {
        Report FAIL 'Tailscale serve: Funnel is on (public internet access)' 'tailscale funnel reset   (the app must never use Funnel)'
    } elseif ($proxy -eq 'http://127.0.0.1:8000') {
        $hostCap = $ts -and $ts.Self.CapMap -and ($ts.Self.CapMap.'service-host' | ConvertTo-Json -Depth 5) -match 'svc:hr'
        if ($hostCap) { Report PASS 'Tailscale serve: svc:hr proxies to 127.0.0.1:8000, this PC is its approved host, no Funnel' }
        else { Report FAIL 'Tailscale serve: svc:hr is configured, but this PC is not (yet) its approved host' 'Admin console > Services > hr: approve this machine (see docs\TAILSCALE.md)' }
    } else {
        Report FAIL 'Tailscale serve: no svc:hr config pointing at 127.0.0.1:8000' 'In an elevated PowerShell: tailscale serve --service=svc:hr --https=443 127.0.0.1:8000'
    }
    if ($proton.Count) {
        Report WARN 'ProtonVPN is connected. It can block this PC (not the phone) from reaching the app over the tailnet' 'ProtonVPN Settings > Split tunneling (Exclude): add 100.64.0.0/10 and fd7a:115c:a1e0::/48'
    }

    # 4. The live build: clean, pushed, and what origin/main would build.
    try {
        $live = Get-LiveBuild
        & git -C $repo fetch --quiet --prune origin 2>$null
        $fetched = ($LASTEXITCODE -eq 0)
        $main = (& git -C $repo rev-parse --short origin/main 2>$null)
        if ($live -like '*+changes' -or $live -eq 'unknown') {
            Report FAIL "Live build: $live is not a clean commit" 'Commit and push, then: .\scripts\windows\server.ps1 deploy'
        } elseif (-not (& git -C $repo cat-file -t $live 2>$null)) {
            Report FAIL "Live build: $live is not a commit in this repo" '.\scripts\windows\server.ps1 deploy'
        } else {
            & git -C $repo merge-base --is-ancestor $live origin/main 2>$null
            if ($LASTEXITCODE -ne 0) {
                Report FAIL "Live build: $live is not on origin/main" 'git switch main; git pull; .\scripts\windows\server.ps1 deploy'
            } else {
                # What the server runs: the app's build inputs and the backend. Docs, tests, tooling
                # and design-system/tokens.json (documentation, not imported by the build) do not count.
                $changed = & git -C $repo diff --name-only $live origin/main -- frontend design-system backend scripts/windows/supervise.py `
                    ':(exclude)*.md' ':(exclude)frontend/scripts' ':(exclude)frontend/tests' ':(exclude)backend/tests' ':(exclude)design-system/tokens.json'
                $note = if ($fetched) { '' } else { ' (could not fetch; compared with the last known origin/main)' }
                if ($changed) {
                    Report FAIL ("Live build: $live, but origin/main ($main) has {0} newer app file(s){1}" -f @($changed).Count, $note) 'git pull; .\scripts\windows\server.ps1 deploy'
                } elseif ($live -eq $main) {
                    Report PASS "Live build: $live, clean, pushed, same as origin/main$note"
                } else {
                    Report PASS "Live build: $live, clean, pushed; origin/main ($main) has no app changes since$note"
                }
            }
        }
    } catch {
        Report FAIL "Live build: could not read it from the server ($($_.Exception.Message))" '.\scripts\windows\server.ps1 status'
    }

    # 5. Database, latest backup, disk space.
    $db = Get-DatabasePath
    if (Test-Path $db) {
        Report PASS ('Database: present ({0:N0} KB)' -f ((Get-Item $db).Length / 1KB))
    } else {
        Report FAIL "Database: not found at $db" 'Check DATABASE_URL in .env; restore the newest file from data\backups\ if it was lost'
    }
    if (Test-Path $db) {
        $schema = & $python (Join-Path $PSScriptRoot 'schema_check.py') $db 2>&1
        switch ($LASTEXITCODE) {
            0 { Report PASS "Database schema: at the newest migration ($(($schema -split ' ')[0]))" }
            1 { Report FAIL "Database schema: database at $(($schema -split ' ')[0]), code expects $(($schema -split ' ')[1])" '.\scripts\windows\server.ps1 backup; .\.venv\Scripts\alembic -c backend\alembic.ini upgrade head; .\scripts\windows\server.ps1 stop; .\scripts\windows\server.ps1 start' }
            default { Report FAIL "Database schema: could not check ($schema)" 'Check that .venv exists: .\.venv\Scripts\python -m pip install -r backend\requirements.txt' }
        }
    }
    $latest = Get-ChildItem $backups -Filter '*.db' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1
    if (-not $latest) {
        Report FAIL 'Backup: none in data\backups\' '.\scripts\windows\server.ps1 backup'
    } else {
        $age = [int]((Get-Date) - $latest.LastWriteTime).TotalDays
        $what = 'Backup: latest is {0}, {1} day(s) old' -f $latest.Name, $age
        if ($age -gt 7) { Report WARN $what '.\scripts\windows\server.ps1 backup' } else { Report PASS $what }
    }
    $drive = Get-PSDrive -Name ([IO.Path]::GetPathRoot($repo).Substring(0, 1))
    $freeGb = [math]::Round($drive.Free / 1GB, 1)
    if ($freeGb -lt 1) { Report FAIL "Disk: only $freeGb GB free on $($drive.Name):" 'Free up space; SQLite needs room to write' }
    elseif ($freeGb -lt 5) { Report WARN "Disk: $freeGb GB free on $($drive.Name):" 'Free up some space soon' }
    else { Report PASS "Disk: $freeGb GB free on $($drive.Name):" }

    # 6. Leftover test browsers.
    $left = @(Get-TestBrowsers)
    if ($left.Count) {
        Report FAIL ('Test browsers left running: {0} process(es), pid {1}' -f $left.Count, (($left | ForEach-Object { $_.ProcessId }) -join ', ')) 'npm --prefix frontend run browsers:clean'
    } else {
        Report PASS 'No leftover test browsers'
    }

    Write-Output ''
    if ($script:fails) { Write-Output ("{0} FAIL, {1} WARN. Fix the FAIL lines above, then run doctor again." -f $script:fails, $script:warns) }
    else { Write-Output ("All checks passed ({0} WARN)." -f $script:warns) }
}

switch ($Command) {
    'doctor' {
        Invoke-Doctor
        exit [int]($script:fails -gt 0)
    }
    'backup' {
        $db = Get-DatabasePath
        $target = Join-Path $backups ('hr-{0}.db' -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
        & $python (Join-Path $PSScriptRoot 'backup_db.py') $db $target
        if ($LASTEXITCODE -ne 0) { throw 'The backup failed; see the message above.' }
    }
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
        # Through cmd, so build warnings on stderr are plain text, not PowerShell errors that would
        # abort the script mid-build. The exit code decides.
        $frontend = Join-Path $repo 'frontend'
        & cmd.exe /d /c "npm --prefix `"$frontend`" run build 2>&1"
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
            if ($null -ne $s.tailnet_ok) {
                $word = if ($s.tailnet_ok) { 'reachable' } else { 'NOT reachable' }
                Write-Output ("Tailnet:     {0} at {1}: {2}" -f $word, $s.tailnet_checked_at, $s.tailnet_reason)
            }
        }
        $tlog = Join-Path $home_ 'logs\tailnet.log'
        if (Test-Path $tlog) {
            Write-Output "Tailnet log: $tlog (last 3 lines)"
            Get-Content -Path $tlog -Tail 3
        }
        if (Test-Path $log) {
            Write-Output "Log:         $log (last 5 lines)"
            Get-Content -Path $log -Tail 5
        }
    }
}
