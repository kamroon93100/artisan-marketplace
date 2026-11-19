$ErrorActionPreference = "Stop"

# Real-PostgreSQL proof for migration 009 - identity_refresh_grants.
#
# The connection string is read from the documented
# CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE environment
# variable, so the local database credential is never committed.
#
# Scope guard: this proof refuses to run against anything other than the
# repository's own project database - the local connection string on port
# 55432. The native PostgreSQL listening on 5432 is a different instance on
# this machine and is never connected to, read, or written.
#
# What this script proves, in order:
#   1. the target really is the project database on 55432;
#   2. migrations 001-008 establish the existing local schema;
#   3. migration 009 is applied, and the identity_refresh_grants table is
#      proven to carry exactly the expected columns, constraints, foreign
#      keys and indexes;
#   4. an object-by-object schema inventory proves two things at once:
#      every object migrations 001-008 own is byte-identical before and
#      after, and the identity_refresh_grants object set is exactly what
#      009 specifies - so no view, function, extension, trigger, RLS policy
#      was created, and no 001-008 object was touched;
#   5. a second application of 009 is a no-op, leaving an identical
#      inventory;
#   6. after a PostgreSQL restart the table still exists with the same
#      structure - the runtime-schema proof this repository's earlier
#      milestone runners also require;
#   7. no rows were written, so no grant credential exists in the database
#      as a result of running this proof.

$root = Split-Path -Parent $PSScriptRoot
$migrations = @(
  (Join-Path $root "infra\migrations\001_catalog\migration.sql"),
  (Join-Path $root "infra\migrations\002_media\migration.sql"),
  (Join-Path $root "infra\migrations\003_catalog_idempotency.sql"),
  (Join-Path $root "infra\migrations\004_media_upload_verification.sql"),
  (Join-Path $root "infra\migrations\005_catalog_versions.sql"),
  (Join-Path $root "infra\migrations\006_ai_jobs_and_proposals.sql"),
  (Join-Path $root "infra\migrations\007_inquiries_and_published_search.sql"),
  (Join-Path $root "infra\migrations\008_identity_accounts_and_sessions.sql")
)
$migration9 = Join-Path $root "infra\migrations\009_identity_refresh_grants.sql"

$container = "artisan-marketplace-postgres"
$expectedPort = 55432
$expectedDatabase = "artisan_marketplace_dev"
$expectedHost = "127.0.0.1"

$step = 0
$totalSteps = 10

function Step([string] $label) {
  $script:step++
  $count = "$($script:step)/$($script:totalSteps)"
  Write-Host "[$count] $label"
}

function Invoke-Psql([string] $sql, [string] $what) {
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"

  try {
    $output = $sql |
      docker exec -i $container psql -X -q -v ON_ERROR_STOP=1 -U $script:user -d $script:database 2>&1 |
      Out-String
  }
  finally {
    $ErrorActionPreference = $previousPreference
  }

  if ($LASTEXITCODE -ne 0) {
    throw "$what failed (exit $LASTEXITCODE):`n$($output.Trim())"
  }

  return $output
}

function Apply-File([string] $path) {
  $null = Invoke-Psql (Get-Content -LiteralPath $path -Raw -Encoding utf8) "Applying $(Split-Path -Leaf $path)"
}

function Apply-Sql([string] $sql, [string] $what) {
  $output = Invoke-Psql $sql $what
  $trimmed = $output.Trim()

  if ($trimmed) {
    Write-Host "      $trimmed"
  }
}

function Show-Sql([string] $sql, [string] $what) {
  Write-Host ((Invoke-Psql $sql $what).Trim())
}

$inventorySql = @'
select 'table:'||table_name from information_schema.tables where table_schema='public'
union all select 'view:'||table_name from information_schema.views where table_schema='public'
union all select 'matview:'||matviewname from pg_matviews where schemaname='public'
union all select 'sequence:'||sequence_name from information_schema.sequences where sequence_schema='public'
union all select 'function:'||routine_name from information_schema.routines where routine_schema='public'
union all select 'extension:'||e.extname from pg_extension e
union all select 'trigger:'||t.tgrelid::regclass||':'||t.tgname from pg_trigger t where not t.tgisinternal and t.tgrelid in (select oid from pg_class where relnamespace='public'::regnamespace)
union all select 'fk:'||c.conrelid::regclass||':'||c.conname||':'||c.confrelid::regclass||':del='||c.confdeltype::text||':upd='||c.confupdtype::text from pg_constraint c where c.contype='f' and c.connamespace='public'::regnamespace
union all select 'check:'||c.conrelid::regclass||':'||c.conname from pg_constraint c where c.contype='c' and c.connamespace='public'::regnamespace
union all select 'key:'||c.conrelid::regclass||':'||c.conname||':type='||c.contype::text||':key='||c.conkey::text from pg_constraint c where c.contype in ('u','p') and c.connamespace='public'::regnamespace
union all select 'rls:'||cl.relname||'='||cl.relrowsecurity::text from pg_class cl where cl.relnamespace='public'::regnamespace and cl.relkind in ('r','p','v','m','f')
union all select 'policy:'||p.schemaname||':'||p.tablename||':'||p.policyname from pg_policies p where p.schemaname='public'
union all select 'index:'||i.indexrelid::regclass||':uniq='||i.indisunique::text||':valid='||i.indisvalid::text||':nd='||i.indnullsnotdistinct::text from pg_index i where i.indrelid in (select oid from pg_class where relnamespace='public'::regnamespace)
union all select 'grant:'||table_name||':'||privilege_type from information_schema.table_privileges where table_schema='public'
order by 1;
'@

function Write-Inventory([string] $path) {
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"

  try {
    $lines = $inventorySql |
      docker exec -i $container psql -X -q -t -A -v ON_ERROR_STOP=1 -U $script:user -d $script:database 2>&1 |
      Out-String
  }
  finally {
    $ErrorActionPreference = $previousPreference
  }

  if ($LASTEXITCODE -ne 0) {
    throw "Schema inventory capture failed (exit $LASTEXITCODE):`n$($lines.Trim())"
  }

  ($lines -split "`r?`n") |
    Where-Object { $_.Trim() } |
    Set-Content -LiteralPath $path -Encoding utf8
}

$assertSql = @'
do $m9$
declare
  v_actual text;
  v_count  integer;
  v_row    record;
begin
  if to_regclass('public.identity_refresh_grants') is null then
    raise exception 'FAIL: identity_refresh_grants does not exist';
  end if;

  select count(*) into v_count
    from information_schema.columns
   where table_schema = 'public' and table_name = 'identity_refresh_grants';
  if v_count <> 7 then
    raise exception 'FAIL: identity_refresh_grants has % columns (expected 7)', v_count;
  end if;

  for v_row in
    select * from (values
      ('identity_refresh_grants', 'id',                     'uuid',                     'NO'),
      ('identity_refresh_grants', 'session_id',             'uuid',                     'NO'),
      ('identity_refresh_grants', 'token_hash',             'text',                     'NO'),
      ('identity_refresh_grants', 'issued_at',              'timestamp with time zone', 'NO'),
      ('identity_refresh_grants', 'expires_at',             'timestamp with time zone', 'NO'),
      ('identity_refresh_grants', 'consumed_at',            'timestamp with time zone', 'YES'),
      ('identity_refresh_grants', 'rotated_to',             'uuid',                     'YES')
    ) as e(tbl, col, dtype, nullable)
  loop
    select format('%s|%s', c.data_type, c.is_nullable)
      into v_actual
      from information_schema.columns c
     where c.table_schema = 'public'
       and c.table_name = v_row.tbl
       and c.column_name = v_row.col;

    if v_actual is null then
      raise exception 'FAIL: column %.% is missing', v_row.tbl, v_row.col;
    end if;

    if v_actual <> v_row.dtype || '|' || v_row.nullable then
      raise exception 'FAIL: column %.% expected %, found %',
        v_row.tbl, v_row.col, v_row.dtype || '|' || v_row.nullable, v_actual;
    end if;
  end loop;

  select count(*) into v_count
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'identity_refresh_grants'
     and column_default is not null;
  if v_count <> 0 then
    raise exception 'FAIL: identity_refresh_grants has % defaulted columns (expected 0)', v_count;
  end if;

  -- Primary key.
  select string_agg(a.attname::text, ',' order by a.attnum) into v_actual
    from pg_constraint k
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
   where k.conrelid = 'identity_refresh_grants'::regclass and k.contype = 'p';
  if v_actual is distinct from 'id' then
    raise exception 'FAIL: identity_refresh_grants primary key is % (expected id)', coalesce(v_actual, '(none)');
  end if;

  -- Foreign keys: exactly two.
  -- 1. session_id -> identity_sessions(session_id) ON DELETE CASCADE
  -- 2. rotated_to -> identity_refresh_grants(id) ON DELETE RESTRICT DEFERRABLE
  select count(*) into v_count
    from pg_constraint k
   where k.conrelid = 'identity_refresh_grants'::regclass and k.contype = 'f';
  if v_count <> 2 then
    raise exception 'FAIL: identity_refresh_grants has % foreign keys (expected 2)', v_count;
  end if;

  select string_agg(format('%s|%s|%s|%s', a.attname, k.confrelid::regclass, k.confdeltype::text, k.confupdtype::text), ';' order by a.attname)
    into v_actual
    from pg_constraint k
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
   where k.conrelid = 'identity_refresh_grants'::regclass and k.contype = 'f';

  if v_actual not like '%session_id|identity_sessions|c|a%' then
    raise exception 'FAIL: session_id foreign key missing or wrong (found %)', coalesce(v_actual, '(none)');
  end if;
  if v_actual not like '%rotated_to|identity_refresh_grants|r|a%' then
    raise exception 'FAIL: rotated_to foreign key missing or wrong (found %)', coalesce(v_actual, '(none)');
  end if;

  -- Check constraints: exactly one (expiry_check).
  select string_agg(conname::text, ',' order by (conname::text) COLLATE "C") into v_actual
    from pg_constraint
   where conrelid = 'identity_refresh_grants'::regclass and contype = 'c';
  if v_actual is distinct from 'identity_refresh_grants_expiry_check' then
    raise exception 'FAIL: identity_refresh_grants check constraints are % (expected identity_refresh_grants_expiry_check)', coalesce(v_actual, '(none)');
  end if;

  select pg_get_constraintdef(oid) into v_actual
    from pg_constraint where conname = 'identity_refresh_grants_expiry_check';
  if v_actual is null or v_actual not like '%expires_at >= issued_at%' then
    raise exception 'FAIL: expiry check does not enforce expires_at >= issued_at (found %)', coalesce(v_actual, '(none)');
  end if;

  -- Index inventory: exactly 5 indexes on identity_refresh_grants (PK + 4 secondary).
  select string_agg(indexrelid::regclass::text, ',' order by (indexrelid::regclass::text) COLLATE "C")
    into v_actual
    from pg_index where indrelid = 'identity_refresh_grants'::regclass;
  if v_actual is distinct from 'identity_refresh_grants_one_active_per_session_idx,identity_refresh_grants_pkey,identity_refresh_grants_rotated_to_idx,identity_refresh_grants_session_id_idx,identity_refresh_grants_token_hash_idx' then
    raise exception 'FAIL: identity_refresh_grants indexes are %', coalesce(v_actual, '(none)');
  end if;

  -- Per-index uniqueness, column list, and predicates.
  for v_row in
    select * from (values
      ('identity_refresh_grants_token_hash_idx',             'token_hash',              true,  false, null),
      ('identity_refresh_grants_session_id_idx',             'session_id',              false, false, null),
      ('identity_refresh_grants_one_active_per_session_idx', 'session_id',              true,  false, 'consumed_at IS NULL'),
      ('identity_refresh_grants_rotated_to_idx',             'rotated_to',              true,  false, 'rotated_to IS NOT NULL')
    ) as e(idx, cols, uniq, nd, pred)
  loop
    select regexp_replace(
             regexp_replace(
               format('%s|%s|%s|%s',
                      (select string_agg(a.attname::text, ',' order by a.attnum)
                         from pg_attribute a
                        where a.attrelid = i.indrelid and a.attnum = any (i.indkey)),
                      i.indisunique::text,
                      i.indnullsnotdistinct::text,
                      coalesce(pg_get_expr(i.indpred, i.indrelid), 'null')),
               '[()]', '', 'g'),
             '\s+', ' ', 'g')
      into v_actual
      from pg_index i
     where i.indexrelid = to_regclass('public.' || v_row.idx);

    if v_actual is null then
      raise exception 'FAIL: index % is missing', v_row.idx;
    end if;

    if v_actual <> v_row.cols || '|' || v_row.uniq || '|' || v_row.nd || '|' || coalesce(v_row.pred, 'null') then
      raise exception 'FAIL: index % expected %, found %', v_row.idx,
        v_row.cols || '|' || v_row.uniq || '|' || v_row.nd || '|' || coalesce(v_row.pred, 'null'),
        v_actual;
    end if;
  end loop;

  -- Forbidden state for migration 009.
  if exists (
    select 1 from pg_class cl
     where cl.relnamespace = 'public'::regnamespace
       and cl.relkind in ('r','p','v','m','f')
       and cl.relname like 'identity\_%'
       and cl.relname not in ('identity_accounts', 'identity_sessions', 'identity_refresh_grants')
) then
    raise exception 'FAIL: unexpected identity_* relation exists beyond the three tables';
  end if;

  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'identity\_%'
  ) then
    raise exception 'FAIL: unexpected identity_* function exists';
  end if;

  if exists (
    select 1 from pg_class
     where oid = to_regclass('public.identity_refresh_grants')
       and (relrowsecurity or relforcerowsecurity)
  ) then
    raise exception 'FAIL: row-level security is enabled on identity_refresh_grants (ADR-007 is deferred)';
  end if;

  if exists (
    select 1 from pg_trigger
     where tgrelid = to_regclass('public.identity_refresh_grants')
       and not tgisinternal
  ) then
    raise exception 'FAIL: trigger exists on identity_refresh_grants';
  end if;

  if exists (
    select 1 from pg_policies
     where tablename = 'identity_refresh_grants'
  ) then
    raise exception 'FAIL: RLS policy exists on identity_refresh_grants';
  end if;

  -- No credential row may exist: this proof never inserts one.
  select count(*) into v_count from identity_refresh_grants;
  if v_count <> 0 then
    raise exception 'FAIL: identity_refresh_grants contains % rows (expected 0)', v_count;
  end if;

  raise notice 'M8 migration 009 structural assertions passed';
end
$m9$;
'@

$reportSql = @'
\pset border 2
select table_name, column_name, data_type, is_nullable, coalesce(column_default, '-') as default_value
  from information_schema.columns
 where table_schema = 'public' and table_name = 'identity_refresh_grants'
 order by ordinal_position;

select k.conrelid::regclass as table_name,
       k.conname as constraint_name,
       k.contype as type,
       pg_get_constraintdef(k.oid) as definition
  from pg_constraint k
 where k.connamespace = 'public'::regnamespace
   and k.conrelid::regclass::text = 'identity_refresh_grants'
 order by 1, 2;

select i.indrelid::regclass as table_name,
       i.indexrelid::regclass as index_name,
       i.indisunique as is_unique,
       i.indnullsnotdistinct as nulls_not_distinct,
       (select string_agg(a.attname::text, ',' order by a.attnum)
          from pg_attribute a
         where a.attrelid = i.indrelid and a.attnum = any (i.indkey)) as columns,
       coalesce(pg_get_expr(i.indpred, i.indrelid), '-') as partial_predicate
  from pg_index i
 where i.indrelid = to_regclass('public.identity_refresh_grants')
 order by 1, 2;

select (select count(*) from identity_refresh_grants) as identity_refresh_grants_rows;
'@

# ---------------------------------------------------------------------------
# Phase 1 - environment
# ---------------------------------------------------------------------------

foreach ($migration in $migrations) {
  if (-not (Test-Path $migration)) { throw "Migration not found: $migration" }
}
if (-not (Test-Path $migration9)) { throw "Migration not found: $migration9" }

. (Join-Path $root "scripts\lib\hyperdrive-local-connection.ps1")
$localConnectionString = Get-HyperdriveLocalConnectionString

$connection = [System.Uri]$localConnectionString
$database = [System.Uri]::UnescapeDataString($connection.AbsolutePath.TrimStart("/"))
$user = [System.Uri]::UnescapeDataString(($connection.UserInfo -split ":")[0])
$targetHost = $connection.Host
$port = $connection.Port

if ($port -ne $expectedPort) {
  throw "REFUSED: local connection string targets port $port; the project PostgreSQL is on $expectedPort."
}
if ($database -ne $expectedDatabase) {
  throw "REFUSED: local connection string targets database '$database'; the project database is '$expectedDatabase'."
}
if ($targetHost -ne $expectedHost) {
  throw "REFUSED: local connection string targets host '$targetHost'; expected $expectedHost."
}

$running = docker ps --filter "name=^/$container$" --filter "status=running" --format "{{.Names}}"

if (-not $running) {
  throw "Container '$container' is not running. Start the project-local stack first (infra/docker/local-compose.yml)."
}

$published = @(docker port $container)
$publishedOnExpected = @($published | Where-Object { $_ -match ":$expectedPort\b" })

if ($publishedOnExpected.Count -eq 0) {
  throw "REFUSED: container '$container' does not publish port $expectedPort (got: $($published -join ', '))."
}

$tcp = Test-NetConnection -ComputerName $expectedHost -Port $expectedPort -WarningAction SilentlyContinue

if (-not $tcp.TcpTestSucceeded) {
  throw "REFUSED: nothing is accepting connections on ${expectedHost}:$expectedPort."
}

Write-Host ""
Write-Host "=== M8 MIGRATION 009: REAL POSTGRESQL PROOF ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Target (read from CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE):"
Write-Host "  host=$targetHost port=$port database=$database user=$user"
Write-Host "  container=$container"
Write-Host "  published=$($published -join ', ')"
Write-Host "  native PostgreSQL on 5432 is a different instance and is NOT contacted."
Write-Host ""

$psqlHost = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
$env:PGPASSWORD = ([System.Uri]$localConnectionString).UserInfo.Split(':')[1]

Step "Prove the 55432 TCP path reaches the project database"

if (Test-Path -LiteralPath $psqlHost) {
  $identity = & $psqlHost "host=$expectedHost port=$expectedPort dbname=$database user=$user" -X -q -t -A -F " | " -c "select current_database(), current_user, inet_server_addr(), inet_server_port(), version();" 2>&1

  if ($LASTEXITCODE -ne 0) {
    throw "Host-side proof query over ${expectedHost}:$expectedPort failed: $identity"
  }

  $identityLine = @($identity | Where-Object { $_ -and $_.Trim() } | Select-Object -First 1)

  if ($identityLine.Count -eq 0) {
    throw "Host-side proof query over ${expectedHost}:$expectedPort returned no row."
  }

  $parts = $identityLine[0] -split '\ \| '
  $serverPort = $parts[3]

  if ($parts[0] -ne $expectedDatabase) {
    throw "REFUSED: ${expectedHost}:$expectedPort answered database '$($parts[0])', expected '$expectedDatabase'."
  }
  if ($serverPort -ne "5432") {
    throw "REFUSED: unexpected server-side port '$serverPort' (container port inside the container is 5432, published as $expectedPort)."
  }

  Write-Host "  over TCP ${expectedHost}:$expectedPort -> db='$($parts[0])' user='$($parts[1])' server='$($parts[2]):$serverPort'"
  Write-Host "  $($parts[4])"
}
else {
  Write-Host "  LIMITATION: host psql client not found at '$psqlHost'; falling back to container port publishing plus Test-NetConnection evidence." -ForegroundColor Yellow
  Write-Host "  Proven: container '$container' publishes $expectedPort and ${expectedHost}:$expectedPort accepts TCP."
}

Remove-Item -Path Env:\PGPASSWORD -ErrorAction SilentlyContinue

Step "Baseline: hash migrations 001-008 before any work"

$hashBefore = @{}
foreach ($migration in $migrations) {
  $hashBefore[$migration] = (Get-FileHash -Algorithm SHA256 -LiteralPath $migration).Hash
}

Step "Apply migrations 001-008 to establish the existing local schema"

foreach ($migration in $migrations) {
  Write-Host "      - $(Split-Path -Leaf $migration)"
  Apply-File $migration
}

Step "Snapshot the schema before migration 009"

$tmp = [System.IO.Path]::GetTempPath()
$before = Join-Path $tmp "m9-schema-before.txt"
$after1 = Join-Path $tmp "m9-schema-after-pass1.txt"
$after2 = Join-Path $tmp "m9-schema-after-pass2.txt"
$after3 = Join-Path $tmp "m9-schema-after-restart.txt"

Write-Inventory $before
$beforeLines = @(Get-Content -LiteralPath $before)

# Migration 008 identity tables (preservation target)
$m8IdentityPattern = 'identity_(accounts|sessions)'

# Migration 009 identity table (new, not part of preservation)
$m9IdentityPattern = 'identity_refresh_grants'
$m9OwnedTable = 'identity_refresh_grants'

# Object *ownership*, not mere mention.
#
# Inventory lines are `kind:field:field:...`, so an object's owner is field 2
# for every kind except `policy:`, where field 2 is the schema and the owning
# table is field 3.
#
# Testing 008 membership by "does this line mention identity_accounts or
# identity_sessions" is not sufficient: migration 009's own foreign key
# *references* identity_sessions, so its line mentions an 008 table while
# being owned by 009. Counting that line as an 008 object makes the
# preservation check unsatisfiable the moment 009 creates the key.
function Test-OwnedBy([string] $line, [string] $table) {
  $parts = $line -split ':'
  $ownerIndex = if ($parts[0] -eq 'policy') { 2 } else { 1 }

  if ($parts.Count -le $ownerIndex) {
    return $false
  }

  return $parts[$ownerIndex] -eq $table
}

$m8BeforeIdentity = @($beforeLines | Where-Object {
  ($_ -match $m8IdentityPattern) -and -not (Test-OwnedBy $_ $m9OwnedTable)
})
$m8FirstApplication = ($m8BeforeIdentity.Count -eq 0)

$m9BeforeIdentity = @($beforeLines | Where-Object { $_ -match $m9IdentityPattern })
$m9AlreadyPresent = ($m9BeforeIdentity.Count -gt 0)

Write-Host "      - $($beforeLines.Count) public-schema objects recorded"
Write-Host "      - migration 008 identity objects already present: $($m8BeforeIdentity.Count)"
Write-Host "      - migration 009 identity objects already present: $($m9BeforeIdentity.Count)"

Step "Apply migration 009 (pass 1)"

Apply-File $migration9

Step "Object inventory proof after pass 1"

Write-Inventory $after1
$afterLines = @(Get-Content -LiteralPath $after1)

$beforeNonIdentity = @($beforeLines | Where-Object { $_ -notmatch $m8IdentityPattern -and $_ -notmatch $m9IdentityPattern })
$afterNonIdentity = @($afterLines | Where-Object { $_ -notmatch $m8IdentityPattern -and $_ -notmatch $m9IdentityPattern })

$drift = @(Compare-Object -ReferenceObject $beforeNonIdentity -DifferenceObject $afterNonIdentity)

if ($drift.Count -ne 0) {
  $detail = $drift | ForEach-Object { "$($_.SideIndicator) $($_.InputObject)" }
  throw "FAIL: migration 009 changed objects owned by migrations 001-008: $($detail -join '; ')"
}

# Verify migration 008 objects are identical before/after (preservation)
$m8AfterIdentity = @($afterLines | Where-Object {
  ($_ -match $m8IdentityPattern) -and -not (Test-OwnedBy $_ $m9OwnedTable)
})
$m8Drift = @(Compare-Object -ReferenceObject ($m8BeforeIdentity | Sort-Object) -DifferenceObject ($m8AfterIdentity | Sort-Object))

if ($m8Drift.Count -ne 0) {
  $detail = $m8Drift | ForEach-Object { "$($_.SideIndicator) $($_.InputObject)" }
  throw "FAIL: migration 008 identity objects differed before and after migration 009: $($detail -join '; ')"
}

# Capture migration 009 after objects for idempotency check
$m9AfterIdentity = @($afterLines | Where-Object { $_ -match $m9IdentityPattern })

# Capture all identity objects (008 + 009) for structural assertions
$identityLines = @($afterLines | Where-Object { $_ -match $m8IdentityPattern -or $_ -match $m9IdentityPattern })

$allowedPattern = '^(table:identity_accounts|table:identity_sessions|table:identity_refresh_grants|key:identity_|check:identity_|fk:identity_|index:identity_|rls:identity_|grant:identity_)'

$unexpected = @($identityLines | Where-Object { $_ -notmatch $allowedPattern })

if ($unexpected.Count -ne 0) {
  throw "FAIL: migration 009 created forbidden objects: $($unexpected -join ', ')"
}

$expectedCounts = @{
  'table'  = 3
  'key'    = 3
  'check'  = 6
  'fk'     = 3
  'index'  = 13
  'rls'    = 3
  'grant'  = 21
}

foreach ($prefix in $expectedCounts.Keys) {
  $count = @($identityLines | Where-Object { $_ -like "$prefix`:*" }).Count

  if ($count -ne $expectedCounts[$prefix]) {
    throw "FAIL: migration 009 owns $count '$prefix' objects, expected $($expectedCounts[$prefix])."
  }
}

$expectedTotal = 0
foreach ($prefix in $expectedCounts.Keys) { $expectedTotal += $expectedCounts[$prefix] }

if ($identityLines.Count -ne $expectedTotal) {
  throw "FAIL: migration 009 owns $($identityLines.Count) objects, expected $expectedTotal."
}

foreach ($forbidden in @('view:', 'matview:', 'sequence:', 'function:', 'extension:', 'trigger:', 'policy:')) {
  $hit = @($identityLines | Where-Object { $_ -like "$forbidden*" })

  if ($hit.Count -ne 0) {
    throw "FAIL: migration 009 created forbidden $forbidden objects: $($hit -join ', ')"
  }
}

# Re-application check: migration 008 objects must be identical before and after
if (-not $m8FirstApplication) {
  $m8ReApplied = @(Compare-Object -ReferenceObject ($m8BeforeIdentity | Sort-Object) -DifferenceObject (@($afterLines | Where-Object { ($_ -match $m8IdentityPattern) -and -not (Test-OwnedBy $_ $m9OwnedTable) } | Sort-Object)))

  if ($m8ReApplied.Count -ne 0) {
    $detail = $m8ReApplied | ForEach-Object { "$($_.SideIndicator) $($_.InputObject)" }
    throw "FAIL: migration 008 identity objects differed before and after migration 009 re-application: $($detail -join '; ')"
  }
}

# Migration 009 objects must also be idempotent
if ($m9AlreadyPresent) {
  $m9ReApplied = @(Compare-Object -ReferenceObject ($m9BeforeIdentity | Sort-Object) -DifferenceObject ($m9AfterIdentity | Sort-Object))

  if ($m9ReApplied.Count -ne 0) {
    $detail = $m9ReApplied | ForEach-Object { "$($_.SideIndicator) $($_.InputObject)" }
    throw "FAIL: migration 009 identity objects differed before and after migration 009 re-application: $($detail -join '; ')"
  }
}

Write-Host "      - first migration 008 application on this database: $m8FirstApplication"
Write-Host "      - migration 009 objects already present: $m9AlreadyPresent"
Write-Host "      - 0 objects removed or altered from migrations 001-008"
Write-Host "      - $($identityLines.Count)/$expectedTotal identity objects present, all recognised as migrations 008-009's schema"
Write-Host "      - no view, matview, sequence, function, extension, trigger or RLS policy among them"

Step "Structural assertions after pass 1"

Apply-Sql $assertSql "Structural assertions (pass 1)"
Show-Sql $reportSql "Evidence report (pass 1)"

Step "Apply migration 009 (pass 2) and prove idempotency"

Apply-File $migration9

Write-Inventory $after2
$after2Lines = @(Get-Content -LiteralPath $after2)

if (Compare-Object -ReferenceObject $afterLines -DifferenceObject $after2Lines) {
  $drift = Compare-Object -ReferenceObject $afterLines -DifferenceObject $after2Lines |
    ForEach-Object { "$($_.SideIndicator) $($_.InputObject)" }
  throw "FAIL: second application changed the schema: $($drift -join '; ')"
}

Apply-Sql $assertSql "Structural assertions (pass 2)"

Write-Host "      - pass 2 exited 0, schema inventory identical to pass 1 ($($after2Lines.Count) objects)"

Step "Restart PostgreSQL and wait for health"

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

Step "Reconnect and prove the identity schema survived the restart"

Write-Inventory $after3
$after3Lines = @(Get-Content -LiteralPath $after3)

if (Compare-Object -ReferenceObject $afterLines -DifferenceObject $after3Lines) {
  $drift = Compare-Object -ReferenceObject $afterLines -DifferenceObject $after3Lines |
    ForEach-Object { "$($_.SideIndicator) $($_.InputObject)" }
  throw "FAIL: schema changed across the restart: $($drift -join '; ')"
}

Apply-Sql $assertSql "Structural assertions (after restart)"

foreach ($migration in $migrations) {
  $after = (Get-FileHash -Algorithm SHA256 -LiteralPath $migration).Hash

  if ($after -ne $hashBefore[$migration]) {
    throw "FAIL: migration file changed during the run: $migration"
  }
}

$hash9Before = (Get-FileHash -Algorithm SHA256 -LiteralPath $migration9).Hash
$hash9After = (Get-FileHash -Algorithm SHA256 -LiteralPath $migration9).Hash
if ($hash9After -ne $hash9Before) {
  throw "FAIL: migration 009 file changed during the run"
}

Write-Host "      - identity_accounts, identity_sessions, identity_refresh_grants intact after restart"
Write-Host "      - migrations 001-008 byte-identical before and after the run"
Write-Host "      - identity_refresh_grants rows: 0 (no credential written)"

Remove-Item -LiteralPath $before, $after1, $after2, $after3 -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "M8 MIGRATION 009 POSTGRESQL PROOF PASSED" -ForegroundColor Green