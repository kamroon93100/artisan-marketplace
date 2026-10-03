$ErrorActionPreference = "Stop"

# Real-PostgreSQL proof for migration 008 - identity_accounts and
# identity_sessions.
#
# It is kept out of `scripts/verify.ps1` on purpose: that script is the
# service-free fast path, and this proof needs a running database plus a
# restart. Run it when the local stack is up.
#
# The connection string is read from the Hyperdrive binding in
# wrangler.jsonc rather than duplicated here, so the local database is
# configured in exactly one place - exactly as verify-m3 through
# verify-m6 do.
#
# Scope guard: this proof refuses to run against anything other than the
# repository's own project database - the Hyperdrive localConnectionString
# on port 55432. The native PostgreSQL listening on 5432 is a different
# instance on this machine and is never connected to, read, or written.
# The guard is an explicit port/database assertion, not an assumption.
#
# What this script proves, in order:
#   1. the target really is the project database on 55432;
#   2. migrations 001-007 establish the existing local schema;
#   3. migration 008 is applied, and the two identity tables are proven to
#      carry exactly the expected columns, constraints, foreign key and
#      indexes;
#   4. an object-by-object schema inventory proves two things at once:
#      every object migrations 001-007 own is byte-identical before and
#      after, and the identity object set is exactly the 34 objects 008
#      specifies - so no view, function, extension, trigger, RLS policy,
#      throttle/lockout/audit table was created, and no 001-007 object was
#      touched;
#   5. a second application of 008 is a no-op, leaving an identical
#      inventory;
#   6. after a PostgreSQL restart both tables still exist with the same
#      structure - the runtime-schema proof this repository's earlier
#      milestone runners also require;
#   7. no rows were written, so no account or session credential exists
#      in the database as a result of running this proof.
#
# The identity set is asserted as an absolute set rather than only as a
# before/after delta, so the runner is re-runnable the way verify-m3
# through verify-m6 are: a repeat run still has to reproduce the identical
# 34 objects. On a database where 008 has not been applied yet, the same
# assertions additionally prove that this run created them, and the
# script reports which case it ran in.
#
# Nothing here inserts an account, a session, a password hash, or a token
# digest.

$root = Split-Path -Parent $PSScriptRoot
$wranglerConfig = Join-Path $root "apps\api\wrangler.jsonc"
$migrations = @(
  (Join-Path $root "infra\migrations\001_catalog\migration.sql"),
  (Join-Path $root "infra\migrations\002_media\migration.sql"),
  (Join-Path $root "infra\migrations\003_catalog_idempotency.sql"),
  (Join-Path $root "infra\migrations\004_media_upload_verification.sql"),
  (Join-Path $root "infra\migrations\005_catalog_versions.sql"),
  (Join-Path $root "infra\migrations\006_ai_jobs_and_proposals.sql"),
  (Join-Path $root "infra\migrations\007_inquiries_and_published_search.sql")
)
$migration8 = Join-Path $root "infra\migrations\008_identity_accounts_and_sessions.sql"

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

# Run SQL through the project container. Re-runnable migrations
# legitimately emit NOTICEs on stderr ("already exists, skipping"), and
# $ErrorActionPreference = "Stop" would otherwise abort on a notice rather
# than on a real failure, so the preference is relaxed around the call
# while $LASTEXITCODE still carries the true exit status. Output is
# captured rather than discarded so that a failure reports psql's actual
# diagnostic instead of only an exit code.
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

# Apply a migration file.
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

# Same call, but the result is meant for the record rather than for a
# pass/fail check, so it is printed as-is.
function Show-Sql([string] $sql, [string] $what) {
  Write-Host ((Invoke-Psql $sql $what).Trim())
}

# Write the full public-schema object inventory to $path. Comparing two of
# these is what turns "no forbidden objects" from an assertion into a
# proof: a removal or a modification of anything migration 001-007 owns
# shows up as a missing line, and any object 008 should not have created
# shows up as an unrecognised added line.
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

# Structural proof. Every check raises, and ON_ERROR_STOP turns a raise
# into a non-zero exit, so a single silent mismatch fails the run.
$assertSql = @'
do $m8$
declare
  v_actual text;
  v_count  integer;
  v_row    record;
begin
  if to_regclass('public.identity_accounts') is null then
    raise exception 'FAIL: identity_accounts does not exist';
  end if;
  if to_regclass('public.identity_sessions') is null then
    raise exception 'FAIL: identity_sessions does not exist';
  end if;

  select count(*) into v_count
    from information_schema.columns
   where table_schema = 'public' and table_name = 'identity_accounts';
  if v_count <> 7 then
    raise exception 'FAIL: identity_accounts has % columns (expected 7)', v_count;
  end if;

  select count(*) into v_count
    from information_schema.columns
   where table_schema = 'public' and table_name = 'identity_sessions';
  if v_count <> 10 then
    raise exception 'FAIL: identity_sessions has % columns (expected 10)', v_count;
  end if;

  for v_row in
    select * from (values
      ('identity_accounts', 'id',                            'uuid',                 'NO'),
      ('identity_accounts', 'username',                      'text',                 'NO'),
      ('identity_accounts', 'username_normalized',           'text',                 'NO'),
      ('identity_accounts', 'password_hash',                 'text',                 'NO'),
      ('identity_accounts', 'roles',                         'ARRAY',                'NO'),
      ('identity_accounts', 'created_at',                    'timestamp with time zone', 'NO'),
      ('identity_accounts', 'updated_at',                    'timestamp with time zone', 'NO'),
      ('identity_sessions', 'session_id',                    'uuid',                 'NO'),
      ('identity_sessions', 'actor_id',                      'uuid',                 'NO'),
      ('identity_sessions', 'access_token_hash',             'text',                 'NO'),
      ('identity_sessions', 'access_expires_at',             'timestamp with time zone', 'NO'),
      ('identity_sessions', 'refresh_token_hash',            'text',                 'NO'),
      ('identity_sessions', 'previous_refresh_token_hash',   'text',                 'YES'),
      ('identity_sessions', 'refresh_expires_at',            'timestamp with time zone', 'NO'),
      ('identity_sessions', 'refresh_revoked_at',            'timestamp with time zone', 'YES'),
      ('identity_sessions', 'revoked_at',                    'timestamp with time zone', 'YES'),
      ('identity_sessions', 'established_at',                'timestamp with time zone', 'NO')
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

  -- Only `roles` may carry a default, and that default must express the
  -- server-side BUYER assignment recorded in Q3.3.
  select string_agg(column_name, ',' order by column_name)
    into v_actual
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'identity_accounts'
     and column_default is not null;
  if v_actual is distinct from 'roles' then
    raise exception 'FAIL: defaulted identity_accounts columns are % (expected roles only)',
      coalesce(v_actual, '(none)');
  end if;

  select column_default into v_actual
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'identity_accounts'
     and column_name = 'roles';
  if v_actual is null or v_actual not like '%BUYER%' then
    raise exception 'FAIL: identity_accounts.roles default does not express BUYER (found %)',
      coalesce(v_actual, '(none)');
  end if;

  select count(*) into v_count
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'identity_sessions'
     and column_default is not null;
  if v_count <> 0 then
    raise exception 'FAIL: identity_sessions has % defaulted columns (expected 0)', v_count;
  end if;

  -- Primary keys.
  select string_agg(a.attname::text, ',' order by a.attnum) into v_actual
    from pg_constraint k
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
   where k.conrelid = 'identity_accounts'::regclass and k.contype = 'p';
  if v_actual is distinct from 'id' then
    raise exception 'FAIL: identity_accounts primary key is % (expected id)', coalesce(v_actual, '(none)');
  end if;

  select string_agg(a.attname::text, ',' order by a.attnum) into v_actual
    from pg_constraint k
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
   where k.conrelid = 'identity_sessions'::regclass and k.contype = 'p';
  if v_actual is distinct from 'session_id' then
    raise exception 'FAIL: identity_sessions primary key is % (expected session_id)', coalesce(v_actual, '(none)');
  end if;

  -- Exactly one foreign key, actor_id -> identity_accounts(id), ON DELETE
  -- RESTRICT (confdeltype 'r'), ON UPDATE NO ACTION (confupdtype 'a').
  select count(*) into v_count
    from pg_constraint k
   where k.conrelid = 'identity_sessions'::regclass and k.contype = 'f';
  if v_count <> 1 then
    raise exception 'FAIL: identity_sessions has % foreign keys (expected 1)', v_count;
  end if;

  select format('%s|%s|%s|%s', a.attname, k.confrelid::regclass, k.confdeltype::text, k.confupdtype::text)
    into v_actual
    from pg_constraint k
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
   where k.conrelid = 'identity_sessions'::regclass and k.contype = 'f';
  if v_actual is distinct from 'actor_id|identity_accounts|r|a' then
    raise exception 'FAIL: actor_id foreign key is % (expected actor_id->identity_accounts delete=restrict update=no action)',
      coalesce(v_actual, '(none)');
  end if;

  -- Check constraints: exactly five, all on identity_accounts.
  select string_agg(conname::text, ',' order by (conname::text) COLLATE "C") into v_actual
    from pg_constraint
   where conrelid = 'identity_accounts'::regclass and contype = 'c';
  if v_actual is distinct from
     'identity_accounts_password_hash_check,identity_accounts_roles_check,identity_accounts_username_length_check,identity_accounts_username_normalized_format_check,identity_accounts_username_normalized_length_check' then
    raise exception 'FAIL: identity_accounts check constraints are %', coalesce(v_actual, '(none)');
  end if;

  if exists (select 1 from pg_constraint where conrelid = 'identity_sessions'::regclass and contype = 'c') then
    raise exception 'FAIL: identity_sessions must not declare check constraints';
  end if;

  -- Semantics of the two security-bearing checks.
  select pg_get_constraintdef(oid) into v_actual
    from pg_constraint where conname = 'identity_accounts_username_normalized_format_check';
  if v_actual is null or v_actual not like '%[a-z0-9][a-z0-9_.-]{2,29}%' then
    raise exception 'FAIL: username_normalized format check does not carry the Q5.2 pattern (found %)',
      coalesce(v_actual, '(none)');
  end if;

  select pg_get_constraintdef(oid) into v_actual
    from pg_constraint where conname = 'identity_accounts_password_hash_check';
  if v_actual is null or v_actual not like '%$argon2id$%' then
    raise exception 'FAIL: password_hash check does not require the $argon2id$ tag (found %)',
      coalesce(v_actual, '(none)');
  end if;

  select pg_get_constraintdef(oid) into v_actual
    from pg_constraint where conname = 'identity_accounts_roles_check';
  if v_actual is null or v_actual not like '%BUYER%' or v_actual not like '%ARTISAN%' then
    raise exception 'FAIL: roles check does not restrict values to BUYER/ARTISAN (found %)',
      coalesce(v_actual, '(none)');
  end if;

  -- Index inventory: exactly the two expected on accounts, six on
  -- sessions (primary keys included). Ordering is forced to the C
  -- collation so the expected strings below cannot drift with the
  -- database locale.
  select string_agg(indexrelid::regclass::text, ',' order by (indexrelid::regclass::text) COLLATE "C")
    into v_actual
    from pg_index where indrelid = 'identity_accounts'::regclass;
  if v_actual is distinct from 'identity_accounts_pkey,identity_accounts_username_normalized_idx' then
    raise exception 'FAIL: identity_accounts indexes are %', coalesce(v_actual, '(none)');
  end if;

  select string_agg(indexrelid::regclass::text, ',' order by (indexrelid::regclass::text) COLLATE "C")
    into v_actual
    from pg_index where indrelid = 'identity_sessions'::regclass;
  if v_actual is distinct from
     'identity_sessions_access_token_hash_idx,identity_sessions_actor_id_idx,identity_sessions_pkey,identity_sessions_previous_refresh_token_hash_idx,identity_sessions_refresh_sweep_idx,identity_sessions_refresh_token_hash_idx' then
    raise exception 'FAIL: identity_sessions indexes are %', coalesce(v_actual, '(none)');
  end if;

  -- Per-index uniqueness, column list, and the partial sweep predicate.
  for v_row in
    select * from (values
      ('identity_accounts_username_normalized_idx',      'username_normalized',         true,  false, null),
      ('identity_sessions_access_token_hash_idx',        'access_token_hash',           true,  false, null),
      ('identity_sessions_refresh_token_hash_idx',       'refresh_token_hash',          true,  false, null),
      ('identity_sessions_previous_refresh_token_hash_idx', 'previous_refresh_token_hash', true, false, null),
      ('identity_sessions_actor_id_idx',                 'actor_id',                    false, false, null),
      ('identity_sessions_refresh_sweep_idx',            'refresh_expires_at',          false, false, 'revoked_at IS NULL AND refresh_revoked_at IS NULL')
    ) as e(idx, cols, uniq, nd, pred)
  loop
    -- Parentheses and run spacing that pg_get_expr prints around an
    -- index predicate are rendering detail, not schema, so both sides
    -- are normalised before comparing; the predicate's meaning is what
    -- is being proven.
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

  -- ---------------------------------------------------------------------------
  -- Forbidden state for migration 008.
  -- ---------------------------------------------------------------------------

  if exists (
    select 1 from pg_class cl
     where cl.relnamespace = 'public'::regnamespace
       and cl.relkind in ('r','p','v','m','f')
       and cl.relname like 'identity\_%'
       and cl.relname not in ('identity_accounts', 'identity_sessions')
  ) then
    raise exception 'FAIL: unexpected identity_* relation exists beyond the two tables';
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
     where oid in (to_regclass('public.identity_accounts'), to_regclass('public.identity_sessions'))
       and (relrowsecurity or relforcerowsecurity)
  ) then
    raise exception 'FAIL: row-level security is enabled on an identity table (ADR-007 is deferred)';
  end if;

  if exists (
    select 1 from pg_trigger
     where tgrelid in (to_regclass('public.identity_accounts'), to_regclass('public.identity_sessions'))
       and not tgisinternal
  ) then
    raise exception 'FAIL: trigger exists on an identity table';
  end if;

  if exists (
    select 1 from pg_policies
     where tablename in ('identity_accounts', 'identity_sessions')
  ) then
    raise exception 'FAIL: RLS policy exists on an identity table';
  end if;

  -- No credential row may exist: this proof never inserts one, and a
  -- leftover row would mean a previous run wrote a real account/session.
  select count(*) into v_count from identity_accounts;
  if v_count <> 0 then
    raise exception 'FAIL: identity_accounts contains % rows (expected 0)', v_count;
  end if;

  select count(*) into v_count from identity_sessions;
  if v_count <> 0 then
    raise exception 'FAIL: identity_sessions contains % rows (expected 0)', v_count;
  end if;

  raise notice 'M8 migration 008 structural assertions passed';
end
$m8$;
'@

# Evidence report: printed after the assertions so a passing run leaves
# the actual structure on the record, not just a pass/fail bit.
$reportSql = @'
\pset border 2
select table_name, column_name, data_type, is_nullable, coalesce(column_default, '-') as default_value
  from information_schema.columns
 where table_schema = 'public' and table_name in ('identity_accounts', 'identity_sessions')
 order by table_name, ordinal_position;

select k.conrelid::regclass as table_name,
       k.conname as constraint_name,
       k.contype as type,
       pg_get_constraintdef(k.oid) as definition
  from pg_constraint k
 where k.connamespace = 'public'::regnamespace
   and k.conrelid::regclass::text in ('identity_accounts', 'identity_sessions')
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
 where i.indrelid in (to_regclass('public.identity_accounts'), to_regclass('public.identity_sessions'))
 order by 1, 2;

select (select count(*) from identity_accounts) as identity_accounts_rows,
       (select count(*) from identity_sessions) as identity_sessions_rows;
'@

# ---------------------------------------------------------------------------
# Phase 1 - environment
# ---------------------------------------------------------------------------

foreach ($migration in $migrations) {
  if (-not (Test-Path $migration)) { throw "Migration not found: $migration" }
}
if (-not (Test-Path $migration8)) { throw "Migration not found: $migration8" }
if (-not (Test-Path $wranglerConfig)) { throw "Wrangler config not found: $wranglerConfig" }

# Whole-line `//` comments only - a naive `//` strip would corrupt the
# `postgresql://` scheme inside the connection string.
$config = (Get-Content -LiteralPath $wranglerConfig) |
  Where-Object { $_.Trim() -notlike "//*" } |
  Out-String |
  ConvertFrom-Json

$localConnectionString = $config.hyperdrive[0].localConnectionString

if (-not $localConnectionString) {
  throw "No Hyperdrive localConnectionString found in $wranglerConfig"
}

$connection = [System.Uri]$localConnectionString
$database = [System.Uri]::UnescapeDataString($connection.AbsolutePath.TrimStart("/"))
$user = [System.Uri]::UnescapeDataString(($connection.UserInfo -split ":")[0])
$targetHost = $connection.Host
$port = $connection.Port

# The scope guard. Anything other than the repository's own project
# database is refused rather than quietly used.
if ($port -ne $expectedPort) {
  throw "REFUSED: Hyperdrive localConnectionString targets port $port; the project PostgreSQL is on $expectedPort."
}
if ($database -ne $expectedDatabase) {
  throw "REFUSED: Hyperdrive localConnectionString targets database '$database'; the project database is '$expectedDatabase'."
}
if ($targetHost -ne $expectedHost) {
  throw "REFUSED: Hyperdrive localConnectionString targets host '$targetHost'; expected $expectedHost."
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
Write-Host "=== M8 MIGRATION 008: REAL POSTGRESQL PROOF ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Target (read from apps/api/wrangler.jsonc Hyperdrive localConnectionString):"
Write-Host "  host=$targetHost port=$port database=$database user=$user"
Write-Host "  container=$container"
Write-Host "  published=$($published -join ', ')"
Write-Host "  native PostgreSQL on 5432 is a different instance and is NOT contacted."
Write-Host ""

$psqlHost = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
$env:PGPASSWORD = ([System.Uri]$localConnectionString).UserInfo.Split(':')[1]

Step "Prove the 55432 TCP path reaches the project database"

if (Test-Path -LiteralPath $psqlHost) {
  # Host-side proof: this query travels over TCP to ${expectedHost}:$expectedPort,
  # so the row it returns is the database the application will use. The
  # PostgreSQL 18 binary here is only the client; the server it talks to is
  # the project container.
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

Step "Baseline: hash migrations 001-007 before any work"

$hashBefore = @{}
foreach ($migration in $migrations) {
  $hashBefore[$migration] = (Get-FileHash -Algorithm SHA256 -LiteralPath $migration).Hash
}

Step "Apply migrations 001-007 to establish the existing local schema"

foreach ($migration in $migrations) {
  Write-Host "      - $(Split-Path -Leaf $migration)"
  Apply-File $migration
}

Step "Snapshot the schema before migration 008"

$tmp = [System.IO.Path]::GetTempPath()
$before = Join-Path $tmp "m8-schema-before.txt"
$after1 = Join-Path $tmp "m8-schema-after-pass1.txt"
$after2 = Join-Path $tmp "m8-schema-after-pass2.txt"
$after3 = Join-Path $tmp "m8-schema-after-restart.txt"

Write-Inventory $before
$beforeLines = @(Get-Content -LiteralPath $before)

# Everything migration 008 owns contains its table name, so the inventory
# splits cleanly into "owned by migrations 001-007" and "owned by 008".
$identityPattern = 'identity_(accounts|sessions)'
$beforeIdentity = @($beforeLines | Where-Object { $_ -match $identityPattern })
$firstApplication = ($beforeIdentity.Count -eq 0)

Write-Host "      - $($beforeLines.Count) public-schema objects recorded"
Write-Host "      - identity objects already present: $($beforeIdentity.Count)"

Step "Apply migration 008 (pass 1)"

Apply-File $migration8

Step "Object inventory proof after pass 1"

Write-Inventory $after1
$afterLines = @(Get-Content -LiteralPath $after1)

# Invariant 1: everything migrations 001-007 own is byte-identical before
# and after - nothing removed, nothing altered, and nothing created
# outside the two identity tables. This is what makes "001-007 unchanged"
# and "no forbidden object" checkable rather than merely asserted.
$beforeNonIdentity = @($beforeLines | Where-Object { $_ -notmatch $identityPattern })
$afterNonIdentity = @($afterLines | Where-Object { $_ -notmatch $identityPattern })

$drift = @(Compare-Object -ReferenceObject $beforeNonIdentity -DifferenceObject $afterNonIdentity)

if ($drift.Count -ne 0) {
  $detail = $drift | ForEach-Object { "$($_.SideIndicator) $($_.InputObject)" }
  throw "FAIL: migration 008 changed objects owned by migrations 001-007: $($detail -join '; ')"
}

# Invariant 2: the identity object set is exactly what migration 008
# specifies - 34 objects, no more and no less. Stating it as an absolute
# set (rather than only as a before/after delta) is what keeps this runner
# re-runnable the way verify-m3 through verify-m6 are: a second run of the
# whole script still has to reproduce the identical set.
$identityLines = @($afterLines | Where-Object { $_ -match $identityPattern })

$allowedPattern = '^(table:identity_accounts|table:identity_sessions|key:identity_|check:identity_accounts:|fk:identity_sessions:|index:identity_|rls:identity_|grant:identity_)'

$unexpected = @($identityLines | Where-Object { $_ -notmatch $allowedPattern })

if ($unexpected.Count -ne 0) {
  throw "FAIL: migration 008 created forbidden objects: $($unexpected -join ', ')"
}

$expectedCounts = @{
  'table'  = 2
  'key'    = 2
  'check'  = 5
  'fk'     = 1
  'index'  = 8
  'rls'    = 2
  'grant'  = 14
}

foreach ($prefix in $expectedCounts.Keys) {
  $count = @($identityLines | Where-Object { $_ -like "$prefix`:*" }).Count

  if ($count -ne $expectedCounts[$prefix]) {
    throw "FAIL: migration 008 owns $count '$prefix' objects, expected $($expectedCounts[$prefix])."
  }
}

$expectedTotal = 0
foreach ($prefix in $expectedCounts.Keys) { $expectedTotal += $expectedCounts[$prefix] }

if ($identityLines.Count -ne $expectedTotal) {
  throw "FAIL: migration 008 owns $($identityLines.Count) objects, expected $expectedTotal."
}

foreach ($forbidden in @('view:', 'matview:', 'sequence:', 'function:', 'extension:', 'trigger:', 'policy:')) {
  $hit = @($identityLines | Where-Object { $_ -like "$forbidden*" })

  if ($hit.Count -ne 0) {
    throw "FAIL: migration 008 created forbidden $forbidden objects: $($hit -join ', ')"
  }
}

# When identity objects already existed, they must already have matched
# this exact set, so a re-application cannot have drifted them.
if (-not $firstApplication) {
  $reApplied = @(Compare-Object -ReferenceObject ($beforeIdentity | Sort-Object) -DifferenceObject ($identityLines | Sort-Object))

  if ($reApplied.Count -ne 0) {
    $detail = $reApplied | ForEach-Object { "$($_.SideIndicator) $($_.InputObject)" }
    throw "FAIL: identity objects differed before and after this application: $($detail -join '; ')"
  }
}

Write-Host "      - first application on this database: $firstApplication"
Write-Host "      - 0 objects removed or altered from migrations 001-007"
Write-Host "      - $($identityLines.Count)/$expectedTotal identity objects present, all recognised as migration 008's schema"
Write-Host "      - no view, matview, sequence, function, extension, trigger or RLS policy among them"

Step "Structural assertions after pass 1"

Apply-Sql $assertSql "Structural assertions (pass 1)"
Show-Sql $reportSql "Evidence report (pass 1)"

Step "Apply migration 008 (pass 2) and prove idempotency"

Apply-File $migration8

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

# Fail the run if this proof modified migration 001-007 files.
foreach ($migration in $migrations) {
  $after = (Get-FileHash -Algorithm SHA256 -LiteralPath $migration).Hash

  if ($after -ne $hashBefore[$migration]) {
    throw "FAIL: migration file changed during the run: $migration"
  }
}

Write-Host "      - identity_accounts and identity_sessions intact after restart"
Write-Host "      - migrations 001-007 byte-identical before and after the run"
Write-Host "      - identity_accounts rows: 0, identity_sessions rows: 0 (no credential written)"

Remove-Item -LiteralPath $before, $after1, $after2, $after3 -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "M8 MIGRATION 008 POSTGRESQL PROOF PASSED" -ForegroundColor Green
