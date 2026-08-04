$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $projectRoot "backend"
$frontendDir = Join-Path $projectRoot "frontend"
$backendPython = Join-Path $backendDir ".venv\Scripts\python.exe"
$npmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source

function Test-LocalPort {
    param([int]$Port)

    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $task = $client.ConnectAsync("127.0.0.1", $Port)
        return $task.Wait(350) -and $client.Connected
    }
    catch {
        return $false
    }
    finally {
        $client.Dispose()
    }
}

if (-not (Test-Path $backendPython)) {
    throw "Backend Python was not found: $backendPython"
}

if (-not (Test-Path (Join-Path $projectRoot ".env"))) {
    throw "The .env file was not found. Configure SUPABASE_DB_URL first."
}

if (-not (Test-LocalPort -Port 8000)) {
    $backendCommand = "Set-Location -LiteralPath '$backendDir'; `$host.UI.RawUI.WindowTitle = 'Points System - Supabase Backend'; & '$backendPython' -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"
    Start-Process -FilePath "powershell.exe" -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-Command", $backendCommand
    ) -WorkingDirectory $backendDir
}

if (-not (Test-LocalPort -Port 5173)) {
    $frontendCommand = "Set-Location -LiteralPath '$frontendDir'; `$host.UI.RawUI.WindowTitle = 'Points System - Web Frontend'; & '$npmCommand' run dev -- --host 127.0.0.1"
    Start-Process -FilePath "powershell.exe" -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-Command", $frontendCommand
    ) -WorkingDirectory $frontendDir
}

$deadline = (Get-Date).AddSeconds(35)
do {
    $backendReady = Test-LocalPort -Port 8000
    $frontendReady = Test-LocalPort -Port 5173
    if ($backendReady -and $frontendReady) {
        Start-Process "http://localhost:5173/#/login"
        exit 0
    }
    Start-Sleep -Milliseconds 500
} while ((Get-Date) -lt $deadline)

throw "The local system did not start within 35 seconds. Check the backend and frontend windows."
