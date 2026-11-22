import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

import { PostgresDatabase } from "../../apps/api/src/shared/persistence/postgres-database.ts";
import { CatalogService } from "../../apps/api/src/modules/catalog/application/catalog-service.ts";
import { PostgresCatalogRepository } from "../../apps/api/src/modules/catalog/infrastructure/postgres-catalog-repository.ts";
import { PostgresMediaRepository } from "../../apps/api/src/modules/media/infrastructure/postgres-media-repository.ts";
import { PostgresAiRepository } from "../../apps/api/src/modules/ai/infrastructure/postgres-ai-repository.ts";
import { PostgresInquiryRepository } from "../../apps/api/src/modules/inquiry/infrastructure/postgres-inquiry-repository.ts";

/**
 * Isolated PostgreSQL proof for the RLS slice.
 *
 * This test never reads or writes the project database's tables. It connects
 * as the configured owner only long enough to create a throwaway database,
 * applies migrations 001-011 and the app-role grants there, seeds two
 * artisans, and then proves the policies from a real non-owner, NOBYPASSRLS
 * login role. The throwaway database and roles are dropped in `finally`.
 *
 * It is deliberately outside `pnpm verify`: that gate is service-free. Run it
 * with `scripts/verify-rls-postgres.ps1`.
 */

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const MIGRATIONS = [
  "infra/migrations/001_catalog/migration.sql",
  "infra/migrations/002_media/migration.sql",
  "infra/migrations/003_catalog_idempotency.sql",
  "infra/migrations/004_media_upload_verification.sql",
  "infra/migrations/005_catalog_versions.sql",
  "infra/migrations/006_ai_jobs_and_proposals.sql",
  "infra/migrations/007_inquiries_and_published_search.sql",
  "infra/migrations/008_identity_accounts_and_sessions.sql",
  "infra/migrations/009_identity_refresh_grants.sql",
  "infra/migrations/010_row_level_security.sql",
  "infra/migrations/011_ai_job_outbox.sql",
] as const;

const RLS_TABLES = [
  "catalog_products",
  "catalog_versions",
  "media_attachments",
  "ai_jobs",
  "ai_proposals",
  "inquiries",
] as const;

const IDENTITY_TABLES = [
  "identity_accounts",
  "identity_sessions",
  "identity_refresh_grants",
] as const;

const EXPECTED_POLICIES = [
  "ai_jobs_owner_insert",
  "ai_jobs_owner_select",
  "ai_jobs_owner_update",
  "ai_proposals_owner_insert",
  "ai_proposals_owner_select",
  "ai_proposals_owner_update",
  "catalog_products_owner_insert",
  "catalog_products_owner_select",
  "catalog_products_owner_update",
  "catalog_versions_owner_insert",
  "catalog_versions_read",
  "inquiries_buyer_insert",
  "inquiries_buyer_select",
  "media_attachments_owner_insert",
  "media_attachments_owner_select",
  "media_attachments_owner_update",
].sort();

type SeedIds = {
  actorA: string;
  actorB: string;
  draftA: string;
  draftB: string;
  approvedA: string;
  publishedA: string;
  publishedB: string;
  archivedB: string;
  mediaA: string;
  mediaB: string;
  jobA: string;
  jobB: string;
  proposalA: string;
  proposalB: string;
  inquiryA: string;
  inquiryB: string;
};

function urlForDatabase(
  base: string,
  databaseName: string,
): string {
  const url = new URL(base);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function urlForLogin(
  base: string,
  databaseName: string,
  role: string,
  password: string,
): string {
  const url = new URL(
    urlForDatabase(base, databaseName),
  );
  url.username = role;
  url.password = password;
  return url.toString();
}

function step(message: string): void {
  console.log(`[rls] ${message}`);
}

async function countDatabase(
  database: {
    query<T>(
      sql: string,
      params?: readonly unknown[],
    ): Promise<readonly T[]>;
  },
  sql: string,
  params: readonly unknown[] = [],
): Promise<number> {
  const rows = await database.query<{ count: number }>(
    sql,
    params,
  );

  return rows[0]?.count ?? 0;
}

async function countClient(
  client: Client,
  sql: string,
  params: unknown[] = [],
): Promise<number> {
  const result = await client.query<{ count: number }>(
    sql,
    params,
  );

  return result.rows[0]?.count ?? 0;
}

async function expectRejected(
  operation: Promise<unknown>,
  pattern: RegExp,
  label: string,
): Promise<void> {
  try {
    await operation;
  } catch (error) {
    assert.match(
      error instanceof Error ? error.message : String(error),
      pattern,
      label,
    );
    return;
  }

  assert.fail(`${label}: operation unexpectedly succeeded`);
}

async function applyMigrations(
  client: Client,
): Promise<void> {
  for (const relative of MIGRATIONS) {
    const sql = readFileSync(
      join(repositoryRoot, relative),
      "utf8",
    ).replace(/^\uFEFF/, "");

    await client.query(sql);
  }
}

async function seedArtisans(
  client: Client,
  ids: SeedIds,
): Promise<void> {
  const now = new Date().toISOString();

  await client.query(
    `
      INSERT INTO public.catalog_products (
        id, owner_id, title, description, category, materials,
        state, published_version, idempotency_key, created_at, updated_at
      )
      VALUES
        ($1, $2, 'A draft', 'A draft description', 'textile', ARRAY['wool'], 'LOCAL_DRAFT', NULL, 'seed-draft-a', $9, $9),
        ($3, $4, 'B draft', 'B draft description', 'textile', ARRAY['wool'], 'LOCAL_DRAFT', NULL, 'seed-draft-b', $9, $9),
        ($5, $2, 'A approved', 'A approved description', 'textile', ARRAY['wool'], 'APPROVED', NULL, 'seed-approved-a', $9, $9),
        ($6, $2, 'A working edit', 'A working edit description', 'textile', ARRAY['wool'], 'PUBLISHED', 1, 'seed-published-a', $9, $9),
        ($7, $4, 'B working edit', 'B working edit description', 'textile', ARRAY['wool'], 'PUBLISHED', 2, 'seed-published-b', $9, $9),
        ($8, $4, 'B archived', 'B archived description', 'textile', ARRAY['wool'], 'ARCHIVED', 1, 'seed-archived-b', $9, $9)
    `,
    [
      ids.draftA,
      ids.actorA,
      ids.draftB,
      ids.actorB,
      ids.approvedA,
      ids.publishedA,
      ids.publishedB,
      ids.archivedB,
      now,
    ],
  );

  await client.query(
    `
      INSERT INTO public.catalog_versions (
        id, product_id, version_number, title, description, category,
        materials, published_at, published_by, idempotency_key
      )
      VALUES
        (gen_random_uuid(), $1, 1, 'A published v1', 'A published description v1', 'textile', ARRAY['wool'], $6, $2, 'seed-version-a1'),
        (gen_random_uuid(), $3, 1, 'B published v1', 'B published description v1', 'textile', ARRAY['wool'], $6, $4, 'seed-version-b1'),
        (gen_random_uuid(), $3, 2, 'B published v2', 'B published description v2', 'textile', ARRAY['wool'], $6, $4, 'seed-version-b2'),
        (gen_random_uuid(), $5, 1, 'B archived v1', 'B archived description v1', 'textile', ARRAY['wool'], $6, $4, 'seed-version-archived-b1')
    `,
    [
      ids.publishedA,
      ids.actorA,
      ids.publishedB,
      ids.actorB,
      ids.archivedB,
      now,
    ],
  );

  await client.query(
    `
      INSERT INTO public.media_attachments (
        id, product_id, owner_id, kind, object_key, content_type,
        size_bytes, state, idempotency_key, created_at, updated_at
      )
      VALUES
        ($1, $2, $3, 'IMAGE', 'seed/media-a', 'image/jpeg', 1024, 'VERIFIED', 'seed-media-a', $5, $5),
        ($4, $6, $7, 'IMAGE', 'seed/media-b', 'image/jpeg', 1024, 'VERIFIED', 'seed-media-b', $5, $5)
    `,
    [
      ids.mediaA,
      ids.draftA,
      ids.actorA,
      ids.mediaB,
      now,
      ids.draftB,
      ids.actorB,
    ],
  );

  const input = (productId: string) =>
    JSON.stringify({
      productId,
      capturedAt: now,
      product: {
        title: "seed",
        description: "seed",
        category: "textile",
        materials: ["wool"],
      },
      media: [],
      transcription: null,
    });

  await client.query(
    `
      INSERT INTO public.ai_jobs (
        id, product_id, owner_id, job_type, state, provider, model,
        model_version, prompt_version, schema_version, pipeline_version,
        input, input_hash, attempt_count, max_attempts, correlation_id,
        causation_id, idempotency_key, created_at, updated_at
      )
      VALUES
        ($1, $2, $3, 'CATALOG_FIELD_GENERATION', 'QUEUED', 'probe', 'probe-model', NULL, '1', '1', '1', $4::jsonb, 'hash-a', 0, 3, 'corr-a', NULL, 'seed-job-a', $6, $6),
        ($5, $7, $8, 'CATALOG_FIELD_GENERATION', 'QUEUED', 'probe', 'probe-model', NULL, '1', '1', '1', $9::jsonb, 'hash-b', 0, 3, 'corr-b', NULL, 'seed-job-b', $6, $6)
    `,
    [
      ids.jobA,
      ids.draftA,
      ids.actorA,
      input(ids.draftA),
      ids.jobB,
      now,
      ids.draftB,
      ids.actorB,
      input(ids.draftB),
    ],
  );

  await client.query(
    `
      INSERT INTO public.ai_proposals (
        id, job_id, product_id, attempt, field, value, source,
        source_type, provider, model, model_version, prompt_version,
        schema_version, pipeline_version, confidence, validation_status,
        validation_issues, risk_level, risk_reasons, created_at, updated_at
      )
      VALUES
        ($1, $2, $3, 1, 'title', $4::jsonb, 'AI_GENERATED', 'CATALOG_FIELD_GENERATION', 'probe', 'probe-model', NULL, '1', '1', '1', 0.9, 'VALID', ARRAY[]::text[], 'NONE', ARRAY[]::text[], $7, $7),
        ($5, $6, $8, 1, 'title', $9::jsonb, 'AI_GENERATED', 'CATALOG_FIELD_GENERATION', 'probe', 'probe-model', NULL, '1', '1', '1', 0.9, 'VALID', ARRAY[]::text[], 'NONE', ARRAY[]::text[], $7, $7)
    `,
    [
      ids.proposalA,
      ids.jobA,
      ids.draftA,
      JSON.stringify("A proposed"),
      ids.proposalB,
      ids.jobB,
      now,
      ids.draftB,
      JSON.stringify("B proposed"),
    ],
  );

  await client.query(
    `
      INSERT INTO public.inquiries (
        id, buyer_id, product_id, catalog_version, message, status,
        idempotency_key, created_at, updated_at
      )
      VALUES
        ($1, $2, $3, 2, 'Interested in B', 'NEW', 'seed-inquiry-a', $7, $7),
        ($4, $5, $6, 1, 'Interested in A', 'NEW', 'seed-inquiry-b', $7, $7)
    `,
    [
      ids.inquiryA,
      ids.actorA,
      ids.publishedB,
      ids.inquiryB,
      ids.actorB,
      ids.publishedA,
      now,
    ],
  );
}

async function main(): Promise<void> {
  const ownerConnectionString =
    process.env.RLS_POSTGRES_URL;

  if (!ownerConnectionString) {
    throw new Error(
      "RLS_POSTGRES_URL is required. Run scripts/verify-rls-postgres.ps1.",
    );
  }

  const ownerUrl = new URL(ownerConnectionString);

  if (
    ownerUrl.hostname !== "127.0.0.1" ||
    ownerUrl.port !== "55432" ||
    ownerUrl.pathname !== "/artisan_marketplace_dev"
  ) {
    throw new Error(
      "This proof only runs against the project database on 127.0.0.1:55432/artisan_marketplace_dev.",
    );
  }

  const token = randomUUID()
    .replace(/-/g, "")
    .slice(0, 12);
  const databaseName = `am_rls_probe_${token}`;
  const groupRole = "artisan_marketplace_app";
  const loginRole = `am_rls_login_${token}`;
  const loginPassword = randomUUID().replace(/-/g, "");

  const admin = new Client({
    connectionString: ownerConnectionString,
  });
  let ownerTest: Client | undefined;
  let databaseCreated = false;
  let loginRoleCreated = false;
  let groupRoleCreated = false;

  try {
    await admin.connect();

    const existingGroup = await admin.query<{
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolcanlogin: boolean;
    }>(
      "select rolsuper, rolbypassrls, rolcanlogin from pg_roles where rolname = $1",
      [groupRole],
    );

    groupRoleCreated = existingGroup.rows.length === 0;

    step("creating throwaway database");
    await admin.query(
      `create database "${databaseName}"`,
    );
    databaseCreated = true;

    ownerTest = new Client({
      connectionString: urlForDatabase(
        ownerConnectionString,
        databaseName,
      ),
    });
    await ownerTest.connect();

    step("applying migrations 001-011");
    await applyMigrations(ownerTest);

    step("applying least-privilege app grants");
    await ownerTest.query(
      readFileSync(
        join(
          repositoryRoot,
          "infra/database/app-role.sql",
        ),
        "utf8",
      ),
    );

    const groupAttributes = await admin.query<{
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolcanlogin: boolean;
    }>(
      "select rolsuper, rolbypassrls, rolcanlogin from pg_roles where rolname = $1",
      [groupRole],
    );

    assert.deepEqual(groupAttributes.rows[0], {
      rolsuper: false,
      rolbypassrls: false,
      rolcanlogin: false,
    });

    step("creating a real non-owner login role");
    await admin.query(
      `create role "${loginRole}" login password '${loginPassword}' nosuperuser nobypassrls nocreatedb nocreaterole`,
    );
    loginRoleCreated = true;
    await admin.query(
      `grant "${groupRole}" to "${loginRole}"`,
    );

    const loginAttributes = await admin.query<{
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolcanlogin: boolean;
    }>(
      "select rolsuper, rolbypassrls, rolcanlogin from pg_roles where rolname = $1",
      [loginRole],
    );

    assert.deepEqual(loginAttributes.rows[0], {
      rolsuper: false,
      rolbypassrls: false,
      rolcanlogin: true,
    });

    const ids: SeedIds = {
      actorA: randomUUID(),
      actorB: randomUUID(),
      draftA: randomUUID(),
      draftB: randomUUID(),
      approvedA: randomUUID(),
      publishedA: randomUUID(),
      publishedB: randomUUID(),
      archivedB: randomUUID(),
      mediaA: randomUUID(),
      mediaB: randomUUID(),
      jobA: randomUUID(),
      jobB: randomUUID(),
      proposalA: randomUUID(),
      proposalB: randomUUID(),
      inquiryA: randomUUID(),
      inquiryB: randomUUID(),
    };

    step("seeding two artisans as the owner");
    await seedArtisans(ownerTest, ids);

    step("asserting policy and RLS metadata");
    const policies = await ownerTest.query<{
      policyname: string;
    }>(
      `
        select policyname
        from pg_policies
        where schemaname = 'public'
          and tablename = any($1::text[])
        order by policyname
      `,
      [[...RLS_TABLES]],
    );

    assert.deepEqual(
      policies.rows.map((row) => row.policyname),
      EXPECTED_POLICIES,
    );

    const rlsFlags = await ownerTest.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `
        select c.relname, c.relrowsecurity, c.relforcerowsecurity
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = any($1::text[])
        order by c.relname
      `,
      [[...RLS_TABLES]],
    );

    assert.equal(rlsFlags.rows.length, RLS_TABLES.length);

    for (const row of rlsFlags.rows) {
      assert.equal(
        row.relrowsecurity,
        true,
        `${row.relname} must have RLS enabled`,
      );
      assert.equal(
        row.relforcerowsecurity,
        false,
        `${row.relname} must not FORCE RLS while the owner is the migration role`,
      );
    }

    const identityFlags = await ownerTest.query<{
      relname: string;
      relrowsecurity: boolean;
    }>(
      `
        select c.relname, c.relrowsecurity
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = any($1::text[])
        order by c.relname
      `,
      [[...IDENTITY_TABLES]],
    );

    assert.equal(
      identityFlags.rows.length,
      IDENTITY_TABLES.length,
    );

    for (const row of identityFlags.rows) {
      assert.equal(
        row.relrowsecurity,
        false,
        `${row.relname} is intentionally outside RLS in this slice`,
      );
    }

    const view = await ownerTest.query<{ count: number }>(
      `
        select count(*)::int as count
        from pg_views
        where schemaname = 'app'
          and viewname = 'published_catalog_products'
      `,
    );

    assert.equal(view.rows[0]?.count, 1);

    step("connecting as the non-owner app login");
    const appConnectionString = urlForLogin(
      ownerConnectionString,
      databaseName,
      loginRole,
      loginPassword,
    );
    const appDatabase = PostgresDatabase.forActor(
      appConnectionString,
      ids.actorA,
    );

    const identity = await appDatabase.query<{
      current_user: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(
      `
        select current_user, r.rolsuper, r.rolbypassrls
        from pg_roles r
        where r.rolname = current_user
      `,
    );

    assert.equal(identity[0]?.current_user, loginRole);
    assert.equal(identity[0]?.rolsuper, false);
    assert.equal(identity[0]?.rolbypassrls, false);

    const actorSetting = await appDatabase.query<{
      actor: string | null;
    }>(
      "select current_setting('app.actor_id', true) as actor",
    );

    assert.equal(actorSetting[0]?.actor, ids.actorA);

    step("proving cross-artisan reads are denied");

    const catalogRepository =
      new PostgresCatalogRepository(appDatabase);
    const catalogService = new CatalogService(
      catalogRepository,
    );
    const mediaRepository =
      new PostgresMediaRepository(appDatabase);
    const aiRepository = new PostgresAiRepository(
      appDatabase,
    );
    const inquiryRepository =
      new PostgresInquiryRepository(appDatabase);

    assert.notEqual(
      await catalogRepository.getById(ids.draftA),
      null,
      "an artisan must still see their own draft",
    );

    assert.equal(
      await catalogRepository.getById(ids.draftB),
      null,
      "another artisan's draft must be invisible",
    );

    assert.equal(
      await catalogRepository.getById(ids.publishedB),
      null,
      "a published product's working row must stay private",
    );

    assert.equal(
      await catalogRepository.getPublishedSnapshot(
        ids.publishedB,
      ) !== null,
      true,
      "the current published version is buyer-visible",
    );

    const publicVersions =
      await catalogRepository.listVersions(
        ids.publishedB,
      );

    assert.equal(publicVersions.length, 1);
    assert.equal(
      publicVersions[0]?.versionNumber,
      2,
      "only the current published version is buyer-visible",
    );

    const archivedVersions =
      await catalogRepository.listVersions(
        ids.archivedB,
      );

    assert.equal(
      archivedVersions.length,
      0,
      "an archived product has no buyer-visible version",
    );

    assert.equal(
      await mediaRepository.getById(ids.mediaB),
      null,
      "another artisan's media must be invisible",
    );

    assert.equal(
      await aiRepository.getJob(ids.jobB),
      null,
      "another artisan's AI job must be invisible",
    );

    assert.deepEqual(
      await aiRepository.listProposals(ids.jobB),
      [],
      "another artisan's AI proposals must be invisible",
    );

    const otherBuyerPage =
      await inquiryRepository.listOwnedByBuyer(
        ids.actorB,
        { limit: 20, offset: 0 },
      );

    assert.equal(otherBuyerPage.total, 0);
    assert.equal(otherBuyerPage.inquiries.length, 0);

    const ownBuyerPage =
      await inquiryRepository.listOwnedByBuyer(
        ids.actorA,
        { limit: 20, offset: 0 },
      );

    assert.equal(ownBuyerPage.total, 1);

    step("proving cross-artisan writes are denied");

    const hacked = await appDatabase.query<{
      id: string;
    }>(
      "update public.catalog_products set title = 'hacked' where id = $1 returning id",
      [ids.draftB],
    );

    assert.deepEqual(hacked, []);

    await expectRejected(
      appDatabase.query(
        `
          INSERT INTO public.catalog_products (
            id, owner_id, title, description, category, materials,
            state, published_version, idempotency_key, created_at, updated_at
          )
          VALUES (
            gen_random_uuid(), $1, 'forged', 'forged', 'textile',
            ARRAY['wool'], 'LOCAL_DRAFT', NULL, 'probe-forged-product',
            now(), now()
          )
        `,
        [ids.actorB],
      ),
      /row-level security/i,
      "inserting a product for another owner",
    );

    await expectRejected(
      appDatabase.query(
        "delete from public.catalog_products where id = $1",
        [ids.draftB],
      ),
      /permission denied/i,
      "deleting without a delete grant",
    );

    await expectRejected(
      mediaRepository.create({
        productId: ids.draftB,
        ownerId: ids.actorA,
        kind: "IMAGE",
        contentType: "image/jpeg",
        sizeBytes: 2048,
        idempotencyKey: "probe-cross-media",
      }),
      /row-level security/i,
      "attaching media to another artisan's product",
    );

    await expectRejected(
      aiRepository.createJob({
        productId: ids.draftB,
        ownerId: ids.actorA,
        jobType: "CATALOG_FIELD_GENERATION",
        provider: "probe",
        model: "probe-model",
        modelVersion: null,
        promptVersion: "1",
        schemaVersion: "1",
        pipelineVersion: "1",
        input: {
          productId: ids.draftB,
          capturedAt: new Date().toISOString(),
          product: {
            title: "seed",
            description: "seed",
            category: "textile",
            materials: ["wool"],
          },
          media: [],
          transcription: null,
        },
        inputHash: "probe-cross-hash",
        maxAttempts: 3,
        correlationId: "probe-cross-corr",
        causationId: null,
        idempotencyKey: "probe-cross-job",
      }),
      /row-level security/i,
      "creating an AI job for another artisan's product",
    );

    await expectRejected(
      inquiryRepository.create({
        buyerId: ids.actorB,
        productId: ids.publishedB,
        catalogVersion: 2,
        message: "forged buyer",
        idempotencyKey: "probe-cross-buyer",
      }),
      /row-level security/i,
      "creating an inquiry for another buyer",
    );

    await expectRejected(
      inquiryRepository.create({
        buyerId: ids.actorA,
        productId: ids.publishedB,
        catalogVersion: 1,
        message: "old version",
        idempotencyKey: "probe-old-version",
      }),
      /row-level security/i,
      "creating an inquiry against a superseded published version",
    );

    await expectRejected(
      aiRepository.recordDecision({
        id: ids.proposalB,
        expectedDecision: "PENDING",
        decision: "ACCEPTED",
        decidedBy: ids.actorA,
        appliedValue: "hacked",
      }),
      /not found/i,
      "deciding another artisan's proposal",
    );

    assert.equal(
      await mediaRepository.transitionState(
        ids.mediaB,
        "UPLOAD_AUTHORIZED",
      ),
      null,
      "another artisan's media must not be updatable",
    );

    await expectRejected(
      aiRepository.beginAttempt({
        id: ids.jobB,
        expectedState: "QUEUED",
        attemptCount: 1,
      }),
      /not found/i,
      "updating another artisan's AI job",
    );

    step("proving the trusted owner operations still work");

    const createdDraft =
      await catalogService.createDraft({
        ownerId: ids.actorA,
        title: "Probe draft",
        description: "Probe draft description",
        category: "textile",
        materials: ["wool"],
        idempotencyKey: "probe-draft-a",
      });

    assert.equal(createdDraft.created, true);
    assert.equal(createdDraft.product.ownerId, ids.actorA);
    assert.equal(
      createdDraft.product.state,
      "LOCAL_DRAFT",
    );

    const createdMedia = await mediaRepository.create({
      productId: ids.draftA,
      ownerId: ids.actorA,
      kind: "IMAGE",
      contentType: "image/jpeg",
      sizeBytes: 2048,
      idempotencyKey: "probe-media-a",
    });

    assert.equal(createdMedia.state, "REQUESTED");

    const authorizedMedia =
      await mediaRepository.transitionState(
        createdMedia.id,
        "UPLOAD_AUTHORIZED",
      );

    assert.equal(
      authorizedMedia?.state,
      "UPLOAD_AUTHORIZED",
    );

    const createdJob = await aiRepository.createJob({
      productId: ids.draftA,
      ownerId: ids.actorA,
      jobType: "CATALOG_FIELD_GENERATION",
      provider: "probe",
      model: "probe-model",
      modelVersion: null,
      promptVersion: "1",
      schemaVersion: "1",
      pipelineVersion: "1",
      input: {
        productId: ids.draftA,
        capturedAt: new Date().toISOString(),
        product: {
          title: "A draft",
          description: "A draft description",
          category: "textile",
          materials: ["wool"],
        },
        media: [],
        transcription: null,
      },
      inputHash: "probe-hash",
      maxAttempts: 3,
      correlationId: "probe-corr",
      causationId: null,
      idempotencyKey: "probe-job-a",
    });

    assert.equal(createdJob.created, true);

    const runningJob =
      await aiRepository.beginAttempt({
        id: createdJob.job.id,
        expectedState: "QUEUED",
        attemptCount: 1,
      });

    assert.equal(runningJob.state, "RUNNING");
    assert.equal(runningJob.attemptCount, 1);

    const savedProposals =
      await aiRepository.saveProposals({
        job: createdJob.job,
        attempt: 1,
        drafts: [
          {
            field: "title",
            value: "A proposed",
            confidence: 0.9,
            validationStatus: "VALID",
            validationIssues: [],
            riskLevel: "NONE",
            riskReasons: [],
          },
        ],
      });

    assert.equal(savedProposals.length, 1);

    const decided = await aiRepository.recordDecision({
      id: savedProposals[0]!.id,
      expectedDecision: "PENDING",
      decision: "ACCEPTED",
      decidedBy: ids.actorA,
      appliedValue: "A proposed",
    });

    assert.equal(decided.decision, "ACCEPTED");
    assert.equal(decided.decidedBy, ids.actorA);

    const createdInquiry =
      await inquiryRepository.create({
        buyerId: ids.actorA,
        productId: ids.publishedB,
        catalogVersion: 2,
        message: "Interested in B",
        idempotencyKey: "probe-inquiry-a",
      });

    assert.equal(createdInquiry.created, true);

    const published = await catalogService.publish(
      ids.approvedA,
      ids.actorA,
      "probe-publish-a",
    );

    assert.equal(published.created, true);
    assert.equal(published.product.state, "PUBLISHED");
    assert.equal(published.version.versionNumber, 1);
    assert.equal(
      published.version.publishedBy,
      ids.actorA,
    );

    const publishedPage =
      await catalogRepository.searchPublishedSnapshots({
        limit: 20,
        offset: 0,
      });

    assert.equal(publishedPage.total, 3);
    assert.deepEqual(
      publishedPage.items
        .map((item) => item.productId)
        .sort(),
      [ids.approvedA, ids.publishedA, ids.publishedB].sort(),
    );

    const searchedPage =
      await catalogRepository.searchPublishedSnapshots({
        search: "published v2",
        limit: 20,
        offset: 0,
      });

    assert.equal(searchedPage.total, 1);
    assert.equal(
      searchedPage.items[0]?.productId,
      ids.publishedB,
    );
    assert.equal(
      searchedPage.items[0]?.title,
      "B published v2",
      "discovery must read the published version, not the working draft",
    );

    step("proving a missing or invalid actor fails closed");

    const noActorDatabase = new PostgresDatabase(
      appConnectionString,
    );

    for (const table of [
      "catalog_products",
      "media_attachments",
      "ai_jobs",
      "ai_proposals",
      "inquiries",
    ]) {
      assert.equal(
        await countDatabase(
          noActorDatabase,
          `select count(*)::int as count from public.${table}`,
        ),
        0,
        `${table} must expose no tenant rows without an actor`,
      );
    }

    const invalidActorDatabase =
      PostgresDatabase.forActor(
        appConnectionString,
        "not-a-uuid",
      );

    assert.equal(
      await countDatabase(
        invalidActorDatabase,
        "select count(*)::int as count from public.catalog_products",
      ),
      0,
    );

    step("proving the two accounts see only their own rows");

    assert.equal(
      await countDatabase(
        appDatabase,
        "select count(*)::int as count from public.catalog_products",
      ),
      4,
    );

    assert.equal(
      await countDatabase(
        appDatabase,
        "select count(*)::int as count from app.published_catalog_products",
      ),
      3,
    );

    assert.equal(
      await countDatabase(
        appDatabase,
        "select count(*)::int as count from public.catalog_versions",
      ),
      3,
    );

    assert.equal(
      await countDatabase(
        appDatabase,
        "select count(*)::int as count from public.media_attachments",
      ),
      2,
    );

    assert.equal(
      await countDatabase(
        appDatabase,
        "select count(*)::int as count from public.ai_jobs",
      ),
      2,
    );

    assert.equal(
      await countDatabase(
        appDatabase,
        "select count(*)::int as count from public.ai_proposals",
      ),
      2,
    );

    assert.equal(
      await countDatabase(
        appDatabase,
        "select count(*)::int as count from public.inquiries",
      ),
      2,
    );

    step("proving the table owner still bypasses for migrations");

    assert.equal(
      await countClient(
        ownerTest,
        "select count(*)::int as count from public.catalog_products",
      ),
      7,
    );

    assert.equal(
      await countClient(
        ownerTest,
        "select count(*)::int as count from public.catalog_versions",
      ),
      5,
    );

    assert.equal(
      await countClient(
        ownerTest,
        "select count(*)::int as count from public.media_attachments",
      ),
      3,
    );

    assert.equal(
      await countClient(
        ownerTest,
        "select count(*)::int as count from public.ai_jobs",
      ),
      3,
    );

    assert.equal(
      await countClient(
        ownerTest,
        "select count(*)::int as count from public.ai_proposals",
      ),
      3,
    );

    assert.equal(
      await countClient(
        ownerTest,
        "select count(*)::int as count from public.inquiries",
      ),
      3,
    );

    step("all RLS policy assertions passed");
  } finally {
    await ownerTest?.end().catch(() => undefined);

    if (databaseCreated) {
      await admin
        .query(
          `drop database if exists "${databaseName}" with (force)`,
        )
        .catch((error: unknown) => {
          console.error(
            "Failed to drop the throwaway RLS database:",
            error instanceof Error ? error.message : error,
          );
        });
    }

    if (loginRoleCreated) {
      await admin
        .query(
          `drop role if exists "${loginRole}"`,
        )
        .catch((error: unknown) => {
          console.error(
            "Failed to drop the throwaway RLS login role:",
            error instanceof Error ? error.message : error,
          );
        });
    }

    if (groupRoleCreated) {
      await admin
        .query(`drop role if exists "${groupRole}"`)
        .catch((error: unknown) => {
          console.error(
            "Failed to drop the RLS group role:",
            error instanceof Error ? error.message : error,
          );
        });
    }

    await admin.end().catch(() => undefined);
  }
}

void main().then(
  () => {
    console.log("RLS POSTGRESQL POLICY PROOF PASSED");
  },
  (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  },
);
