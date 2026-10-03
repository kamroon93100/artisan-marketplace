$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$mobile = Join-Path $root "apps\mobile"
$api = Join-Path $root "apps\api"
$contracts = Join-Path $root "packages\contracts"
$config = Join-Path $root "packages\config"
$utils = Join-Path $root "packages\utils"

$mobileTsc = Join-Path $mobile "node_modules\.bin\tsc.cmd"
$mobileEslint = Join-Path $mobile "node_modules\.bin\eslint.cmd"
$apiTsc = Join-Path $api "node_modules\.bin\tsc.cmd"
$apiWrangler = Join-Path $api "node_modules\.bin\wrangler.cmd"
$contractsTsc = Join-Path $contracts "node_modules\.bin\tsc.cmd"
$configTsc = Join-Path $config "node_modules\.bin\tsc.cmd"
$utilsTsc = Join-Path $utils "node_modules\.bin\tsc.cmd"
$tsx = Join-Path $root "node_modules\.bin\tsx.cmd"
$testTsconfig = Join-Path $root "tests\m2-media-upload\tsconfig.json"

foreach ($tool in @(
  $mobileTsc,
  $mobileEslint,
  $apiTsc,
  $apiWrangler,
  $contractsTsc,
  $configTsc,
  $utilsTsc,
  $tsx
)) {
  if (-not (Test-Path $tool)) {
    throw "Required tool not found: $tool"
  }
}

# Suites that need no running service. These run in the fast path so a
# behavioral regression fails verification rather than being discovered
# later on a developer machine.
$unitSuites = @(
  "apps\api\wrangler-config.test.ts",
  "apps\api\src\api.test.ts",
  "apps\api\src\shared\auth\session.test.ts",
  "apps\api\src\modules\identity\identity.test.ts",
  "apps\api\src\shared\persistence\postgres-connection.test.ts",
  "apps\api\src\shared\ratelimit\in-memory-rate-limiter.test.ts",
  "apps\api\src\shared\persistence\postgres-database.test.ts",
  "apps\api\src\modules\catalog\catalog-service.test.ts",
  "apps\api\src\modules\catalog\catalog-lifecycle.test.ts",
  "apps\api\src\modules\catalog\catalog-lifecycle-http.test.ts",
  "apps\api\src\modules\catalog\catalog-approve.test.ts",
  "apps\api\src\modules\catalog\composition.test.ts",
  "apps\api\src\modules\catalog\domain\catalog-state.test.ts",
  "apps\api\src\modules\catalog\domain\catalog-publish.test.ts",
  "apps\api\src\modules\catalog\http.test.ts",
  "apps\api\src\modules\catalog\catalog-published-read.test.ts",
  "apps\api\src\modules\catalog\infrastructure\postgres-catalog-repository.test.ts",
  "apps\api\src\modules\media\domain\media-state.test.ts",
  "apps\api\src\modules\media\domain\media-verification.test.ts",
  "apps\api\src\modules\media\application\media-service.test.ts",
  "apps\api\src\modules\media\http.test.ts",
  "apps\api\src\modules\media\infrastructure\postgres-media-repository.test.ts",
  "apps\api\src\modules\ai\domain\ai-job.test.ts",
  "apps\api\src\modules\ai\domain\ai-validation-pipeline.test.ts",
  "apps\api\src\modules\ai\application\ai-pipeline-service.test.ts",
  "apps\api\src\modules\ai\application\ai-review-service.test.ts",
  "apps\api\src\modules\ai\infrastructure\postgres-ai-repository.test.ts",
  "apps\api\src\modules\ai\composition.test.ts",
  "apps\api\src\modules\ai\http.test.ts",
  "apps\api\src\modules\review\domain\review-readiness.test.ts",
  "apps\api\src\modules\review\review-publish.test.ts",
  "apps\api\src\modules\review\composition.test.ts",
  "apps\api\src\modules\review\http.test.ts",
  "apps\api\src\modules\discovery\domain\discovery-query.test.ts",
  "apps\api\src\modules\discovery\discovery-journey.test.ts",
  "apps\api\src\modules\inquiry\inquiry-journey.test.ts",
  "apps\api\src\modules\inquiry\infrastructure\postgres-inquiry-repository.test.ts",
  "apps\mobile\src\security\redact-secrets.test.ts",
  "apps\mobile\src\network\expo-file-byte-uploader.test.ts",
  "apps\mobile\src\network\media-sync-transport.test.ts",
  "apps\mobile\src\network\product-sync-transport.test.ts",
  "apps\mobile\src\network\review-transport.test.ts",
  "apps\mobile\src\network\discovery-transport.test.ts",
  "apps\mobile\src\features\review\review-decision.test.ts",
  "apps\mobile\src\sync\upload-outcome.test.ts",
  "tests\m2-product-sync\product-sync-runtime.test.ts",
  "tests\m2-media-upload\media-upload-storage-runtime.test.ts",
  "tests\m2-media-upload\media-upload-pipeline-runtime.test.ts",
  "tests\m5-review-publish\review-screen-transport-identity.test.ts"
)

foreach ($suite in $unitSuites) {
  $path = Join-Path $root $suite

  if (-not (Test-Path $path)) {
    throw "Test suite not found: $path"
  }
}

$step = 0
$totalSteps = 8

function Step([string] $label) {
  $script:step++
  $count = "$($script:step)/$($script:totalSteps)"
  Write-Host "[$count] $label"
}

Write-Host ""
Write-Host "=== FULL FAST VERIFY ===" -ForegroundColor Cyan

Step "Mobile TypeScript"
Push-Location $mobile
try {
  & $mobileTsc --noEmit
  if ($LASTEXITCODE -ne 0) { throw "Mobile TypeScript verification failed." }
}
finally {
  Pop-Location
}

Step "Mobile ESLint"
Push-Location $mobile
try {
  & $mobileEslint .
  if ($LASTEXITCODE -ne 0) { throw "Mobile ESLint verification failed." }
}
finally {
  Pop-Location
}

Step "API TypeScript"
Push-Location $api
try {
  & $apiTsc --noEmit
  if ($LASTEXITCODE -ne 0) { throw "API TypeScript verification failed." }
}
finally {
  Pop-Location
}

Step "Cloudflare Worker dry-run"
Push-Location $api
try {
  & $apiWrangler deploy --dry-run
  if ($LASTEXITCODE -ne 0) { throw "Wrangler verification failed." }
}
finally {
  Pop-Location
}

Step "Contracts TypeScript"
Push-Location $contracts
try {
  & $contractsTsc --noEmit
  if ($LASTEXITCODE -ne 0) { throw "Contracts TypeScript verification failed." }
}
finally {
  Pop-Location
}

Step "Config TypeScript"
Push-Location $config
try {
  & $configTsc --noEmit
  if ($LASTEXITCODE -ne 0) { throw "Config TypeScript verification failed." }
}
finally {
  Pop-Location
}

Step "Utils TypeScript"
Push-Location $utils
try {
  & $utilsTsc --noEmit
  if ($LASTEXITCODE -ne 0) { throw "Utils TypeScript verification failed." }
}
finally {
  Pop-Location
}

Step "API, AI, review, discovery, inquiry and M2 test suites"

Push-Location $root
try {
  foreach ($suite in $unitSuites) {
    Write-Host "      - $suite"

    & $tsx --tsconfig $testTsconfig $suite

    if ($LASTEXITCODE -ne 0) {
      throw "Test suite failed: $suite"
    }
  }
}
finally {
  Pop-Location
}

Write-Host ""
Write-Host "FULL FAST VERIFY PASSED" -ForegroundColor Green
