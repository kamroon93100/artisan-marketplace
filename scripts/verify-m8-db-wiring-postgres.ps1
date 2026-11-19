$ErrorActionPreference = "Stop"

# M8 §10 Phase 1 - the HYPERDRIVE -> session-store wiring acceptance item,
# proven against real PostgreSQL.
#
# Scope: this runner proves exactly one M8 Phase 1 acceptance item: that a
# deployed Worker's own request environment (the HYPERDRIVE binding, no
# injected DB_POOL) obtains the PostgreSQL-backed Identity session store,
# and that a request that cannot be resolved there is 401 UNAUTHENTICATED
# rather than the fail-closed DEPENDENCY_FAILED a deployment with no
# session verification would answer.
#
# It does not attempt actor isolation, logout, refresh, role enforcement,
# discovery posture, mobile auth, or RLS. Those remain separate Phase 1-4
# items and are covered by their own proofs/suites.
#
# It is kept out of `pnpm verify` on purpose: that script is the
# service-free fast path (ADR-010), and this proof needs a running
# database. This follows the existing per-milestone runtime-proof
# convention already used by verify-m3/m4/m5/m6/m8-actor-isolation/
# m8-unauthenticated-401/m10.
#
# The connection string is read from the documented
# CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE environment
# variable, so the local database credential is never committed. The same
# binding is handed to the request environment.
#
# Scope guard: this proof refuses to run against anything other than the
# repository's own project database - the local connection string on port
# 55432. The native PostgreSQL listening on 5432 is a different instance on
# this machine and is never connected to, read, or written.

$root = Split-Path -Parent $PSScriptRoot
$tsx = Join-Path $root "node_modules\.bin\tsx.cmd"
$testTsconfig = Join-Path $root "tests\m8-db-wiring\tsconfig.json"
$suite = Join-Path $root "tests\m8-db-wiring\db-wiring-runtime.test.ts"

# Migrations 008 and 009 are applied so the identity schema exists. They are
# applied read-only-as-written: this runner never edits them. 001-007 are
# listed so the full local schema is present, matching the other runners.
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

if (-not (Test-Path $tsx)) { throw "Required tool not found: $tsx" }
if (-not (Test-Path $suite)) { throw "Test suite not found: $suite" }
foreach ($migration in $migrations) {
  if (-not (Test-Path $migration)) { throw "Migration not found: $migration" }
}

. (Join-Path $root "scripts\lib\hyperdrive-local-connection.ps1")
$localConnectionString = Get-HyperdriveLocalConnectionString

$connection = [System.Uri]$localConnectionString
$database = [System.Uri]::UnescapeDataString($connection.AbsolutePath.TrimStart("/"))
$user = [System.Uri]::UnescapeDataString(($connection.UserInfo -split ":")[0])

$expectedPort = 55432
$expectedDatabase = "artisan_marketplace_dev"
$expectedHost = "127.0.0.1"

# Explicit scope guard, asserted rather than assumed.
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
Write-Host "=== M8 PHASE 1: HYPERDRIVE -> SESSION-STORE WIRING (REAL POSTGRESQL) ===" -ForegroundColor Cyan

Write-Host "[1/3] Applying migrations 001-009 (identity schema 008/009 only; none are edited)"
foreach ($migration in $migrations) {
  $name = Split-Path -Leaf $migration
  Write-Host "      - $name"
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

Write-Host "[2/3] Running the HYPERDRIVE wiring proof"

$env:M8_DB_WIRING_POSTGRES_URL = $localConnectionString

# A native process writing to stderr is not a terminating error here; capture
# everything and decide from the exit code so the proof's own diagnostics
# survive.
$proofExit = $null
$previousPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
  & $tsx --tsconfig $testTsconfig $suite *>&1
  $proofExit = $LASTEXITCODE
}
finally {
  $ErrorActionPreference = $previousPreference
}

if ($proofExit -ne 0) {
  throw "M8 Phase 1 HYPERDRIVE wiring proof failed with exit code $proofExit."
}

Write-Host "[3/3] Confirming the proof accounts are persisted separately"

# Reports state; it does not assert containment. The proof leaves its
# accounts behind for inspection, so the label states exactly what is shown.
$query = "select username_normalized, id from identity_accounts where username_normalized in ('m8_wiring_proof', 'm8_wiring_http') order by username_normalized"
$result = $query |
  docker exec -i $container psql -X -q -t -A -v ON_ERROR_STOP=1 -U $user -d $database 2>&1 |
  Out-String
Write-Host "      $query"
Write-Host "        -> $($result.Trim())"

Write-Host ""
Write-Host "M8 PHASE 1 HYPERDRIVE WIRING PROOF PASSED" -ForegroundColor Green
