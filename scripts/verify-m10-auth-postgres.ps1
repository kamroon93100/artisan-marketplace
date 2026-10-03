$ErrorActionPreference = "Stop"

# Real-PostgreSQL proof for IdentityService + PostgresSessionStore (M10-A).
#
# It is kept out of `pnpm verify` on purpose: that script is the
# service-free fast path, and this proof needs a running database plus a
# restart. Run this when the local stack is up.
#
# The connection string is read from the Hyperdrive binding in
# wrangler.jsonc rather than duplicated here, so the local database is
# configured in exactly one place.
#
# Scope guard: this proof refuses to run against anything other than the
# repository's own project database - the Hyperdrive localConnectionString
# on port 55432. The native PostgreSQL listening on 5432 is a different
# instance on this machine and is never connected to, read, or written.
# The guard is an explicit port/database assertion, not an assumption.
#
# What this script proves, in order:
#   1. the target really is the project database on 55432;
#   2. migrations 001-009 establish the existing local schema;
#   3. the write phase exercises the complete auth lifecycle against real
#      PostgreSQL through IdentityService + PostgresSessionStore;
#   4. a PostgreSQL restart;
#   5. the read phase proves all auth state persisted: accounts, sessions,
#      refresh grants (including consumed), replay detection, revocation;
#   6. identity table row counts are reported for inspection.

$root = Split-Path -Parent $PSScriptRoot
$tsx = Join-Path $root "node_modules\.bin\tsx.cmd"
$testTsconfig = Join-Path $root "tests\m10-auth-postgres\tsconfig.json"
$suite = Join-Path $root "tests\m10-auth-postgres\auth-postgres-runtime.test.ts"
$wranglerConfig = Join-Path $root "apps\api\wrangler.jsonc"
$migrations = @(
  (Join-Path $root "infra\migrations\001_catalog\migration.sql"),
  (Join-Path $root "infra\migrations\002_media\migration.sql"),
  (Join-Path $root "infra\migrations\003_catalog_idempotency.sql"),
  (Join-Path $root "infra\migrations\004_media_upload_verification.sql"),
  (Join-Path $root "infra\migrations\005_catalog_versions.sql"),
  (Join-Path $root "infra\migrations\006_ai_jobs_and_proposals.sql"),
  (Join-Path $root "infra\migrations\007_inquiries_and_published_search.sql"),
  (Join-Path $root "infra\migrations\008_identity_accounts_and_sessions.sql"),
  (Join-Path $root "infra\migrations\009_identity_refresh_grants.sql")
)

$container = "artisan-marketplace-postgres"
$tmp = [System.IO.Path]::GetTempPath()
$handoff = Join-Path $tmp "m10-auth-postgres-handoff.json"
$writeLog = Join-Path $tmp "m10-write.log"
$readLog = Join-Path $tmp "m10-read.log"

if (-not (Test-Path $tsx)) { throw "Required tool not found: $tsx" }
if (-not (Test-Path $suite)) { throw "Test suite not found: $suite" }
foreach ($migration in $migrations) {
  if (-not (Test-Path $migration)) { throw "Migration not found: $migration" }
}

# Comments are stripped by dropping whole-line `//` comments only. A
# naive `//` strip would corrupt the `postgresql://` scheme inside the
# connection string.
$config = (Get-Content -LiteralPath $wranglerConfig) |
  Where-Object { $_.Trim() -notlike "//*" } |
  Out-String |
  ConvertFrom-Json

$localConnectionString = $config.hyperdrive[0].localConnectionString.Trim()

if (-not $localConnectionString) {
  throw "No Hyperdrive localConnectionString found in $wranglerConfig"
}

# The database and role are read from the same connection string rather than
# repeated here, so the migrations are applied to the database the tests will
# actually use.
$connection = [System.Uri]$localConnectionString
$database = [System.Uri]::UnescapeDataString($connection.AbsolutePath.TrimStart("/"))
$user = [System.Uri]::UnescapeDataString(($connection.UserInfo -split ":")[0])

$expectedPort = 55432
$expectedDatabase = "artisan_marketplace_dev"
$expectedHost = "127.0.0.1"

# Explicit scope guard. This is the only thing standing between this proof and
# the unrelated native PostgreSQL instance listening on 5432, so it is an
# assertion rather than a comment.
if ($connection.Port -ne $expectedPort) {
  throw "Refusing to run: expected port $expectedPort but the project connection string targets $($connection.Port). The instance on 5432 is not this project."
}

if ($connection.Host -ne $expectedHost) {
  throw "Refusing to run: expected host $expectedHost but the project connection string targets $($connection.Host)."
}

if ($database -ne $expectedDatabase) {
  throw "Refusing to run: expected database $expectedDatabase but the project connection string targets $database."
}

$running = docker ps --filter "name=^/$container$" --filter "status=running" --format "{{.Names}}"

if (-not $running) {
  throw "Container '$container' is not running. Start the project-local stack first (infra/docker/local-compose.yml)."
}

Write-Host ""
Write-Host "=== M10 AUTH: REAL POSTGRESQL PROOF ===" -ForegroundColor Cyan

Write-Host "[1/5] Applying migrations 001-009"
foreach ($migration in $migrations) {
  $name = Split-Path -Leaf $migration
  Write-Host "      - $name"
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    Get-Content -LiteralPath $migration -Raw |
      docker exec -i $container psql -v ON_ERROR_STOP=1 -U $user -d $database 2>&1 |
      Out-Null
  }
  finally {
    $ErrorActionPreference = $previousPreference
  }
  if ($LASTEXITCODE -ne 0) {
    throw "Applying $name failed."
  }
}

Write-Host "[2/5] Write phase (auth lifecycle against real PostgreSQL)"
$env:M10_POSTGRES_URL = $localConnectionString

# A native process writing to stderr is not a terminating error here. Left
# under $ErrorActionPreference = "Stop", PowerShell turns each stderr line into
# an ErrorRecord and aborts the pipeline, which discards the test's own failure
# diagnostics. Capture everything, then decide from the exit code.
$writeExit = $null
$previousPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
  & $tsx --tsconfig $testTsconfig $suite write $handoff *>&1 |
    Tee-Object -FilePath $writeLog
  $writeExit = $LASTEXITCODE
}
finally {
  $ErrorActionPreference = $previousPreference
}

if ($writeExit -ne 0) {
  throw "M10 write phase failed with exit code $writeExit. Full output is in $writeLog"
}

# The read phase must not be able to answer from anything the write
# process held, so the database is restarted and the read runs in a new
# process.
Write-Host "[3/5] Restarting PostgreSQL"
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

Write-Host "[4/5] Read-after-restart phase"

$readExit = $null
$previousPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
  & $tsx --tsconfig $testTsconfig $suite read $handoff *>&1 |
    Tee-Object -FilePath $readLog
  $readExit = $LASTEXITCODE
}
finally {
  $ErrorActionPreference = $previousPreference
}

if ($readExit -ne 0) {
  throw "M10 read-after-restart phase failed with exit code $readExit. Full output is in $readLog"
}

Remove-Item -LiteralPath $handoff -ErrorAction SilentlyContinue

Write-Host "[5/5] Reporting identity table row counts"
# This reports state; it does not assert containment. The proof writes into the
# identity tables on purpose and leaves those rows behind for inspection, so the
# label states exactly what is measured.
$rowCounts = @(
  "select count(*) from identity_accounts",
  "select count(*) from identity_sessions",
  "select count(*) from identity_refresh_grants"
)
foreach ($query in $rowCounts) {
  $result = $query |
    docker exec -i $container psql -X -q -t -A -v ON_ERROR_STOP=1 -U $user -d $database 2>&1 |
    Out-String
  Write-Host "      $query -> $($result.Trim())"
}

Remove-Item -LiteralPath $writeLog, $readLog -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "M10 AUTH POSTGRESQL PROOF PASSED" -ForegroundColor Green