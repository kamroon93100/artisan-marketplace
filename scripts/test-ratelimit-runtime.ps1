$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$root = Split-Path -Parent $PSScriptRoot
$wrangler = Join-Path $root "apps\api\node_modules\.bin\wrangler.cmd"
$config = Join-Path $root "tests\ratelimit-runtime\wrangler.jsonc"
$driver = Join-Path $root "tests\ratelimit-runtime\runtime.test.mjs"
$node = (Get-Command node -ErrorAction Stop).Source

foreach ($tool in @($wrangler, $config, $driver)) {
  if (-not (Test-Path -LiteralPath $tool)) {
    throw "Required runtime-test file not found: $tool"
  }
}

$env:WRANGLER_SEND_METRICS = "false"
$env:NO_COLOR = "1"

function Get-FreePort {
  for ($attempt = 0; $attempt -lt 10; $attempt++) {
    $listener = [System.Net.Sockets.TcpListener]::new(
      [System.Net.IPAddress]::Loopback,
      0
    )

    try {
      $listener.Start()
      $endpoint = [System.Net.IPEndPoint]$listener.LocalEndpoint
      return $endpoint.Port
    } catch {
      if ($attempt -eq 9) {
        throw "Could not allocate a local test port: $($_.Exception.Message)"
      }
    } finally {
      $listener.Stop()
    }
  }

  throw "Could not allocate a local test port."
}

function Get-LogTail(
  [string] $path,
  [int] $lines = 40
) {
  if (-not (Test-Path -LiteralPath $path)) {
    return "<no log file>"
  }

  return (Get-Content -LiteralPath $path -ErrorAction SilentlyContinue |
    Select-Object -Last $lines | Out-String)
}

function Get-ProcessTreeIds(
  [int] $rootProcessId
) {
  $processes = @(
    Get-CimInstance Win32_Process |
      Select-Object ProcessId, ParentProcessId
  )
  $ids = [System.Collections.Generic.List[int]]::new()
  $ids.Add($rootProcessId)
  $frontier = @($rootProcessId)

  while ($frontier.Count -gt 0) {
    $parents = $frontier
    $children = @(
      $processes |
        Where-Object { $parents -contains [int]$_.ParentProcessId } |
        ForEach-Object { [int]$_.ProcessId } |
        Where-Object { -not $ids.Contains($_) }
    )

    if ($children.Count -eq 0) {
      break
    }

    foreach ($child in $children) {
      $ids.Add($child)
    }

    $frontier = $children
  }

  return @($ids)
}

function Stop-WorkerTree(
  [System.Diagnostics.Process] $process
) {
  if ($null -eq $process) {
    return
  }

  $processIds = @(Get-ProcessTreeIds $process.Id)

  if (-not $process.HasExited) {
    & taskkill.exe /PID $process.Id /T /F *> $null
  }

  $deadline = [DateTime]::UtcNow.AddSeconds(10)

  while ([DateTime]::UtcNow -lt $deadline) {
    $alive = @(
      $processIds |
        Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue }
    )

    if ($alive.Count -eq 0) {
      break
    }

    Start-Sleep -Milliseconds 100
  }

  $alive = @(
    $processIds |
      Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue }
  )

  if ($alive.Count -gt 0) {
    throw "Timed out stopping the test Worker process tree: $($alive -join ', ')"
  }

  Start-Sleep -Milliseconds 250
}

function Remove-TestOwnedDirectory(
  [string] $path
) {
  if (-not (Test-Path -LiteralPath $path)) {
    return
  }

  $tempRoot = [System.IO.Path]::GetFullPath(
    [System.IO.Path]::GetTempPath()
  ).TrimEnd('\')
  $fullPath = [System.IO.Path]::GetFullPath($path).TrimEnd('\')
  $parent = [System.IO.Path]::GetDirectoryName($fullPath)
  $leaf = [System.IO.Path]::GetFileName($fullPath)

  if (
    $parent -ne $tempRoot -or
    $leaf -notlike "artisan-ratelimit-runtime-*"
  ) {
    throw "Refusing to remove a non-test-owned directory: $path"
  }

  for ($attempt = 1; $attempt -le 10; $attempt++) {
    try {
      Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop

      if (-not (Test-Path -LiteralPath $path)) {
        return
      }
    } catch {
      if ($attempt -eq 10) {
        throw "Failed to remove test-owned temporary directory '$path' after 10 attempts: $($_.Exception.Message)"
      }
    }

    Start-Sleep -Milliseconds 500
  }

  throw "Failed to remove test-owned temporary directory '$path'."
}

function Wait-ForHealth(
  [System.Diagnostics.Process] $process,
  [string] $baseUrl,
  [string] $outLog,
  [string] $errLog
) {
  $deadline = [DateTime]::UtcNow.AddSeconds(60)

  while ([DateTime]::UtcNow -lt $deadline) {
    if ($process.HasExited) {
      throw "Wrangler exited before becoming ready.`nstdout:`n$(Get-LogTail $outLog)`nstderr:`n$(Get-LogTail $errLog)"
    }

    try {
      $response = Invoke-WebRequest `
        -Uri "$baseUrl/health" `
        -UseBasicParsing `
        -TimeoutSec 2

      if ($response.StatusCode -eq 200) {
        return
      }
    } catch {
      # The listener may not be bound yet.
    }

    Start-Sleep -Milliseconds 250
  }

  throw "Wrangler did not become ready within 60 seconds.`nstdout:`n$(Get-LogTail $outLog)`nstderr:`n$(Get-LogTail $errLog)"
}

function Start-LocalWorker(
  [string] $persistencePath,
  [string] $logPrefix
) {
  $apiPort = Get-FreePort
  $inspectorPort = Get-FreePort

  for ($attempt = 0; $attempt -lt 10 -and $inspectorPort -eq $apiPort; $attempt++) {
    $inspectorPort = Get-FreePort
  }

  if ($inspectorPort -eq $apiPort) {
    throw "Could not allocate distinct local API and inspector ports."
  }

  $outLog = Join-Path $script:testRoot "$logPrefix.stdout.log"
  $errLog = Join-Path $script:testRoot "$logPrefix.stderr.log"
  $baseUrl = "http://127.0.0.1:$apiPort"

  $arguments = @(
    "dev",
    "--config", $config,
    "--local",
    "--ip", "127.0.0.1",
    "--port", "$apiPort",
    "--inspector-port", "$inspectorPort",
    "--persist-to", $persistencePath,
    "--show-interactive-dev-session=false",
    "--log-level", "info"
  )

  $process = Start-Process `
    -FilePath $wrangler `
    -ArgumentList $arguments `
    -WorkingDirectory $root `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -PassThru `
    -WindowStyle Hidden

  try {
    Wait-ForHealth $process $baseUrl $outLog $errLog
    return @{
      Process = $process
      BaseUrl = $baseUrl
      OutputLog = $outLog
      ErrorLog = $errLog
    }
  } catch {
    Stop-WorkerTree $process
    throw
  }
}

function Invoke-Driver(
  [string] $baseUrl,
  [string] $phase
) {
  & $node $driver $baseUrl $phase

  if ($LASTEXITCODE -ne 0) {
    throw "Runtime driver failed for $phase with exit code $LASTEXITCODE."
  }
}

$script:testRoot = Join-Path `
  ([System.IO.Path]::GetTempPath()) `
  ("artisan-ratelimit-runtime-" + [Guid]::NewGuid().ToString("N"))
$persistencePath = Join-Path $script:testRoot "state"
$phaseAProcess = $null
$phaseBProcess = $null
$script:runtimeError = $null

New-Item -ItemType Directory -Path $persistencePath -Force | Out-Null

try {
  Write-Host "=== LOCAL DURABLE OBJECT RUNTIME TEST ===" -ForegroundColor Cyan
  Write-Host "Wrangler: $wrangler"
  Write-Host "Persistence: $persistencePath"

  $phaseA = Start-LocalWorker $persistencePath "phase-a"
  $phaseAProcess = $phaseA.Process
  Write-Host "Phase A Worker ready at $($phaseA.BaseUrl)"
  Invoke-Driver $phaseA.BaseUrl "phase-a"

  Stop-WorkerTree $phaseAProcess
  $phaseAProcess = $null
  Start-Sleep -Milliseconds 500

  $phaseB = Start-LocalWorker $persistencePath "phase-b"
  $phaseBProcess = $phaseB.Process
  Write-Host "Phase B Worker ready at $($phaseB.BaseUrl)"
  Invoke-Driver $phaseB.BaseUrl "phase-b"

  Write-Host "LOCAL DURABLE OBJECT RUNTIME TEST PASSED" -ForegroundColor Green
} catch {
  $script:runtimeError = $_
  throw
} finally {
  $cleanupFailure = $null

  try {
    Stop-WorkerTree $phaseBProcess
    Stop-WorkerTree $phaseAProcess
    Remove-TestOwnedDirectory $script:testRoot
  } catch {
    $cleanupFailure = $_
  }

  if ($null -ne $cleanupFailure) {
    $message = "TEMP CLEANUP FAILED: $($cleanupFailure.Exception.Message)"

    if ($null -eq $script:runtimeError) {
      throw $message
    }

    [Console]::Error.WriteLine($message)
  } elseif (Test-Path -LiteralPath $script:testRoot) {
    $message = "TEMP CLEANUP FAILED: test-owned temporary directory still exists: $script:testRoot"

    if ($null -eq $script:runtimeError) {
      throw $message
    }

    [Console]::Error.WriteLine($message)
  } else {
    Write-Host "TEMP_CLEANUP_VERIFIED=True"
  }
}
