$ErrorActionPreference = "Stop"

# Real-PostgreSQL proof for the M5 human review -> correction -> publish slice.
#
# It is kept out of `pnpm verify` on purpose: that script is the
# service-free fast path, and this proof needs a running database plus a
# restart. Run this when the local stack is up.
#
# The connection string is read from the documented
# CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE environment
# variable, so the local database credential is never committed.
#
# Migrations 005 and 006 are applied before the write phase. Both are
# written to be re-runnable - `create table if not exists`,
# `create index if not exists`, and triggers are dropped and recreated -
# so applying them on every run is safe and removes the manual migration step
# this repository has to otherwise remember. They only ever add tables and
# indexes, so a re-run changes nothing that already exists.

$root = Split-Path -Parent $PSScriptRoot
$tsx = Join-Path $root "node_modules\.bin\tsx.cmd"
$testTsconfig = Join-Path $root "tests\m5-review-publish\tsconfig.json"
$suite = Join-Path $root "tests\m5-review-publish\review-publish-postgres-runtime.test.ts"
$migrations = @(
  (Join-Path $root "infra\migrations\005_catalog_versions.sql"),
  (Join-Path $root "infra\migrations\006_ai_jobs_and_proposals.sql"),
  (Join-Path $root "infra\migrations\011_ai_job_outbox.sql")
)

$container = "artisan-marketplace-postgres"
$handoff = Join-Path ([System.IO.Path]::GetTempPath()) "m5-review-publish-handoff.json"

if (-not (Test-Path $tsx)) { throw "Required tool not found: $tsx" }
if (-not (Test-Path $suite)) { throw "Test suite not found: $suite" }

foreach ($migration in $migrations) {
  if (-not (Test-Path $migration)) { throw "Migration not found: $migration" }
}

. (Join-Path $root "scripts\lib\hyperdrive-local-connection.ps1")
$localConnectionString = Get-HyperdriveLocalConnectionString

# The database and role are read from the same connection string rather than
# repeated here, so the migrations are applied to the database the tests will
# actually use.
$connection = [System.Uri]$localConnectionString
$database = [System.Uri]::UnescapeDataString($connection.AbsolutePath.TrimStart("/"))
$user = [System.Uri]::UnescapeDataString(($connection.UserInfo -split ":")[0])

$running = docker ps --filter "name=^/$container$" --filter "status=running" --format "{{.Names}}"

if (-not $running) {
  throw "Container '$container' is not running. Start the project-local stack first (infra/docker/local-compose.yml)."
}

Write-Host ""
Write-Host "=== M5 REVIEW -> PUBLISH: REAL POSTGRESQL PROOF ===" -ForegroundColor Cyan

$migrationIndex = 0

foreach ($migration in $migrations) {
  $migrationIndex++
  $name = Split-Path -Leaf $migration

  Write-Host "[$migrationIndex/$($migrations.Count + 3)] Applying $name"

  # These migrations are re-runnable, and re-running them legitimately emits
  # PostgreSQL NOTICEs such as `column ... already exists, skipping` on
  # stderr. Windows PowerShell 5.1 turns any child process writing to stderr
  # into a terminating NativeCommandError while $ErrorActionPreference is
  # "Stop", which would abort the run on a notice rather than on a real
  # failure. $ErrorActionPreference is relaxed to "Continue" around the call
  # so the notices are allowed through, and $LASTEXITCODE still carries the
  # real exit status, so a genuine failure is still detected below.
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"

  try {
    Get-Content -LiteralPath $migration -Raw |
      docker exec -i $container psql -v ON_ERROR_STOP=1 -U artisan_marketplace -d $database 2>&1 |
      Out-Null
  }
  finally {
    $ErrorActionPreference = $previousPreference
  }

  if ($LASTEXITCODE -ne 0) {
    throw "Applying $name failed."
  }
}

Write-Host "[$($migrations.Count + 1)/$($migrations.Count + 3)] Write phase"
$env:M5_POSTGRES_URL = $localConnectionString

# stderr is merged into stdout on every native call below. Windows
# PowerShell 5.1 turns a child process writing to stderr into a
# terminating NativeCommandError when $ErrorActionPreference is "Stop",
# which would abort the run on a diagnostic line instead of on a real
# failure. $LASTEXITCODE still carries the real exit status, so failures
# are still detected.
& $tsx --tsconfig $testTsconfig $suite write $handoff 2>&1

if ($LASTEXITCODE -ne 0) {
  throw "M5 write phase failed."
}

# The read phase must not be able to answer from anything the write
# process held, so the database is restarted and the read runs in a new
# process.
Write-Host "[$($migrations.Count + 2)/$($migrations.Count + 3)] Restarting PostgreSQL"
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

Write-Host "[$($migrations.Count + 3)/$($migrations.Count + 3)] Read-after-restart phase"

& $tsx --tsconfig $testTsconfig $suite read $handoff 2>&1

if ($LASTEXITCODE -ne 0) {
  throw "M5 read-after-restart phase failed."
}

Remove-Item -LiteralPath $handoff -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "M5 REVIEW PUBLISH POSTGRESQL PROOF PASSED" -ForegroundColor Green
