$ErrorActionPreference = "Stop"

# Real-PostgreSQL proof for row-level security.
#
# This is deliberately outside `pnpm verify`: that gate is service-free. It
# needs the project-local PostgreSQL container and creates a throwaway
# database, a temporary login role, and temporary data inside that database.
# It never reads or writes the project database's tables.
#
# It uses RLS_POSTGRES_URL when supplied; otherwise it reads the connection
# string from CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE,
# matching the other real-database runners. The role must be able to create a
# throwaway database and a temporary login role, so use an owner/maintenance
# connection for the proof even after the application itself has moved to the
# non-owner login.
#
# The proof runs through tsx, which transpiles but does not type-check. The
# companion type check is:
#   pnpm --filter @artisan-marketplace/api exec tsc --noEmit \
#     -p ../../tests/rls-policy/tsconfig.typecheck.json

$root = Split-Path -Parent $PSScriptRoot
$tsx = Join-Path $root "node_modules\.bin\tsx.cmd"
$testTsconfig = Join-Path $root "tests\rls-policy\tsconfig.json"
$suite = Join-Path $root "tests\rls-policy\rls-policy-postgres-runtime.test.ts"
$container = "artisan-marketplace-postgres"

if (-not (Test-Path $tsx)) { throw "Required tool not found: $tsx" }
if (-not (Test-Path $suite)) { throw "Test suite not found: $suite" }
if (-not (Test-Path $testTsconfig)) { throw "Test tsconfig not found: $testTsconfig" }

# An explicit URL wins so the proof can be run with an owner connection even
# after the application's own connection has been switched to the non-owner
# login. Otherwise, fall back to the shared helper, which reads
# CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE.
$localConnectionString = $env:RLS_POSTGRES_URL

if (-not $localConnectionString) {
  . (Join-Path $root "scripts\lib\hyperdrive-local-connection.ps1")
  $localConnectionString = Get-HyperdriveLocalConnectionString
}

$connection = [System.Uri]$localConnectionString
$hostName = $connection.Host
$port = $connection.Port
$database = [System.Uri]::UnescapeDataString($connection.AbsolutePath.TrimStart("/"))

if ($hostName -ne "127.0.0.1" -or $port -ne 55432 -or $database -ne "artisan_marketplace_dev") {
  throw "The RLS proof only runs against 127.0.0.1:55432/artisan_marketplace_dev. Found host '$hostName', port '$port', database '$database'."
}

$running = docker ps --filter "name=^/$container$" --filter "status=running" --format "{{.Names}}"

if (-not $running) {
  throw "Container '$container' is not running. Start the project-local stack first (infra/docker/local-compose.yml)."
}

Write-Host ""
Write-Host "=== ROW-LEVEL SECURITY: REAL POSTGRESQL PROOF ===" -ForegroundColor Cyan
Write-Host "Creating a throwaway database; the project database is not modified."

$env:RLS_POSTGRES_URL = $localConnectionString

# stderr is merged into stdout so a diagnostic line does not become a
# terminating NativeCommandError under Windows PowerShell 5.1. The real exit
# status is still carried by $LASTEXITCODE.
& $tsx --tsconfig $testTsconfig $suite 2>&1

if ($LASTEXITCODE -ne 0) {
  throw "RLS PostgreSQL policy proof failed."
}

Remove-Item Env:\RLS_POSTGRES_URL -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "RLS POSTGRESQL POLICY PROOF PASSED" -ForegroundColor Green
