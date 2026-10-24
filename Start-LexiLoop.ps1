$ErrorActionPreference = 'Stop'
$projectPath = $PSScriptRoot
$frontendPath = Join-Path $projectPath 'frontend'
$container = 'lexiloop-postgres-dev'
$running = docker inspect --format '{{.State.Running}}' $container
if ($LASTEXITCODE -ne 0) { throw 'Abra o Docker Desktop e confira o contêiner lexiloop-postgres-dev.' }
if ($running -ne 'true') { docker start $container | Out-Null }
$ready = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    docker exec $container pg_isready 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
}
if (-not $ready) { throw 'O banco de dados não ficou pronto.' }
if (-not (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath (Get-Command python).Source -ArgumentList ('"' + (Join-Path $projectPath 'run_backend.py') + '"') -WorkingDirectory $projectPath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectPath 'backend-run.log') -RedirectStandardError (Join-Path $projectPath 'backend-error.log') | Out-Null
}
if (-not (Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath (Get-Command node).Source -ArgumentList 'node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3001' -WorkingDirectory $frontendPath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectPath 'frontend-run.log') -RedirectStandardError (Join-Path $projectPath 'frontend-error.log') | Out-Null
}
Write-Output 'LexiLoop: http://127.0.0.1:3001/municipal'
Write-Output 'WhatsApp: http://127.0.0.1:3001/communications'

$ticketWorkerPath = Join-Path $frontendPath 'scripts\ticket-worker.ts'
$ticketWorker = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like "*$ticketWorkerPath*" }
if (-not $ticketWorker) {
    $workerArgs = '--require ./scripts/tsx-windows-shim.cjs --env-file=.env.local --import tsx "' + $ticketWorkerPath + '"'
    Start-Process -FilePath (Get-Command node).Source -ArgumentList $workerArgs -WorkingDirectory $frontendPath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectPath 'ticket-worker-run.log') -RedirectStandardError (Join-Path $projectPath 'ticket-worker-error.log') | Out-Null
}
Write-Output 'Ticket e fila automática: http://127.0.0.1:3001/communications'
