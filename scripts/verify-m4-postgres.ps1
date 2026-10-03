$ErrorActionPreference = "Stop"

# Real-PostgreSQL proof for the M4 AI-assisted catalog pipeline slice.
#
# It is kept out of `pnpm verify` on purpose: that script is the
# service-free fast path, and this proof needs a running database plus a
# restart. Run this when the local stack is up.
#
# The connection string is read from the Hyperdrive binding in
# wrangler.jsonc rather than duplicated here, so the local database is
# configured in exactly one place.
#
# Migration 006 is applied before the write phase. The migration is
# written to be re-runnable - `create table if not exists`,
# `create index if not exists`, and the trigger is dropped and recreated -
# so applying it on every run is safe and removes the manual migration step
# this repository has to otherwise remember. It only ever adds tables and
# indexes, so a re-run changes nothing that already exists.

$root = Split-Path -Parent $PSScriptRoot
$tsx = Join-Path $root "node_modules\.bin\tsx.cmd"
$testTsconfig = Join-Path $root "tests\m4-ai-pipeline\tsconfig.json"
$suite = Join-Path $root "tests\m4-ai-pipeline\ai-pipeline-postgres-runtime.test.ts"
$wranglerConfig = Join-Path $root "apps\api\wrangler.jsonc"
$migration = Join-Path $root "infra\migrations\006_ai_jobs_and_proposals.sql"

$container = "artisan-marketplace-postgres"
$handoff = Join-Path ([System.IO.Path]::GetTempPath()) "m4-ai-pipeline-handoff.json"

if (-not (Test-Path $tsx)) { throw "Required tool not found: $tsx" }
if (-not (Test-Path $suite)) { throw "Test suite not found: $suite" }
if (-not (Test-Path $migration)) { throw "Migration not found: $migration" }

# Comments are stripped by dropping whole-line `//` comments only. A
# naive `//` strip would corrupt the `postgresql://` scheme inside the
# connection string.
$config = (Get-Content -LiteralPath $wranglerConfig) |
  Where-Object { $_.Trim() -notlike "//*" } |
  Out-String |
  ConvertFrom-Json

$localConnectionString = $config.hyperdrive[0].localConnectionString

if (-not $localConnectionString) {
  throw "No Hyperdrive localConnectionString found in $wranglerConfig"
}

# The database and role are read from the same connection string rather than
# repeated here, so the migration is applied to the database the tests will
# actually use.
$connection = [System.Uri]$localConnectionString
$database = [System.Uri]::UnescapeDataString($connection.AbsolutePath.TrimStart("/"))
$user = [System.Uri]::UnescapeDataString(($connection.UserInfo -split ":")[0])

$running = docker ps --filter "name=^/$container$" --filter "status=running" --format "{{.Names}}"

if (-not $running) {
  throw "Container '$container' is not running. Start the project-local stack first (infra/docker/local-compose.yml)."
}

Write-Host ""
Write-Host "=== M4 AI PIPELINE: REAL POSTGRESQL PROOF ===" -ForegroundColor Cyan

Write-Host "[1/4] Applying migration 006"
Get-Content -LiteralPath $migration -Raw |
  docker exec -i $container psql -v ON_ERROR_STOP=1 -U $user -d $database 2>&1 |
  Out-Null

if ($LASTEXITCODE -ne 0) {
  throw "Applying migration 006 failed."
}

Write-Host "[2/4] Write phase"
$env:M4_POSTGRES_URL = $localConnectionString

# stderr is merged into stdout on every native call below. Windows
# PowerShell 5.1 turns a child process writing to stderr into a
# terminating NativeCommandError when $ErrorActionPreference is "Stop",
# which would abort the run on a diagnostic line instead of on a real
# failure. $LASTEXITCODE still carries the real exit status, so failures
# are still detected.
& $tsx --tsconfig $testTsconfig $suite write $handoff 2>&1

if ($LASTEXITCODE -ne 0) {
  throw "M4 write phase failed."
}

# The read phase must not be able to answer from anything the write
# process held, so the database is restarted and the read runs in a new
# process.
Write-Host "[3/4] Restarting PostgreSQL"
docker restart $container 2>&1 | Out-Null

$deadline = (Get-Date).AddSeconds(60)

while ($true) {
  $health = docker inspect --format "{{.State.Health.Status}}" $container 2>&1

  if ($health -eq "healthy") { break }

  if ((Get-Date) -gt $deadline) {
    throw "PostgreSQL did not become healthy after the restart (last status: $health)."
  }

  Start-Sleep -Seconds 1
}

Write-Host "[4/4] Read-after-restart phase"

& $tsx --tsconfig $testTsconfig $suite read $handoff 2>&1

if ($LASTEXITCODE -ne 0) {
  throw "M4 read-after-restart phase failed."
}

Remove-Item -LiteralPath $handoff -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "M4 AI PIPELINE POSTGRESQL PROOF PASSED" -ForegroundColor Green
