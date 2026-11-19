# PostgreSQL application role and RLS activation

Row-level security is defined by
`infra/migrations/010_row_level_security.sql`, but a policy only has an
effect for a connection whose role is subject to it. The local development
database currently connects as `artisan_marketplace`, which owns the tables
and has `SUPERUSER` and `BYPASSRLS`. Policies are inert for that role. That
is a deliberate transitional state, not the enforcement target.

The API sets `app.actor_id` inside each transaction with transaction-local
scope, after `BEGIN`. The setting is therefore discarded on `COMMIT` or
`ROLLBACK` and cannot leak across Hyperdrive's transaction-mode pooling. The
application login must still be non-owner and `NOBYPASSRLS`; the setting alone
does not activate the policies.

## Roles

| Role | Attributes | Purpose |
| --- | --- | --- |
| `artisan_marketplace` | table owner; local dev is `SUPERUSER`/`BYPASSRLS` | migrations, trusted maintenance, local development |
| `artisan_marketplace_app` | `NOLOGIN`, `NOSUPERUSER`, `NOBYPASSRLS` | privilege group created by `app-role.sql`; no credential |
| deployment login role | `LOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`, not a table owner | the API's connection identity; member of `artisan_marketplace_app` |

The NOLOGIN group exists so grants can be reviewed and tested without
creating a password in this repository. The login role is environment
configuration and must be created from a secret manager, never committed.

## Local development connection

Local Wrangler development reads the Hyperdrive connection string from
`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`. Set it for the
current PowerShell session from your approved local secret source:

```powershell
$env:CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE = '<connection string from your approved local secret source>'
```

Do not commit the value or paste it into example files, logs, or checkpoints.
The tracked Wrangler configuration does not embed a `localConnectionString`.

Remove it when finished:

```powershell
Remove-Item Env:CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE
```

## Activation steps

1. Apply `infra/migrations/010_row_level_security.sql` as the table owner.
2. Apply `infra/database/app-role.sql` as the table owner.
3. Create the deployment login role from a secret manager. Example shape
   only; the password is supplied out of band:

   ```sql
   create role artisan_marketplace_api
     login
     nosuperuser
     nobypassrls
     nocreatedb
     nocreaterole
     password '<from secret manager>';

   grant artisan_marketplace_app
     to artisan_marketplace_api;
   ```

4. Point the application's PostgreSQL connection string (the Hyperdrive
   binding in production) at `artisan_marketplace_api`.
5. Restart the Worker so no connection created under the old identity is
   reused.
6. Verify the connection identity and attributes:

   ```sql
   select current_user,
          r.rolsuper,
          r.rolbypassrls
   from pg_roles r
   where r.rolname = current_user;
   ```

   `rolsuper` and `rolbypassrls` must both be false, and `current_user` must
   not be the table owner.

7. Run `scripts/verify-rls-postgres.ps1`. It creates a throwaway database,
   applies migrations 001-010 and the app-role grants, verifies the policies
   under a real non-owner login role, and drops the throwaway database and
   role afterwards. It needs a role that can create databases and roles, so
   run it with an owner/maintenance connection: set `RLS_POSTGRES_URL` to that
   connection, or run it before switching the local Hyperdrive connection
   string to the non-owner login.

## What remains outside RLS

- `identity_accounts`, `identity_sessions`, and `identity_refresh_grants`.
  Session verification happens before an actor identity exists. Protecting
  these tables needs a separate auth role or a security-definer boundary.
- Media reads by buyers. A published product may still have private media
  (for example a voice note). A buyer media policy needs a per-attachment
  visibility model first.
- Artisan inquiry inbox reads. Only the buyer-owned policy exists; statuses
  and the inbox belong to a later slice.
- Reviewer and service-role operations. There is no reviewer role and no
  separate AI service role in this slice. AI work runs under the actor's
  request and is owner-scoped; a background worker must not reuse the API
  login without an actor.

## Why `FORCE ROW LEVEL SECURITY` is not used

`FORCE` would subject the table owner to its own policies. That would make
migrations, backfills, and trusted maintenance fail or silently see nothing
unless a separate bypass role is introduced at the same time. The safer
ordering is: establish the policies, prove them under a non-owner login,
then introduce a service/owner boundary. Until then, the owner bypass is
explicit and documented rather than accidental.

## What RLS does not protect against

RLS is defense in depth against application query bugs. It is not a defense
against a compromised database credential: any holder of the application
login can set `app.actor_id` to any UUID, just as the application does. It is
also not a substitute for application authorization, input validation, or
least-privilege credential handling.
