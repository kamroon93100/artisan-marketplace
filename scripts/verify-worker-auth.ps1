$ErrorActionPreference = "Stop"

# Real-runtime auth path proof (workerd via `wrangler dev`) against the
# guarded project PostgreSQL (CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE,
# port 55432).
#
# Acceptance (Phase 1, MVP execution day):
#   0  durable shape: health reports APP_ENV outside development/test, so
#      the PostgreSQL identity store is selected, not the in-memory one
#   1  GET  /health                         -> 200
#   2  POST /v1/auth/register               -> 201
#   3  POST /v1/auth/login (correct)        -> 200
#   4  POST /v1/auth/login (wrong pw)       -> 401 uniform invalid-credentials
#   5  GET  protected route, no credential  -> 401
#   6  GET  protected route, valid token    -> reaches PostgreSQL-backed
#                                             handler (404 unknown id, not 401/503)
#   7  stored password_hash in PostgreSQL   -> approved Argon2id PHC parameters
#   8  refresh rotates, old refresh refused -> 200 then 401 (replay refusal)
#   9  logout revokes (repeat idempotent)   -> 200, refreshed token then 401
#   10 session schema shared by register and login
#   11 no password, token, or hash values in the proof transcript, the
#      wrangler stdout, or the wrangler stderr
#
# Exit 0 = all checks pass. Exit 1 = proof failed (failing steps printed).
#
# Credential hygiene: every credential the proof captures (password, session
# tokens, stored hash) is registered with Add-Secret before the check that
# could print it, `Check` redacts both outcomes, and the final audit reads
# this script's own transcript. A gate that leaks its own tokens would not
# be a gate.

$root = "C:\Users\kgurd\Projects\artisan-marketplace"
$api = Join-Path $root "apps\api"
$wrangler = Join-Path $api "node_modules\.bin\wrangler.cmd"
$port = 8899
$base = "http://127.0.0.1:$port"
$outLog = Join-Path $env:TEMP "opencode\wauth.out.log"
$errLog = Join-Path $env:TEMP "opencode\wauth.err.log"
$transcript = Join-Path $env:TEMP "opencode\wauth-transcript.txt"
$container = "artisan-marketplace-postgres"
$database = "artisan_marketplace_dev"
$expectedPort = 55432

# A stale dev server on the proof port would silently answer this proof's
# requests with the wrong runtime shape (a leftover dev-shape worker serves
# registration from an in-memory store, so nothing reaches PostgreSQL). Refuse
# to run rather than prove against somebody else's process.
$portBusy = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($portBusy) {
  throw "Port $port is already in use (pid(s): $($portBusy.OwningProcess -join ', ')). Stop that listener before running this proof."
}

Remove-Item -LiteralPath $outLog, $errLog, $transcript -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path (Split-Path $outLog) -Force | Out-Null
$env:WRANGLER_SEND_METRICS = "false"

# The proof audits its own output for credential leaks, so everything it
# prints must land in a transcript it can re-read.
Start-Transcript -Path $transcript -Force | Out-Null

$stamp = Get-Random
$script:failures = @()
$script:secrets = @()

function Add-Secret([string] $value) {
  if ($value) { $script:secrets += $value }
}

# Proof output may quote short response snippets; never let a live credential
# through. Token/password values are registered with Add-Secret the moment
# they are captured, which must be BEFORE anything prints them.
function Redact([string] $text) {
  if (-not $text) { return "" }
  $out = $text
  foreach ($secret in $script:secrets) {
    if ($secret) { $out = $out.Replace($secret, "[REDACTED]") }
  }
  return $out
}

function Check([string] $name, [bool] $ok, [string] $detail) {
  # Redaction applies to both outcomes. A PASS is the line a reader trusts
  # most, so it is the one that must never carry a live credential.
  $safe = Redact $detail
  if ($ok) {
    Write-Host ("  PASS  {0}  {1}" -f $name, $safe) -ForegroundColor Green
  } else {
    $script:failures += $name
    Write-Host ("  FAIL  {0}  {1}" -f $name, $safe) -ForegroundColor Red
  }
}

# Registers the credentials carried by an auth response body and returns the
# parsed session, so every caller registers before it prints anything.
function Register-SecretsFrom([string] $jsonText) {
  try {
    $session = ($jsonText | ConvertFrom-Json).session
  } catch { return $null }
  if (-not $session) { return $null }
  Add-Secret $session.accessToken
  Add-Secret $session.refreshToken
  Add-Secret $session.sessionId
  return $session
}

# PowerShell 7: -SkipHttpErrorCheck returns 4xx/5xx as data instead of
# throwing, so no HttpResponseMessage stream handling is needed.
function Call([string] $method, [string] $path, [hashtable] $headers, [string] $body) {
  $req = @{
    Method            = $method
    Uri               = "$base$path"
    TimeoutSec        = 30
    SkipHttpErrorCheck = $true
  }
  if ($headers) { $req.Headers = $headers }
  if ($body) {
    $req.Body = $body
    $req.ContentType = "application/json"
  }
  try {
    $resp = Invoke-WebRequest @req
    return @{ status = [int]$resp.StatusCode; text = [string]$resp.Content }
  } catch {
    return @{ status = -1; text = $_.Exception.Message }
  }
}

function Get-Session([string] $jsonText) {
  try {
    $parsed = $jsonText | ConvertFrom-Json
    $session = $parsed.session
    if (-not $session) { return $null }
    return @{
      access  = $session.accessToken
      refresh = $session.refreshToken
    }
  } catch {
    return $null
  }
}

# --- guarded project database (same scope assertions as the M8 proofs) ------
# The local connection string comes from the documented Hyperdrive environment
# variable; the credential is never committed here.
. (Join-Path $root "scripts\lib\hyperdrive-local-connection.ps1")
$localConnectionString = Get-HyperdriveLocalConnectionString
$cs = [System.Uri]$localConnectionString
if ($cs.Port -ne $expectedPort) {
  throw "Refusing to run: expected port $expectedPort but the binding targets $($cs.Port). The instance on 5432 is not this project."
}
if ($cs.Host -ne "127.0.0.1") { throw "Refusing to run: expected 127.0.0.1 but binding targets $($cs.Host)." }
$dbName = [System.Uri]::UnescapeDataString($cs.AbsolutePath.TrimStart("/"))
if ($dbName -ne $database) { throw "Refusing to run: expected $database but binding targets $dbName." }
$dbUser = [System.Uri]::UnescapeDataString(($cs.UserInfo -split ":")[0])

$running = docker ps --filter "name=^/$container$" --filter "status=running" --format "{{.Names}}"
if (-not $running) { throw "Container '$container' is not running (infra/docker/local-compose.yml)." }

function Get-StoredPasswordHash([string] $username) {
  $query = "select password_hash from identity_accounts where username = '$username' limit 1"
  $lines = @(docker exec -i $container psql -U $dbUser -d $database -t -A -c $query 2>&1)
  if ($LASTEXITCODE -ne 0) { return $null }
  $value = ($lines | Where-Object { $_ -match '^\$argon2id\$' } | Select-Object -First 1)
  if (-not $value) {
    $any = $lines | Where-Object { $_ -and $_.Trim() } | Select-Object -First 1
    if ($any) { return $any.Trim() } else { return $null }
  }
  return $value.Trim()
}

# --- boot the real Worker ----------------------------------------------------
# The durable PostgreSQL identity path is only exercised in the production
# shape: `APP_ENV` outside development/test selects the PostgreSQL store,
# disables the development seam, and keeps `/health` public through it. The
# override is passed on the launch line (a supported Wrangler variable
# override); .dev.vars is never read or printed by this proof.
$proc = Start-Process -FilePath $wrangler -ArgumentList @("dev", "--port", "$port", "--var", "APP_ENV:production") `
  -WorkingDirectory $api `
  -RedirectStandardOutput $outLog -RedirectStandardError $errLog `
  -PassThru -WindowStyle Hidden

try {
  $ready = $false
  $h = @{ status = -1; text = "" }
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 2
    if ($proc.HasExited) { break }
    $h = Call "GET" "/health" $null $null
    if ($h.status -eq 200) { $ready = $true; break }
  }

  if (-not $ready) {
    Write-Host "WORKER DID NOT BECOME READY" -ForegroundColor Red
    Get-Content $outLog -ErrorAction SilentlyContinue | Select-Object -Last 25
    Get-Content $errLog -ErrorAction SilentlyContinue | Select-Object -Last 25
    exit 1
  }

  Write-Host "=== REAL WORKER AUTH PATH (workerd via wrangler dev, guarded PG) ===" -ForegroundColor Cyan

  # 0) effective runtime shape, proven before any credential is issued -------
  # Health reports the Worker's own view of APP_ENV, so a "production" body
  # means the launch override took effect. In-memory identity storage is not
  # selected at that value (createIdentityService chooses it only for
  # development/test), and the 401 in check 5 independently confirms the
  # development seam is off. The PostgreSQL-backed proof lands in check 7.
  $envReported = "unset"
  try {
    $healthBody = $h.text | ConvertFrom-Json
    if ($healthBody.environment) { $envReported = [string]$healthBody.environment }
  } catch { }
  Check "durable shape (APP_ENV not development/test)" ($envReported -ne "development" -and $envReported -ne "test" -and $envReported -ne "unset") "health reports APP_ENV=$envReported"

  Check "health" ($h.status -eq 200) "GET /health -> $($h.status)"

  # 2) register ---------------------------------------------------------------
  $username = "wrk_$stamp"
  $password = "WorkerProof-$stamp-9x"
  Add-Secret $password
  $registerBody = @{ username = $username; password = $password } | ConvertTo-Json
  $reg = Call "POST" "/v1/auth/register" $null $registerBody
  # Register the response's credentials before the check prints the body.
  $regParsed = Register-SecretsFrom $reg.text
  Check "register" ($reg.status -eq 201) "POST /v1/auth/register -> $($reg.status) (session schema verified below)"

  $regSession = $null
  $a1 = $null; $r1 = $null
  if ($regParsed) {
    $a1 = $regParsed.accessToken; $r1 = $regParsed.refreshToken
    $regSession = @{ access = $a1; refresh = $r1 }
  }

  # 3) login (correct) --------------------------------------------------------
  $login = Call "POST" "/v1/auth/login" $null $registerBody
  $loginParsed = Register-SecretsFrom $login.text
  Check "login (correct password)" ($login.status -eq 200) "POST /v1/auth/login -> $($login.status) (session schema verified below)"
  $loginSession = $null
  if ($loginParsed) { $loginSession = @{ access = $loginParsed.accessToken; refresh = $loginParsed.refreshToken } }

  # 3b) session schema -------------------------------------------------------
  # P4: register, login and refresh share one response schema. This asserts
  # the shape without printing any credential value.
  $schemaOk = $true
  foreach ($parsed in @($regParsed, $loginParsed)) {
    if (-not ($parsed -and $parsed.sessionId -and $parsed.accessToken -and $parsed.refreshToken `
        -and $parsed.accessExpiresAt -and $parsed.refreshExpiresAt `
        -and $parsed.actor -and $parsed.actor.actorId -and $parsed.actor.username -and $parsed.actor.roles)) {
      $schemaOk = $false
    }
  }
  Check "session schema on register and login" $schemaOk "sessionId, accessToken, refreshToken, expiries and actor present in both responses"

  # 4) login (wrong) ----------------------------------------------------------
  $badBody = @{ username = $username; password = "definitely-wrong-$stamp" } | ConvertTo-Json
  $loginBad = Call "POST" "/v1/auth/login" $null $badBody
  $uniform401 = ($loginBad.status -eq 401) -and ($loginBad.text -match "Invalid username or password")
  Check "login (wrong password) -> uniform 401" $uniform401 "POST /v1/auth/login (wrong) -> $($loginBad.status)"

  # 5) protected route, anonymous --------------------------------------------
  $absent = "/catalog/products/00000000-0000-4000-8000-000000000000"
  $anon = Call "GET" $absent $null $null
  Check "protected route, no credential -> 401" ($anon.status -eq 401) "GET protected -> $($anon.status)"

  # 6) protected route, valid token ------------------------------------------
  $token = $null
  if ($loginSession) { $token = $loginSession.access } elseif ($a1) { $token = $a1 }
  if ($token) {
    $authed = Call "GET" $absent @{ authorization = "Bearer $token" } $null
    # 404 (unknown id) proves the request passed auth and reached the
    # PostgreSQL-backed handler; 401/503 would mean auth or DB wiring broke.
    Check "protected route, valid token -> PG handler" ($authed.status -eq 404) "GET protected -> $($authed.status) (404 = reached PG path)"
  } else {
    Check "protected route, valid token -> PG handler" $false "no session token issued"
  }

  # 7) stored password hash in PostgreSQL ------------------------------------
  $storedHash = Get-StoredPasswordHash $username
  # A password hash is credential material: never print it. Only the
  # parameter segment (which carries no salt or tag) is reported.
  Add-Secret $storedHash
  $phcOk = $storedHash -and ($storedHash -match '^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$')
  $phcParams = if ($storedHash -match '^(\$argon2id\$v=\d+\$m=\d+,t=\d+,p=\d+)') { $Matches[1] } else { 'none' }
  $phcDetail = if ($storedHash) { "stored hash parameters -> $phcParams (length $($storedHash.Length))" } else { "no password_hash row found for $username" }
  Check "stored password_hash is approved Argon2id PHC" $phcOk $phcDetail

  # 8) refresh rotation + replay refusal -------------------------------------
  $rCurrent = $null
  if ($loginSession) { $rCurrent = $loginSession.refresh } elseif ($r1) { $rCurrent = $r1 }
  if ($rCurrent) {
    $refresh1 = Call "POST" "/v1/auth/refresh" $null (@{ refreshToken = $rCurrent } | ConvertTo-Json)
    Register-SecretsFrom $refresh1.text | Out-Null
    $s2 = Get-Session $refresh1.text
    Check "refresh rotates pair" (($refresh1.status -eq 200) -and $s2 -and $s2.refresh -and ($s2.refresh -ne $rCurrent)) "POST /v1/auth/refresh -> $($refresh1.status), rotation=$(if ($s2 -and $s2.refresh -and $s2.refresh -ne $rCurrent) { 'new refresh token differs' } else { 'no rotation detected' })"

    # Replay of the consumed refresh token must be refused. This is the one
    # refusal the contract distinguishes from the uniform invalid-token
    # failure: 401 UNAUTHENTICATED with details.reason=SESSION_REVOKED.
    $replay = Call "POST" "/v1/auth/refresh" $null (@{ refreshToken = $rCurrent } | ConvertTo-Json)
    $replay401 = ($replay.status -eq 401) -and ($replay.text -match 'SESSION_REVOKED') -and ($replay.text -match 'Session revoked\.')
    Check "refresh replay refused" $replay401 "POST /v1/auth/refresh (already used) -> $($replay.status) $($replay.text)"

    # 9) logout revokes; repeat is idempotent; rotated token no longer usable.
    $logout = Call "POST" "/v1/auth/logout" $null (@{ refreshToken = $rCurrent } | ConvertTo-Json)
    $logout2 = Call "POST" "/v1/auth/logout" $null (@{ refreshToken = $rCurrent } | ConvertTo-Json)
    $logoutOk = ($logout.status -eq 200) -and ($logout2.status -eq 200) -and ($logout.text -match '"ok"\s*:\s*true')
    Check "logout 200 + repeat idempotent 200" $logoutOk "POST /v1/auth/logout -> $($logout.status), repeat -> $($logout2.status)"

    $postLogout = Call "POST" "/v1/auth/refresh" $null (@{ refreshToken = $rCurrent } | ConvertTo-Json)
    Check "refresh after logout refused" ($postLogout.status -eq 401) "POST /v1/auth/refresh (revoked) -> $($postLogout.status)"

    if ($s2) { Add-Secret $s2.access; Add-Secret $s2.refresh }
  } else {
    Check "refresh rotates pair" $false "no refresh token issued"
    Check "refresh replay refused" $false "no refresh token issued"
    Check "logout 200 + repeat idempotent 200" $false "no refresh token issued"
    Check "refresh after logout refused" $false "no refresh token issued"
  }

  # 10) secret redaction: neither the wrangler logs nor this proof's own
  # transcript may contain credentials -----------------------------------------
  Start-Sleep -Seconds 1
  $logText = @()
  if (Test-Path $outLog) { $logText += (Get-Content $outLog -Raw -ErrorAction SilentlyContinue) }
  if (Test-Path $errLog) { $logText += (Get-Content $errLog -Raw -ErrorAction SilentlyContinue) }
  if (Test-Path $transcript) { $logText += (Get-Content $transcript -Raw -ErrorAction SilentlyContinue) }
  $logBlob = $logText -join "`n"
  $leaks = @()
  foreach ($secret in $script:secrets) {
    if ($secret -and $logBlob.Contains($secret)) { $leaks += "credential value present in output or logs" }
  }
  if ($logBlob -match [regex]::Escape($password)) { $leaks += "register password present in output or logs" }
  if ($logBlob -match 'definitely-wrong-\d+') { $leaks += "wrong-password probe value present in output or logs" }
  Check "no credentials in proof output or wrangler logs" ($leaks.Count -eq 0) $(if ($leaks.Count -eq 0) { "proof transcript and out/err logs contain no password, token, or hash values" } else { $leaks -join "; " })
} finally {
  # `wrangler.cmd` spawns workerd as a child process; killing only the parent
  # leaves the child listening on the proof port, where it would later answer
  # another proof's requests with the wrong runtime shape. Kill the whole tree.
  if ($proc -and -not $proc.HasExited) {
    taskkill /PID $proc.Id /T /F 2>&1 | Out-Null
  }
  foreach ($orphan in (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).OwningProcess) {
    Stop-Process -Id $orphan -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 1
}

try {
  Write-Host ""
  if ($script:failures.Count -eq 0) {
    Write-Host "WORKER AUTH PATH PROOF PASSED (11/11 checks, real workerd + guarded PG)" -ForegroundColor Green
    $script:proofPassed = $true
  } else {
    Write-Host ("WORKER AUTH PATH PROOF FAILED: {0}" -f ($script:failures -join ", ")) -ForegroundColor Red
    $script:proofPassed = $false
  }
} finally {
  Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
}

if ($script:proofPassed) { exit 0 }
exit 1
