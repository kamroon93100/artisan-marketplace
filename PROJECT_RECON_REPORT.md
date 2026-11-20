# Artisan Marketplace — Repository Recon
Generated: 2026-10-22 12:18:53
Root: C:\Users\kgurd\Projects\artisan-marketplace
Files inventoried: 1144

## 1. Git state

## master...origin/master
 M apps/api/src/modules/ai/composition.ts
 M apps/api/src/modules/ai/http.ts
 M apps/api/src/modules/catalog/application/catalog-service.ts
 M apps/api/src/modules/catalog/catalog-lifecycle-http.test.ts
 M apps/api/src/modules/catalog/catalog-lifecycle.test.ts
 M apps/api/src/modules/catalog/composition.ts
 M apps/api/src/modules/catalog/http.ts
 M apps/api/src/modules/catalog/infrastructure/postgres-catalog-repository.test.ts
 M apps/api/src/modules/catalog/infrastructure/postgres-catalog-repository.ts
 M apps/api/src/modules/discovery/composition.ts
 M apps/api/src/modules/discovery/http.ts
 M apps/api/src/modules/inquiry/composition.ts
 M apps/api/src/modules/inquiry/http.ts
 M apps/api/src/modules/media/composition.ts
 M apps/api/src/modules/media/http.ts
 M apps/api/src/modules/review/composition.ts
 M apps/api/src/modules/review/http.ts
 M apps/api/src/shared/persistence/postgres-database.test.ts
 M apps/api/src/shared/persistence/postgres-database.ts
 M apps/mobile/src/app/(home)/index.tsx
 M apps/mobile/src/features/capture/CreateProductScreen.tsx
 M apps/mobile/src/storage/database.ts
 M apps/mobile/src/storage/media-intents.ts
 M apps/mobile/src/storage/product-drafts.ts
 M apps/mobile/src/storage/sync-operations.ts
 M apps/mobile/src/sync/media-sync.ts
 M apps/mobile/src/sync/product-sync.ts
 M docs/adr/007-database-ownership-and-rls.md
 M docs/architecture/data-and-rls-contract.md
 M docs/architecture/sync-contract.md
 M scripts/verify-m6-postgres.ps1
 M scripts/verify.ps1
 M tests/m1-storage/storage-runtime.test.ts
 M tests/m2-media-upload/media-upload-pipeline-runtime.test.ts
 M tests/m2-media-upload/media-upload-storage-runtime.test.ts
 M tests/m2-product-sync/product-sync-runtime.test.ts
?? apps/api/src/modules/discovery/discovery-journey.test.ts.20261022-095305.bak
?? apps/api/src/modules/discovery/http.ts.20261022-095305.bak
?? apps/mobile/src/app/_layout.tsx.splash-diagnostic-backup
?? infra/database/
?? infra/migrations/010_row_level_security.sql
?? scripts/verify-rls-postgres.ps1
?? tests/m2-account-isolation/
?? tests/rls-policy/
9b2aaec feat: complete artisan marketplace authentication and discovery
df7d5a4 chore: ignore generated graph output
d68b6ad chore: establish complete project baseline
cc1657a feat(auth): verify postgres-backed authentication lifecycle

## 2. Top-level structure

DIR  .agents
DIR  .git
DIR  .impeccable
DIR  .opencode
DIR  apps
DIR  docs
DIR  graphify-out
DIR  infra
DIR  node_modules
DIR  packages
DIR  scripts
DIR  tests
DIR  tmp
FILE .gitignore
FILE .graphifyignore
FILE AGENTS.md
FILE CONTEXT.md
FILE M8_MIGRATION_009_DESIGN_REPORT.md
FILE package.json
FILE pnpm-lock.yaml
FILE pnpm-workspace.yaml
FILE README.md
FILE skills-lock.json
FILE tsconfig.json

## 3. Complete tracked project file inventory

.agents\skills\animate-expo\RECIPES.md [16.8 KB]
.agents\skills\animate-expo\SKILL.md [17.7 KB]
.agents\skills\animation-vocabulary\SKILL.md [13.3 KB]
.agents\skills\api-and-interface-design\SKILL.md [14.5 KB]
.agents\skills\browser-testing-with-devtools\SKILL.md [14.2 KB]
.agents\skills\ci-cd-and-automation\SKILL.md [11.1 KB]
.agents\skills\cloudflare\references\ai-gateway\configuration.md [2.2 KB]
.agents\skills\cloudflare\references\ai-gateway\dynamic-routing.md [1.8 KB]
.agents\skills\cloudflare\references\ai-gateway\features.md [2.5 KB]
.agents\skills\cloudflare\references\ai-gateway\README.md [1.9 KB]
.agents\skills\cloudflare\references\ai-gateway\sdk-integration.md [2.2 KB]
.agents\skills\cloudflare\references\ai-gateway\troubleshooting.md [2.4 KB]
.agents\skills\cloudflare\references\ai-search\api.md [1.2 KB]
.agents\skills\cloudflare\references\ai-search\configuration.md [1.7 KB]
.agents\skills\cloudflare\references\ai-search\gotchas.md [1.6 KB]
.agents\skills\cloudflare\references\ai-search\patterns.md [1.7 KB]
.agents\skills\cloudflare\references\ai-search\README.md [1.8 KB]
.agents\skills\cloudflare\references\analytics-engine\api.md [3.2 KB]
.agents\skills\cloudflare\references\analytics-engine\configuration.md [2.4 KB]
.agents\skills\cloudflare\references\analytics-engine\gotchas.md [2.1 KB]
.agents\skills\cloudflare\references\analytics-engine\patterns.md [2.3 KB]
.agents\skills\cloudflare\references\analytics-engine\README.md [3.4 KB]
.agents\skills\cloudflare\references\api\api.md [4.4 KB]
.agents\skills\cloudflare\references\api\configuration.md [3.9 KB]
.agents\skills\cloudflare\references\api\gotchas.md [5.5 KB]
.agents\skills\cloudflare\references\api\patterns.md [4.7 KB]
.agents\skills\cloudflare\references\api\README.md [2.6 KB]
.agents\skills\cloudflare\references\api-shield\api.md [3.9 KB]
.agents\skills\cloudflare\references\api-shield\configuration.md [5.1 KB]
.agents\skills\cloudflare\references\api-shield\gotchas.md [5 KB]
.agents\skills\cloudflare\references\api-shield\patterns.md [5.9 KB]
.agents\skills\cloudflare\references\api-shield\README.md [1.8 KB]
.agents\skills\cloudflare\references\argo-smart-routing\api.md [6.7 KB]
.agents\skills\cloudflare\references\argo-smart-routing\configuration.md [4.5 KB]
.agents\skills\cloudflare\references\argo-smart-routing\gotchas.md [4.3 KB]
.agents\skills\cloudflare\references\argo-smart-routing\patterns.md [3.1 KB]
.agents\skills\cloudflare\references\argo-smart-routing\README.md [4.1 KB]
.agents\skills\cloudflare\references\artifacts\api.md [5.1 KB]
.agents\skills\cloudflare\references\artifacts\configuration.md [3.2 KB]
.agents\skills\cloudflare\references\artifacts\README.md [3.8 KB]
.agents\skills\cloudflare\references\bindings\api.md [2.3 KB]
.agents\skills\cloudflare\references\bindings\configuration.md [2.4 KB]
.agents\skills\cloudflare\references\bindings\gotchas.md [2.9 KB]
.agents\skills\cloudflare\references\bindings\patterns.md [2.3 KB]
.agents\skills\cloudflare\references\bindings\README.md [1.3 KB]
.agents\skills\cloudflare\references\bot-management\api.md [5.8 KB]
.agents\skills\cloudflare\references\bot-management\configuration.md [5.8 KB]
.agents\skills\cloudflare\references\bot-management\gotchas.md [5.6 KB]
.agents\skills\cloudflare\references\bot-management\patterns.md [5 KB]
.agents\skills\cloudflare\references\bot-management\README.md [3.8 KB]
.agents\skills\cloudflare\references\browser-rendering\api.md [1.2 KB]
.agents\skills\cloudflare\references\browser-rendering\configuration.md [1.3 KB]
.agents\skills\cloudflare\references\browser-rendering\gotchas.md [1.9 KB]
.agents\skills\cloudflare\references\browser-rendering\patterns.md [1.5 KB]
.agents\skills\cloudflare\references\browser-rendering\README.md [1.3 KB]
.agents\skills\cloudflare\references\c3\api.md [2.3 KB]
.agents\skills\cloudflare\references\c3\configuration.md [1.7 KB]
.agents\skills\cloudflare\references\c3\gotchas.md [2.3 KB]
.agents\skills\cloudflare\references\c3\patterns.md [2.1 KB]
.agents\skills\cloudflare\references\c3\README.md [3.7 KB]
.agents\skills\cloudflare\references\cache-reserve\api.md [6.1 KB]
.agents\skills\cloudflare\references\cache-reserve\configuration.md [3.7 KB]
.agents\skills\cloudflare\references\cache-reserve\gotchas.md [5.8 KB]
.agents\skills\cloudflare\references\cache-reserve\patterns.md [6.3 KB]
.agents\skills\cloudflare\references\cache-reserve\README.md [5.7 KB]
.agents\skills\cloudflare\references\containers\api.md [1.5 KB]
.agents\skills\cloudflare\references\containers\configuration.md [1.8 KB]
.agents\skills\cloudflare\references\containers\gotchas.md [2.3 KB]
.agents\skills\cloudflare\references\containers\patterns.md [2.5 KB]
.agents\skills\cloudflare\references\containers\README.md [1.9 KB]
.agents\skills\cloudflare\references\cron-triggers\api.md [1.6 KB]
.agents\skills\cloudflare\references\cron-triggers\configuration.md [1.6 KB]
.agents\skills\cloudflare\references\cron-triggers\gotchas.md [2.3 KB]
.agents\skills\cloudflare\references\cron-triggers\patterns.md [1.9 KB]
.agents\skills\cloudflare\references\cron-triggers\README.md [1.5 KB]
.agents\skills\cloudflare\references\d1\api.md [1.9 KB]
.agents\skills\cloudflare\references\d1\configuration.md [1.9 KB]
.agents\skills\cloudflare\references\d1\gotchas.md [2.1 KB]
.agents\skills\cloudflare\references\d1\patterns.md [2.1 KB]
.agents\skills\cloudflare\references\d1\README.md [1.4 KB]
.agents\skills\cloudflare\references\ddos\api.md [4.2 KB]
.agents\skills\cloudflare\references\ddos\configuration.md [3 KB]
.agents\skills\cloudflare\references\ddos\gotchas.md [3.9 KB]
.agents\skills\cloudflare\references\ddos\patterns.md [5.7 KB]
.agents\skills\cloudflare\references\ddos\README.md [2 KB]
.agents\skills\cloudflare\references\do-storage\api.md [1.3 KB]
.agents\skills\cloudflare\references\do-storage\configuration.md [1.5 KB]
.agents\skills\cloudflare\references\do-storage\gotchas.md [1.8 KB]
.agents\skills\cloudflare\references\do-storage\patterns.md [1.7 KB]
.agents\skills\cloudflare\references\do-storage\README.md [1.1 KB]
.agents\skills\cloudflare\references\do-storage\testing.md [1.1 KB]
.agents\skills\cloudflare\references\email-routing\api.md [1.3 KB]
.agents\skills\cloudflare\references\email-routing\configuration.md [1.3 KB]
.agents\skills\cloudflare\references\email-routing\gotchas.md [1.4 KB]
.agents\skills\cloudflare\references\email-routing\patterns.md [1.2 KB]
.agents\skills\cloudflare\references\email-routing\README.md [1.3 KB]
.agents\skills\cloudflare\references\email-workers\api.md [1.5 KB]
.agents\skills\cloudflare\references\email-workers\configuration.md [1.5 KB]
.agents\skills\cloudflare\references\email-workers\gotchas.md [2.2 KB]
.agents\skills\cloudflare\references\email-workers\patterns.md [1.8 KB]
.agents\skills\cloudflare\references\email-workers\README.md [1.4 KB]
.agents\skills\cloudflare\references\flagship\api.md [11.9 KB]
.agents\skills\cloudflare\references\flagship\configuration.md [4.9 KB]
.agents\skills\cloudflare\references\flagship\gotchas.md [6.4 KB]
.agents\skills\cloudflare\references\flagship\patterns.md [14.2 KB]
.agents\skills\cloudflare\references\flagship\README.md [3.7 KB]
.agents\skills\cloudflare\references\graphql-api\api.md [5.8 KB]
.agents\skills\cloudflare\references\graphql-api\configuration.md [4.7 KB]
.agents\skills\cloudflare\references\graphql-api\gotchas.md [4.9 KB]
.agents\skills\cloudflare\references\graphql-api\patterns.md [6.6 KB]
.agents\skills\cloudflare\references\graphql-api\README.md [7.7 KB]
.agents\skills\cloudflare\references\hyperdrive\api.md [3.1 KB]
.agents\skills\cloudflare\references\hyperdrive\configuration.md [3.2 KB]
.agents\skills\cloudflare\references\hyperdrive\gotchas.md [3.3 KB]
.agents\skills\cloudflare\references\hyperdrive\patterns.md [2.6 KB]
.agents\skills\cloudflare\references\hyperdrive\README.md [2.1 KB]
.agents\skills\cloudflare\references\images\api.md [1.5 KB]
.agents\skills\cloudflare\references\images\configuration.md [2 KB]
.agents\skills\cloudflare\references\images\gotchas.md [2.2 KB]
.agents\skills\cloudflare\references\images\patterns.md [1.8 KB]
.agents\skills\cloudflare\references\images\README.md [1 KB]
.agents\skills\cloudflare\references\kv\api.md [1.7 KB]
.agents\skills\cloudflare\references\kv\configuration.md [1.6 KB]
.agents\skills\cloudflare\references\kv\gotchas.md [2.4 KB]
.agents\skills\cloudflare\references\kv\patterns.md [2.8 KB]
.agents\skills\cloudflare\references\kv\README.md [1.5 KB]
.agents\skills\cloudflare\references\miniflare\api.md [1.8 KB]
.agents\skills\cloudflare\references\miniflare\configuration.md [2.1 KB]
.agents\skills\cloudflare\references\miniflare\gotchas.md [2.3 KB]
.agents\skills\cloudflare\references\miniflare\patterns.md [2.2 KB]
.agents\skills\cloudflare\references\miniflare\README.md [1.6 KB]
.agents\skills\cloudflare\references\network-interconnect\api.md [5.7 KB]
.agents\skills\cloudflare\references\network-interconnect\configuration.md [4.3 KB]
.agents\skills\cloudflare\references\network-interconnect\gotchas.md [5.6 KB]
.agents\skills\cloudflare\references\network-interconnect\patterns.md [4.1 KB]
.agents\skills\cloudflare\references\network-interconnect\README.md [3.3 KB]
.agents\skills\cloudflare\references\observability\api.md [2.2 KB]
.agents\skills\cloudflare\references\observability\configuration.md [2.2 KB]
.agents\skills\cloudflare\references\observability\gotchas.md [3.5 KB]
.agents\skills\cloudflare\references\observability\patterns.md [3 KB]
.agents\skills\cloudflare\references\observability\README.md [2.4 KB]
.agents\skills\cloudflare\references\pages\api.md [1.1 KB]
.agents\skills\cloudflare\references\pages\configuration.md [1.5 KB]
.agents\skills\cloudflare\references\pages\gotchas.md [1.6 KB]
.agents\skills\cloudflare\references\pages\patterns.md [1.2 KB]
.agents\skills\cloudflare\references\pages\README.md [1.5 KB]
.agents\skills\cloudflare\references\pages-functions\api.md [1.1 KB]
.agents\skills\cloudflare\references\pages-functions\configuration.md [1.2 KB]
.agents\skills\cloudflare\references\pages-functions\gotchas.md [1.6 KB]
.agents\skills\cloudflare\references\pages-functions\patterns.md [1.4 KB]
.agents\skills\cloudflare\references\pages-functions\README.md [1.3 KB]
.agents\skills\cloudflare\references\pipelines\api.md [5.1 KB]
.agents\skills\cloudflare\references\pipelines\configuration.md [6.1 KB]
.agents\skills\cloudflare\references\pipelines\gotchas.md [3 KB]
.agents\skills\cloudflare\references\pipelines\patterns.md [4.7 KB]
.agents\skills\cloudflare\references\pipelines\README.md [4.3 KB]
.agents\skills\cloudflare\references\pulumi\api.md [5.8 KB]
.agents\skills\cloudflare\references\pulumi\configuration.md [5.7 KB]
.agents\skills\cloudflare\references\pulumi\gotchas.md [6.6 KB]
.agents\skills\cloudflare\references\pulumi\patterns.md [7 KB]
.agents\skills\cloudflare\references\pulumi\README.md [3.3 KB]
.agents\skills\cloudflare\references\queues\api.md [1.7 KB]
.agents\skills\cloudflare\references\queues\configuration.md [2.3 KB]
.agents\skills\cloudflare\references\queues\gotchas.md [2.7 KB]
.agents\skills\cloudflare\references\queues\patterns.md [2.6 KB]
.agents\skills\cloudflare\references\queues\README.md [1.8 KB]
.agents\skills\cloudflare\references\r2\api.md [1.7 KB]
.agents\skills\cloudflare\references\r2\configuration.md [2.1 KB]
.agents\skills\cloudflare\references\r2\gotchas.md [3.2 KB]
.agents\skills\cloudflare\references\r2\patterns.md [2.2 KB]
.agents\skills\cloudflare\references\r2\README.md [1.7 KB]
.agents\skills\cloudflare\references\r2-data-catalog\api.md [3.3 KB]
.agents\skills\cloudflare\references\r2-data-catalog\configuration.md [2.1 KB]
.agents\skills\cloudflare\references\r2-data-catalog\gotchas.md [2.1 KB]
.agents\skills\cloudflare\references\r2-data-catalog\patterns.md [1.7 KB]
.agents\skills\cloudflare\references\r2-data-catalog\README.md [1.2 KB]
.agents\skills\cloudflare\references\r2-sql\api.md [4.9 KB]
.agents\skills\cloudflare\references\r2-sql\configuration.md [1.7 KB]
.agents\skills\cloudflare\references\r2-sql\gotchas.md [2 KB]
.agents\skills\cloudflare\references\r2-sql\patterns.md [4.4 KB]
.agents\skills\cloudflare\references\r2-sql\README.md [3.2 KB]
.agents\skills\cloudflare\references\realtimekit\api.md [8.4 KB]
.agents\skills\cloudflare\references\realtimekit\configuration.md [5.3 KB]
.agents\skills\cloudflare\references\realtimekit\gotchas.md [6.9 KB]
.agents\skills\cloudflare\references\realtimekit\patterns.md [7.7 KB]
.agents\skills\cloudflare\references\realtimekit\README.md [4.1 KB]
.agents\skills\cloudflare\references\realtime-sfu\api.md [3.8 KB]
.agents\skills\cloudflare\references\realtime-sfu\configuration.md [3.6 KB]
.agents\skills\cloudflare\references\realtime-sfu\gotchas.md [4.9 KB]
.agents\skills\cloudflare\references\realtime-sfu\patterns.md [5.4 KB]
.agents\skills\cloudflare\references\realtime-sfu\README.md [3.1 KB]
.agents\skills\cloudflare\references\secrets-store\api.md [1.8 KB]
.agents\skills\cloudflare\references\secrets-store\configuration.md [2.4 KB]
.agents\skills\cloudflare\references\secrets-store\gotchas.md [2.7 KB]
.agents\skills\cloudflare\references\secrets-store\patterns.md [3 KB]
.agents\skills\cloudflare\references\secrets-store\README.md [1.8 KB]
.agents\skills\cloudflare\references\smart-placement\api.md [5.6 KB]
.agents\skills\cloudflare\references\smart-placement\configuration.md [6.2 KB]
.agents\skills\cloudflare\references\smart-placement\gotchas.md [5.7 KB]
.agents\skills\cloudflare\references\smart-placement\patterns.md [5.8 KB]
.agents\skills\cloudflare\references\smart-placement\README.md [5.1 KB]
.agents\skills\cloudflare\references\snippets\api.md [5.2 KB]
.agents\skills\cloudflare\references\snippets\configuration.md [6.4 KB]
.agents\skills\cloudflare\references\snippets\gotchas.md [2.3 KB]
.agents\skills\cloudflare\references\snippets\patterns.md [3.4 KB]
.agents\skills\cloudflare\references\snippets\README.md [3.1 KB]
.agents\skills\cloudflare\references\spectrum\api.md [5 KB]
.agents\skills\cloudflare\references\spectrum\configuration.md [4.4 KB]
.agents\skills\cloudflare\references\spectrum\gotchas.md [3.8 KB]
.agents\skills\cloudflare\references\spectrum\patterns.md [4.9 KB]
.agents\skills\cloudflare\references\spectrum\README.md [2.4 KB]
.agents\skills\cloudflare\references\static-assets\api.md [1.7 KB]
.agents\skills\cloudflare\references\static-assets\configuration.md [2.1 KB]
.agents\skills\cloudflare\references\static-assets\gotchas.md [2.6 KB]
.agents\skills\cloudflare\references\static-assets\patterns.md [2.1 KB]
.agents\skills\cloudflare\references\static-assets\README.md [1.7 KB]
.agents\skills\cloudflare\references\stream\api.md [2.3 KB]
.agents\skills\cloudflare\references\stream\api-live.md [2 KB]
.agents\skills\cloudflare\references\stream\configuration.md [1.9 KB]
.agents\skills\cloudflare\references\stream\gotchas.md [2.2 KB]
.agents\skills\cloudflare\references\stream\patterns.md [2.2 KB]
.agents\skills\cloudflare\references\stream\README.md [1.7 KB]
.agents\skills\cloudflare\references\tail-workers\api.md [1.3 KB]
.agents\skills\cloudflare\references\tail-workers\configuration.md [1.4 KB]
.agents\skills\cloudflare\references\tail-workers\gotchas.md [1.6 KB]
.agents\skills\cloudflare\references\tail-workers\patterns.md [1.5 KB]
.agents\skills\cloudflare\references\tail-workers\README.md [1.4 KB]
.agents\skills\cloudflare\references\terraform\api.md [4.1 KB]
.agents\skills\cloudflare\references\terraform\configuration.md [7.6 KB]
.agents\skills\cloudflare\references\terraform\gotchas.md [5.3 KB]
.agents\skills\cloudflare\references\terraform\patterns.md [6.7 KB]
.agents\skills\cloudflare\references\terraform\README.md [3.8 KB]
.agents\skills\cloudflare\references\tunnel\api.md [1.3 KB]
.agents\skills\cloudflare\references\tunnel\configuration.md [1.3 KB]
.agents\skills\cloudflare\references\tunnel\gotchas.md [1.5 KB]
.agents\skills\cloudflare\references\tunnel\networking.md [1.4 KB]
.agents\skills\cloudflare\references\tunnel\patterns.md [1.4 KB]
.agents\skills\cloudflare\references\tunnel\README.md [1.5 KB]
.agents\skills\cloudflare\references\turn\api.md [5.3 KB]
.agents\skills\cloudflare\references\turn\configuration.md [4.3 KB]
.agents\skills\cloudflare\references\turn\gotchas.md [7.1 KB]
.agents\skills\cloudflare\references\turn\patterns.md [6.3 KB]
.agents\skills\cloudflare\references\turn\README.md [3.7 KB]
.agents\skills\cloudflare\references\vectorize\api.md [2.1 KB]
.agents\skills\cloudflare\references\vectorize\configuration.md [2 KB]
.agents\skills\cloudflare\references\vectorize\gotchas.md [2.3 KB]
.agents\skills\cloudflare\references\vectorize\patterns.md [2.6 KB]
.agents\skills\cloudflare\references\vectorize\README.md [2 KB]
.agents\skills\cloudflare\references\waf\api.md [1.9 KB]
.agents\skills\cloudflare\references\waf\configuration.md [1.9 KB]
.agents\skills\cloudflare\references\waf\gotchas.md [2.3 KB]
.agents\skills\cloudflare\references\waf\patterns.md [1.8 KB]
.agents\skills\cloudflare\references\waf\README.md [1.6 KB]
.agents\skills\cloudflare\references\web-analytics\configuration.md [2 KB]
.agents\skills\cloudflare\references\web-analytics\gotchas.md [2 KB]
.agents\skills\cloudflare\references\web-analytics\integration.md [1.8 KB]
.agents\skills\cloudflare\references\web-analytics\patterns.md [2.3 KB]
.agents\skills\cloudflare\references\web-analytics\README.md [5.4 KB]
.agents\skills\cloudflare\references\workerd\api.md [5 KB]
.agents\skills\cloudflare\references\workerd\configuration.md [5.3 KB]
.agents\skills\cloudflare\references\workerd\gotchas.md [4.8 KB]
.agents\skills\cloudflare\references\workerd\patterns.md [5 KB]
.agents\skills\cloudflare\references\workerd\README.md [2.9 KB]
.agents\skills\cloudflare\references\workers-ai\api.md [1.2 KB]
.agents\skills\cloudflare\references\workers-ai\configuration.md [1.6 KB]
.agents\skills\cloudflare\references\workers-ai\gotchas.md [1.8 KB]
.agents\skills\cloudflare\references\workers-ai\patterns.md [1.7 KB]
.agents\skills\cloudflare\references\workers-ai\README.md [1.8 KB]
.agents\skills\cloudflare\references\workers-for-platforms\api.md [5.6 KB]
.agents\skills\cloudflare\references\workers-for-platforms\configuration.md [4 KB]
.agents\skills\cloudflare\references\workers-for-platforms\gotchas.md [5.4 KB]
.agents\skills\cloudflare\references\workers-for-platforms\patterns.md [5.6 KB]
.agents\skills\cloudflare\references\workers-for-platforms\README.md [4 KB]
.agents\skills\cloudflare\references\workers-playground\api.md [2.3 KB]
.agents\skills\cloudflare\references\workers-playground\configuration.md [4.5 KB]
.agents\skills\cloudflare\references\workers-playground\gotchas.md [2.1 KB]
.agents\skills\cloudflare\references\workers-playground\patterns.md [3.4 KB]
.agents\skills\cloudflare\references\workers-playground\README.md [4.1 KB]
.agents\skills\cloudflare\references\workers-vpc\api.md [5.4 KB]
.agents\skills\cloudflare\references\workers-vpc\configuration.md [4 KB]
.agents\skills\cloudflare\references\workers-vpc\gotchas.md [4.5 KB]
.agents\skills\cloudflare\references\workers-vpc\patterns.md [6.1 KB]
.agents\skills\cloudflare\references\workers-vpc\README.md [5.5 KB]
.agents\skills\cloudflare\references\workflows\api.md [1.8 KB]
.agents\skills\cloudflare\references\workflows\configuration.md [1.9 KB]
.agents\skills\cloudflare\references\workflows\gotchas.md [2.7 KB]
.agents\skills\cloudflare\references\workflows\patterns.md [2.6 KB]
.agents\skills\cloudflare\references\workflows\README.md [1.8 KB]
.agents\skills\cloudflare\references\zaraz\api.md [3.2 KB]
.agents\skills\cloudflare\references\zaraz\configuration.md [1.9 KB]
.agents\skills\cloudflare\references\zaraz\gotchas.md [2 KB]
.agents\skills\cloudflare\references\zaraz\IMPLEMENTATION_SUMMARY.md [3.5 KB]
.agents\skills\cloudflare\references\zaraz\patterns.md [2.2 KB]
.agents\skills\cloudflare\references\zaraz\README.md [3.9 KB]
.agents\skills\cloudflare\SKILL.md [23.5 KB]
.agents\skills\codebase-design\agents\openai.yaml [0.1 KB]
.agents\skills\codebase-design\DEEPENING.md [2.5 KB]
.agents\skills\codebase-design\DESIGN-IT-TWICE.md [2.6 KB]
.agents\skills\codebase-design\SKILL.md [6.4 KB]
.agents\skills\code-review-and-quality\SKILL.md [20.1 KB]
.agents\skills\code-simplification\SKILL.md [13.2 KB]
.agents\skills\constraint-driven-development\references\floor-guard.md [5.7 KB]
.agents\skills\constraint-driven-development\SKILL.md [20.5 KB]
.agents\skills\context-engineering\SKILL.md [15.1 KB]
.agents\skills\debugging-and-error-recovery\SKILL.md [10.7 KB]
.agents\skills\deprecation-and-migration\SKILL.md [12.3 KB]
.agents\skills\diagnosing-bugs\agents\openai.yaml [0.1 KB]
.agents\skills\diagnosing-bugs\scripts\hitl-loop.template.sh [1.3 KB]
.agents\skills\diagnosing-bugs\SKILL.md [8.5 KB]
.agents\skills\documentation-and-adrs\SKILL.md [9.6 KB]
.agents\skills\domain-modeling\ADR-FORMAT.md [2.7 KB]
.agents\skills\domain-modeling\agents\openai.yaml [0.1 KB]
.agents\skills\domain-modeling\CONTEXT-FORMAT.md [2.3 KB]
.agents\skills\domain-modeling\SKILL.md [3.3 KB]
.agents\skills\doubt-driven-development\SKILL.md [16.3 KB]
.agents\skills\emil-design-eng\SKILL.md [27.1 KB]
.agents\skills\expo-animation\agents\openai.yaml [0.2 KB]
.agents\skills\expo-animation\LICENSE [1.1 KB]
.agents\skills\expo-animation\RECIPES.md [16.8 KB]
.agents\skills\expo-animation\SKILL.md [18.8 KB]
.agents\skills\expo-data-fetching\agents\openai.yaml [0.4 KB]
.agents\skills\expo-data-fetching\references\expo-router-loaders.md [9.9 KB]
.agents\skills\expo-data-fetching\references\offline-and-cancellation.md [1.4 KB]
.agents\skills\expo-data-fetching\SKILL.md [13.8 KB]
.agents\skills\expo-design-system\agents\openai.yaml [0.6 KB]
.agents\skills\expo-design-system\references\audit.md [8.4 KB]
.agents\skills\expo-design-system\references\native-slop.md [8.3 KB]
.agents\skills\expo-design-system\SKILL.md [19.3 KB]
.agents\skills\expo-examples\agents\openai.yaml [0.4 KB]
.agents\skills\expo-examples\references\catalog.md [4.4 KB]
.agents\skills\expo-examples\SKILL.md [6.7 KB]
.agents\skills\expo-overview\agents\openai.yaml [0.6 KB]
.agents\skills\expo-overview\SKILL.md [9.1 KB]
.agents\skills\expo-project-structure\agents\openai.yaml [0.3 KB]
.agents\skills\expo-project-structure\SKILL.md [6.5 KB]
.agents\skills\expo-router\agents\openai.yaml [0.4 KB]
.agents\skills\expo-router\references\form-sheet.md [6.4 KB]
.agents\skills\expo-router\references\route-structure.md [5.2 KB]
.agents\skills\expo-router\references\search.md [5.3 KB]
.agents\skills\expo-router\references\tabs.md [13.4 KB]
.agents\skills\expo-router\references\toolbar-and-headers.md [8.1 KB]
.agents\skills\expo-router\references\zoom-transitions.md [4.9 KB]
.agents\skills\expo-router\SKILL.md [7.1 KB]
.agents\skills\expo-upgrade\agents\openai.yaml [0.4 KB]
.agents\skills\expo-upgrade\references\expo-av-to-audio.md [3.7 KB]
.agents\skills\expo-upgrade\references\expo-av-to-video.md [4.3 KB]
.agents\skills\expo-upgrade\references\native-tabs.md [3.6 KB]
.agents\skills\expo-upgrade\references\new-architecture.md [2.2 KB]
.agents\skills\expo-upgrade\references\react-19.md [1.9 KB]
.agents\skills\expo-upgrade\references\react-compiler.md [1.7 KB]
.agents\skills\expo-upgrade\references\react-navigation-to-expo-router.md [4.1 KB]
.agents\skills\expo-upgrade\SKILL.md [7.6 KB]
.agents\skills\find-animation-opportunities\SKILL.md [9.7 KB]
.agents\skills\frontend-design\LICENSE.txt [10.1 KB]
.agents\skills\frontend-design\SKILL.md [9.2 KB]
.agents\skills\frontend-ui-engineering\SKILL.md [11.4 KB]
.agents\skills\git-workflow-and-versioning\SKILL.md [13.8 KB]
.agents\skills\grill-with-docs\agents\openai.yaml [0.1 KB]
.agents\skills\grill-with-docs\SKILL.md [0.2 KB]
.agents\skills\handoff\agents\openai.yaml [0.1 KB]
.agents\skills\handoff\SKILL.md [0.9 KB]
.agents\skills\idea-refine\examples.md [19.8 KB]
.agents\skills\idea-refine\frameworks.md [5.3 KB]
.agents\skills\idea-refine\refinement-criteria.md [5.6 KB]
.agents\skills\idea-refine\scripts\idea-refine.sh [0.3 KB]
.agents\skills\idea-refine\SKILL.md [7.9 KB]
.agents\skills\imagegen-frontend-mobile\SKILL.md [40.8 KB]
.agents\skills\impeccable\reference\adapt.md [11.3 KB]
.agents\skills\impeccable\reference\adapt.native.md [3.9 KB]
.agents\skills\impeccable\reference\android.md [4 KB]
.agents\skills\impeccable\reference\animate.md [5.2 KB]
.agents\skills\impeccable\reference\audit.md [8.5 KB]
.agents\skills\impeccable\reference\audit.native.md [8.3 KB]
.agents\skills\impeccable\reference\bolder.md [3.4 KB]
.agents\skills\impeccable\reference\clarify.md [4.6 KB]
.agents\skills\impeccable\reference\colorize.md [4.5 KB]
.agents\skills\impeccable\reference\component-review.md [8.4 KB]
.agents\skills\impeccable\reference\craft.md [0.5 KB]
.agents\skills\impeccable\reference\craft-floor.md [4.4 KB]
.agents\skills\impeccable\reference\critique.md [42.5 KB]
.agents\skills\impeccable\reference\degraded\asset-producer.md [7.7 KB]
.agents\skills\impeccable\reference\degraded\documenter.md [3.3 KB]
.agents\skills\impeccable\reference\degraded\finish-reviewer.md [15.1 KB]
.agents\skills\impeccable\reference\degraded\manual-edit-applier.md [7.1 KB]
.agents\skills\impeccable\reference\delight.md [3.7 KB]
.agents\skills\impeccable\reference\distill.md [5.6 KB]
.agents\skills\impeccable\reference\doctor.md [5.4 KB]
.agents\skills\impeccable\reference\document.md [27.2 KB]
.agents\skills\impeccable\reference\extract.md [3.3 KB]
.agents\skills\impeccable\reference\generate.md [12.9 KB]
.agents\skills\impeccable\reference\harden.md [9.6 KB]
.agents\skills\impeccable\reference\hooks.md [13.7 KB]
.agents\skills\impeccable\reference\init.md [11.3 KB]
.agents\skills\impeccable\reference\ios.md [3.8 KB]
.agents\skills\impeccable\reference\layout.md [5.1 KB]
.agents\skills\impeccable\reference\live.md [35.7 KB]
.agents\skills\impeccable\reference\live-setup.md [8.1 KB]
.agents\skills\impeccable\reference\new-work.md [53.6 KB]
.agents\skills\impeccable\reference\onboard.md [7.8 KB]
.agents\skills\impeccable\reference\operate.md [4.1 KB]
.agents\skills\impeccable\reference\optimize.md [7.7 KB]
.agents\skills\impeccable\reference\overdrive.md [9 KB]
.agents\skills\impeccable\reference\polish.md [6.6 KB]
.agents\skills\impeccable\reference\quieter.md [4.8 KB]
.agents\skills\impeccable\reference\region-map.md [2.6 KB]
.agents\skills\impeccable\reference\routing.md [3.3 KB]
.agents\skills\impeccable\reference\shape.md [3.5 KB]
.agents\skills\impeccable\reference\typeset.md [5.2 KB]
.agents\skills\impeccable\reference\visualize.md [11.5 KB]
.agents\skills\impeccable\scripts\command-metadata.json [8.3 KB]
.agents\skills\impeccable\scripts\data\font-index.json [1074.2 KB]
.agents\skills\impeccable\scripts\data\font-index-failures.json [2.5 KB]
.agents\skills\impeccable\scripts\impeccable [8.5 KB]
.agents\skills\impeccable\scripts\impeccable.cmd [8.5 KB]
.agents\skills\impeccable\scripts\live-browser.js [547.8 KB]
.agents\skills\impeccable\scripts\live-browser-dom.js [5 KB]
.agents\skills\impeccable\scripts\live-browser-ignores.js [10.3 KB]
.agents\skills\impeccable\scripts\live-browser-session.js [4.1 KB]
.agents\skills\impeccable\scripts\modern-screenshot.umd.js [28.6 KB]
.agents\skills\impeccable\scripts\VERSION [0 KB]
.agents\skills\impeccable\SKILL.md [12 KB]
.agents\skills\improve-animations\AUDIT.md [7.3 KB]
.agents\skills\improve-animations\PLAN-TEMPLATE.md [3.1 KB]
.agents\skills\improve-animations\SKILL.md [8.1 KB]
.agents\skills\incremental-implementation\SKILL.md [9.4 KB]
.agents\skills\interview-me\SKILL.md [14.7 KB]
.agents\skills\karpathy-guidelines\SKILL.md [2.5 KB]
.agents\skills\observability-and-instrumentation\SKILL.md [13.6 KB]
.agents\skills\performance-optimization\SKILL.md [21.2 KB]
.agents\skills\planning-and-task-breakdown\SKILL.md [10.3 KB]
.agents\skills\prototype\agents\openai.yaml [0.1 KB]
.agents\skills\prototype\LOGIC.md [6 KB]
.agents\skills\prototype\SKILL.md [2.9 KB]
.agents\skills\prototype\UI.md [6.9 KB]
.agents\skills\react-native-best-practices\agents\openai.yaml [0.2 KB]
.agents\skills\react-native-best-practices\POWER.md [8.3 KB]
.agents\skills\react-native-best-practices\references\bundle-analyze-app.md [5.5 KB]
.agents\skills\react-native-best-practices\references\bundle-analyze-js.md [7.1 KB]
.agents\skills\react-native-best-practices\references\bundle-barrel-exports.md [5.5 KB]
.agents\skills\react-native-best-practices\references\bundle-code-splitting.md [7.6 KB]
.agents\skills\react-native-best-practices\references\bundle-hermes-mmap.md [4.2 KB]
.agents\skills\react-native-best-practices\references\bundle-library-size.md [4.2 KB]
.agents\skills\react-native-best-practices\references\bundle-native-assets.md [5.1 KB]
.agents\skills\react-native-best-practices\references\bundle-r8-android.md [5.5 KB]
.agents\skills\react-native-best-practices\references\bundle-tree-shaking.md [5.8 KB]
.agents\skills\react-native-best-practices\references\images\bundle-treemap-source-map-explorer.png [651.8 KB]
.agents\skills\react-native-best-practices\references\images\controlled-textinput-pingpong.png [124.2 KB]
.agents\skills\react-native-best-practices\references\images\devtools-flamegraph.png [508.5 KB]
.agents\skills\react-native-best-practices\references\images\emerge-xray-ios.png [429.4 KB]
.agents\skills\react-native-best-practices\references\images\expo-atlas-treemap.png [604.4 KB]
.agents\skills\react-native-best-practices\references\images\flashlight-flatlist-vs-flashlist.png [305.9 KB]
.agents\skills\react-native-best-practices\references\images\fps-drop-graph.png [148.9 KB]
.agents\skills\react-native-best-practices\references\images\memory-heap-snapshot.png [300.8 KB]
.agents\skills\react-native-best-practices\references\images\tti-warm-start-diagram.png [124.3 KB]
.agents\skills\react-native-best-practices\references\images\view-hierarchy-flattening.png [2526.4 KB]
.agents\skills\react-native-best-practices\references\images\xcode-instruments-templates.png [398.8 KB]
.agents\skills\react-native-best-practices\references\images\xcode-thread-view.png [174.3 KB]
.agents\skills\react-native-best-practices\references\js-animations-reanimated.md [8.1 KB]
.agents\skills\react-native-best-practices\references\js-atomic-state.md [5.3 KB]
.agents\skills\react-native-best-practices\references\js-bottomsheet.md [12.2 KB]
.agents\skills\react-native-best-practices\references\js-concurrent-react.md [6.7 KB]
.agents\skills\react-native-best-practices\references\js-lists-flatlist-flashlist.md [6.1 KB]
.agents\skills\react-native-best-practices\references\js-measure-fps.md [5.4 KB]
.agents\skills\react-native-best-practices\references\js-memory-leaks.md [5.3 KB]
.agents\skills\react-native-best-practices\references\js-profile-react.md [5.9 KB]
.agents\skills\react-native-best-practices\references\js-react-compiler.md [7.5 KB]
.agents\skills\react-native-best-practices\references\js-uncontrolled-components.md [5.6 KB]
.agents\skills\react-native-best-practices\references\native-android-16kb-alignment.md [3.8 KB]
.agents\skills\react-native-best-practices\references\native-measure-tti.md [6.6 KB]
.agents\skills\react-native-best-practices\references\native-memory-leaks.md [5.7 KB]
.agents\skills\react-native-best-practices\references\native-memory-patterns.md [6.1 KB]
.agents\skills\react-native-best-practices\references\native-platform-setup.md [3.8 KB]
.agents\skills\react-native-best-practices\references\native-profiling.md [4.4 KB]
.agents\skills\react-native-best-practices\references\native-sdks-over-polyfills.md [6.3 KB]
.agents\skills\react-native-best-practices\references\native-threading-model.md [6.9 KB]
.agents\skills\react-native-best-practices\references\native-turbo-modules.md [5.7 KB]
.agents\skills\react-native-best-practices\references\native-view-flattening.md [5.3 KB]
.agents\skills\react-native-best-practices\SKILL.md [12.3 KB]
.agents\skills\research\agents\openai.yaml [0.1 KB]
.agents\skills\research\SKILL.md [0.8 KB]
.agents\skills\review-animations\SKILL.md [8.3 KB]
.agents\skills\review-animations\STANDARDS.md [9.8 KB]
.agents\skills\security-and-hardening\references\hardening-patterns.md [12.7 KB]
.agents\skills\security-and-hardening\SKILL.md [17.1 KB]
.agents\skills\shipping-and-launch\SKILL.md [11.1 KB]
.agents\skills\source-driven-development\SKILL.md [9.8 KB]
.agents\skills\spec-driven-development\SKILL.md [12.3 KB]
.agents\skills\supabase\assets\feedback-issue-template.md [0.5 KB]
.agents\skills\supabase\CHANGELOG.md [7.3 KB]
.agents\skills\supabase\references\skill-feedback.md [1 KB]
.agents\skills\supabase\SKILL.md [14.1 KB]
.agents\skills\supabase-postgres-best-practices\CHANGELOG.md [5.6 KB]
.agents\skills\supabase-postgres-best-practices\references\_contributing.md [4.2 KB]
.agents\skills\supabase-postgres-best-practices\references\_sections.md [1.7 KB]
.agents\skills\supabase-postgres-best-practices\references\_template.md [1 KB]
.agents\skills\supabase-postgres-best-practices\references\advanced-full-text-search.md [1.5 KB]
.agents\skills\supabase-postgres-best-practices\references\advanced-jsonb-indexing.md [1.5 KB]
.agents\skills\supabase-postgres-best-practices\references\conn-idle-timeout.md [1.3 KB]
.agents\skills\supabase-postgres-best-practices\references\conn-limits.md [1.3 KB]
.agents\skills\supabase-postgres-best-practices\references\conn-pooling.md [1.4 KB]
.agents\skills\supabase-postgres-best-practices\references\conn-prepared-statements.md [1.5 KB]
.agents\skills\supabase-postgres-best-practices\references\data-batch-inserts.md [1.3 KB]
.agents\skills\supabase-postgres-best-practices\references\data-n-plus-one.md [1.4 KB]
.agents\skills\supabase-postgres-best-practices\references\data-pagination.md [1.4 KB]
.agents\skills\supabase-postgres-best-practices\references\data-upsert.md [1.4 KB]
.agents\skills\supabase-postgres-best-practices\references\lock-advisory.md [1.5 KB]
.agents\skills\supabase-postgres-best-practices\references\lock-deadlock-prevention.md [1.9 KB]
.agents\skills\supabase-postgres-best-practices\references\lock-short-transactions.md [1.4 KB]
.agents\skills\supabase-postgres-best-practices\references\lock-skip-locked.md [1.4 KB]
.agents\skills\supabase-postgres-best-practices\references\monitor-explain-analyze.md [1.5 KB]
.agents\skills\supabase-postgres-best-practices\references\monitor-pg-stat-statements.md [1.4 KB]
.agents\skills\supabase-postgres-best-practices\references\monitor-vacuum-analyze.md [1.5 KB]
.agents\skills\supabase-postgres-best-practices\references\query-composite-indexes.md [1.5 KB]
.agents\skills\supabase-postgres-best-practices\references\query-covering-indexes.md [1.3 KB]
.agents\skills\supabase-postgres-best-practices\references\query-index-types.md [1.5 KB]
.agents\skills\supabase-postgres-best-practices\references\query-missing-indexes.md [1.2 KB]
.agents\skills\supabase-postgres-best-practices\references\query-partial-indexes.md [1.4 KB]
.agents\skills\supabase-postgres-best-practices\references\schema-constraints.md [1.9 KB]
.agents\skills\supabase-postgres-best-practices\references\schema-data-types.md [1.5 KB]
.agents\skills\supabase-postgres-best-practices\references\schema-foreign-key-indexes.md [1.7 KB]
.agents\skills\supabase-postgres-best-practices\references\schema-lowercase-identifiers.md [1.7 KB]
.agents\skills\supabase-postgres-best-practices\references\schema-partitioning.md [1.6 KB]
.agents\skills\supabase-postgres-best-practices\references\schema-primary-keys.md [1.8 KB]
.agents\skills\supabase-postgres-best-practices\references\security-privileges.md [1.6 KB]
.agents\skills\supabase-postgres-best-practices\references\security-rls-basics.md [1.4 KB]
.agents\skills\supabase-postgres-best-practices\references\security-rls-performance.md [2.1 KB]
.agents\skills\supabase-postgres-best-practices\SKILL.md [3.2 KB]
.agents\skills\test-driven-development\SKILL.md [16.1 KB]
.agents\skills\upgrading-react-native\agents\openai.yaml [0.2 KB]
.agents\skills\upgrading-react-native\references\expo-sdk-upgrade.md [2.6 KB]
.agents\skills\upgrading-react-native\references\monorepo-singlerepo-targeting.md [1.1 KB]
.agents\skills\upgrading-react-native\references\react.md [1.6 KB]
.agents\skills\upgrading-react-native\references\upgrade-helper-core.md [6.6 KB]
.agents\skills\upgrading-react-native\references\upgrade-verification.md [2.5 KB]
.agents\skills\upgrading-react-native\references\upgrading-dependencies.md [2.2 KB]
.agents\skills\upgrading-react-native\references\upgrading-react-native.md [2.8 KB]
.agents\skills\upgrading-react-native\SKILL.md [4.2 KB]
.agents\skills\using-agent-skills\SKILL.md [10.2 KB]
.agents\skills\workers-best-practices\references\configuration.md [5.6 KB]
.agents\skills\workers-best-practices\references\platform-apis.md [3.8 KB]
.agents\skills\workers-best-practices\references\runtime-patterns.md [13.6 KB]
.agents\skills\workers-best-practices\SKILL.md [5.4 KB]
.agents\skills\wrangler\SKILL.md [10.5 KB]
.gitignore [0.7 KB]
.graphifyignore [0.2 KB]
.opencode\.gitignore [0.1 KB]
.opencode\agents\lead.md [3.3 KB]
.opencode\agents\researcher.md [1 KB]
.opencode\agents\reviewer.md [1.5 KB]
.opencode\agents\verifier.md [1.3 KB]
.opencode\opencode.json [0.2 KB]
.opencode\package.json [0.1 KB]
.opencode\package-lock.json [14.3 KB]
.opencode\plugins\graphify.js [1.4 KB]
.opencode\skill-routing-inventory.json [40.9 KB]
.opencode\skills\graphify\.graphify_version [0 KB]
.opencode\skills\graphify\references\add-watch.md [2.4 KB]
.opencode\skills\graphify\references\exports.md [3.3 KB]
.opencode\skills\graphify\references\extraction-spec.md [7.8 KB]
.opencode\skills\graphify\references\github-and-merge.md [2.1 KB]
.opencode\skills\graphify\references\hooks.md [1.2 KB]
.opencode\skills\graphify\references\query.md [13.1 KB]
.opencode\skills\graphify\references\transcribe.md [3.1 KB]
.opencode\skills\graphify\references\update.md [10.2 KB]
.opencode\skills\graphify\SKILL.md [39.8 KB]
AGENTS.md [25.4 KB]
apps\api\.dev.vars.example [0.7 KB]
apps\api\.tmp-test\api.test.js [2.4 KB]
apps\api\.tmp-test\index.js [1.9 KB]
apps\api\.tmp-test\modules\catalog\application\catalog-repository.js [0 KB]
apps\api\.tmp-test\modules\catalog\application\catalog-service.js [1 KB]
apps\api\.tmp-test\modules\catalog\catalog-service.test.js [1.2 KB]
apps\api\.tmp-test\modules\catalog\composition.js [0.3 KB]
apps\api\.tmp-test\modules\catalog\domain\catalog-product.js [0 KB]
apps\api\.tmp-test\modules\catalog\domain\catalog-state.js [0.9 KB]
apps\api\.tmp-test\modules\catalog\domain\catalog-state.test.js [1 KB]
apps\api\.tmp-test\modules\catalog\http.js [1.9 KB]
apps\api\.tmp-test\modules\catalog\index.js [0.2 KB]
apps\api\.tmp-test\modules\catalog\infrastructure\in-memory-catalog-repository.js [1 KB]
apps\api\.tmp-test\modules\index.js [0.1 KB]
apps\api\.tmp-test\modules\media\application\media-repository.js [0 KB]
apps\api\.tmp-test\modules\media\application\media-service.js [2.6 KB]
apps\api\.tmp-test\modules\media\domain\media-attachment.js [0 KB]
apps\api\.tmp-test\modules\media\domain\media-state.js [0.7 KB]
apps\api\.tmp-test\modules\media\domain\media-state.test.js [1 KB]
apps\api\.tmp-test\modules\media\http.js [1.5 KB]
apps\api\.tmp-test\modules\media\http.test.js [3.7 KB]
apps\api\.tmp-test\modules\media\index.js [0.2 KB]
apps\api\.tmp-test\modules\media\infrastructure\in-memory-media-repository.js [1.4 KB]
apps\api\.tmp-test\shared\context\request-context.js [0 KB]
apps\api\.tmp-test\shared\errors\app-error.js [0.2 KB]
apps\api\.tmp-test\shared\index.js [0.1 KB]
apps\api\.tmp-test\shared\persistence\database.js [0 KB]
apps\api\.wrangler\state\v3\cache\miniflare-CacheObject\metadata.sqlite [4 KB]
apps\api\.wrangler\state\v3\cache\miniflare-CacheObject\metadata.sqlite-shm [32 KB]
apps\api\.wrangler\state\v3\cache\miniflare-CacheObject\metadata.sqlite-wal [8.1 KB]
apps\api\.wrangler\state\v3\d1\miniflare-D1DatabaseObject\metadata.sqlite [4 KB]
apps\api\.wrangler\state\v3\d1\miniflare-D1DatabaseObject\metadata.sqlite-shm [32 KB]
apps\api\.wrangler\state\v3\d1\miniflare-D1DatabaseObject\metadata.sqlite-wal [8.1 KB]
apps\api\.wrangler\state\v3\kv\miniflare-KVNamespaceObject\metadata.sqlite [4 KB]
apps\api\.wrangler\state\v3\kv\miniflare-KVNamespaceObject\metadata.sqlite-shm [32 KB]
apps\api\.wrangler\state\v3\kv\miniflare-KVNamespaceObject\metadata.sqlite-wal [8.1 KB]
apps\api\.wrangler\state\v3\observability\miniflare-wobs-trace-store\a590acd76969f996ec6e4b599c3c09f58c283a76f2d61392b5d3046caf557602.sqlite [648 KB]
apps\api\.wrangler\state\v3\observability\miniflare-wobs-trace-store\a590acd76969f996ec6e4b599c3c09f58c283a76f2d61392b5d3046caf557602.sqlite-shm [32 KB]
apps\api\.wrangler\state\v3\observability\miniflare-wobs-trace-store\a590acd76969f996ec6e4b599c3c09f58c283a76f2d61392b5d3046caf557602.sqlite-wal [4043.6 KB]
apps\api\.wrangler\state\v3\observability\miniflare-wobs-trace-store\metadata.sqlite [4 KB]
apps\api\.wrangler\state\v3\observability\miniflare-wobs-trace-store\metadata.sqlite-shm [32 KB]
apps\api\.wrangler\state\v3\observability\miniflare-wobs-trace-store\metadata.sqlite-wal [8.1 KB]
apps\api\.wrangler\state\v3\r2\miniflare-R2BucketObject\metadata.sqlite [4 KB]
apps\api\.wrangler\state\v3\r2\miniflare-R2BucketObject\metadata.sqlite-shm [32 KB]
apps\api\.wrangler\state\v3\r2\miniflare-R2BucketObject\metadata.sqlite-wal [8.1 KB]
apps\api\.wrangler\tmp\bundle-jzqA7t\middleware-insertion-facade.js [0.9 KB]
apps\api\.wrangler\tmp\bundle-jzqA7t\middleware-loader.entry.ts [4.2 KB]
apps\api\.wrangler\tmp\dev-x1SPeT\c6f286e6f01e19f49c2439685e34a41f73cf8329-blake2b.wasm [7.3 KB]
apps\api\.wrangler\tmp\dev-x1SPeT\e4cdc523e88360df8f26f17ea8c50d2f8ff1421b-argon2.wasm [6.5 KB]
apps\api\.wrangler\tmp\dev-x1SPeT\worker.js [536.5 KB]
apps\api\.wrangler\tmp\dev-x1SPeT\worker.js.map [1093 KB]
apps\api\package.json [0.8 KB]
apps\api\src\api.test.ts [6.8 KB]
apps\api\src\index.ts [3.8 KB]
apps\api\src\modules\ai\application\ai-pipeline-service.test.ts [19.4 KB]
apps\api\src\modules\ai\application\ai-pipeline-service.ts [13.4 KB]
apps\api\src\modules\ai\application\ai-repository.ts [5.7 KB]
apps\api\src\modules\ai\application\ai-review-service.test.ts [13.3 KB]
apps\api\src\modules\ai\application\ai-review-service.ts [15.4 KB]
apps\api\src\modules\ai\application\catalog-product-port.test-double.ts [2.5 KB]
apps\api\src\modules\ai\application\catalog-product-port.ts [1.8 KB]
apps\api\src\modules\ai\composition.test.ts [5.5 KB]
apps\api\src\modules\ai\composition.ts [4.2 KB]
apps\api\src\modules\ai\domain\ai-error.ts [5.1 KB]
apps\api\src\modules\ai\domain\ai-input-hash.ts [2 KB]
apps\api\src\modules\ai\domain\ai-job.test.ts [6.1 KB]
apps\api\src\modules\ai\domain\ai-job.ts [5.1 KB]
apps\api\src\modules\ai\domain\ai-proposal-staleness.ts [2.3 KB]
apps\api\src\modules\ai\domain\ai-validation-pipeline.test.ts [7.1 KB]
apps\api\src\modules\ai\domain\ai-validation-pipeline.ts [18.1 KB]
apps\api\src\modules\ai\domain\catalog-ai-provider.ts [2.6 KB]
apps\api\src\modules\ai\http.test.ts [9.9 KB]
apps\api\src\modules\ai\http.ts [10 KB]
apps\api\src\modules\ai\infrastructure\catalog-service-port.ts [2.3 KB]
apps\api\src\modules\ai\infrastructure\deterministic-catalog-ai-provider.ts [4.3 KB]
apps\api\src\modules\ai\infrastructure\in-memory-ai-repository.ts [9.5 KB]
apps\api\src\modules\ai\infrastructure\postgres-ai-repository.test.ts [15.4 KB]
apps\api\src\modules\ai\infrastructure\postgres-ai-repository.ts [17.2 KB]
apps\api\src\modules\ai\README.md [0.1 KB]
apps\api\src\modules\audit\README.md [0.1 KB]
apps\api\src\modules\catalog\application\catalog-repository.ts [3.5 KB]
apps\api\src\modules\catalog\application\catalog-service.ts [16.4 KB]
apps\api\src\modules\catalog\catalog-approve.test.ts [12.3 KB]
apps\api\src\modules\catalog\catalog-lifecycle.test.ts [12.8 KB]
apps\api\src\modules\catalog\catalog-lifecycle-http.test.ts [15.1 KB]
apps\api\src\modules\catalog\catalog-published-read.test.ts [14.5 KB]
apps\api\src\modules\catalog\catalog-service.test.ts [4 KB]
apps\api\src\modules\catalog\composition.test.ts [6.5 KB]
apps\api\src\modules\catalog\composition.ts [2.5 KB]
apps\api\src\modules\catalog\domain\catalog-product.ts [1.1 KB]
apps\api\src\modules\catalog\domain\catalog-publish.test.ts [4.3 KB]
apps\api\src\modules\catalog\domain\catalog-publish.ts [8.4 KB]
apps\api\src\modules\catalog\domain\catalog-published.ts [6.4 KB]
apps\api\src\modules\catalog\domain\catalog-state.test.ts [1.1 KB]
apps\api\src\modules\catalog\domain\catalog-state.ts [1.1 KB]
apps\api\src\modules\catalog\http.test.ts [4.6 KB]
apps\api\src\modules\catalog\http.ts [7.8 KB]
apps\api\src\modules\catalog\index.ts [0.3 KB]
apps\api\src\modules\catalog\infrastructure\in-memory-catalog-repository.ts [8.7 KB]
apps\api\src\modules\catalog\infrastructure\postgres-catalog-repository.test.ts [24.2 KB]
apps\api\src\modules\catalog\infrastructure\postgres-catalog-repository.ts [21.1 KB]
apps\api\src\modules\catalog\README.md [0.1 KB]
apps\api\src\modules\discovery\application\discovery-port.ts [1.4 KB]
apps\api\src\modules\discovery\application\discovery-service.ts [2.9 KB]
apps\api\src\modules\discovery\composition.ts [1.5 KB]
apps\api\src\modules\discovery\discovery-journey.test.ts [20.4 KB]
apps\api\src\modules\discovery\discovery-journey.test.ts.20261022-095305.bak [19.4 KB]
apps\api\src\modules\discovery\domain\discovery-query.test.ts [4.6 KB]
apps\api\src\modules\discovery\domain\discovery-query.ts [4.7 KB]
apps\api\src\modules\discovery\http.ts [4.1 KB]
apps\api\src\modules\discovery\http.ts.20261022-095305.bak [3.6 KB]
apps\api\src\modules\discovery\index.ts [0.1 KB]
apps\api\src\modules\discovery\infrastructure\catalog-published-port.ts [1.7 KB]
apps\api\src\modules\discovery\README.md [0.1 KB]
apps\api\src\modules\identity\application\identity-service.ts [29.5 KB]
apps\api\src\modules\identity\application\session-store.ts [3.8 KB]
apps\api\src\modules\identity\auth-http.test.ts [15.5 KB]
apps\api\src\modules\identity\composition.test.ts [15.1 KB]
apps\api\src\modules\identity\composition.ts [7.8 KB]
apps\api\src\modules\identity\domain\credential.ts [2 KB]
apps\api\src\modules\identity\domain\roles.ts [0.8 KB]
apps\api\src\modules\identity\domain\session.ts [3.4 KB]
apps\api\src\modules\identity\http.ts [13.4 KB]
apps\api\src\modules\identity\identity.test.ts [33.8 KB]
apps\api\src\modules\identity\index.ts [1.2 KB]
apps\api\src\modules\identity\infrastructure\argon2.wasm [6.5 KB]
apps\api\src\modules\identity\infrastructure\argon2-driver.test.ts [7.2 KB]
apps\api\src\modules\identity\infrastructure\argon2-driver.ts [13 KB]
apps\api\src\modules\identity\infrastructure\argon2-modules.ts [2.2 KB]
apps\api\src\modules\identity\infrastructure\blake2b.wasm [7.3 KB]
apps\api\src\modules\identity\infrastructure\in-memory-session-store.ts [3.6 KB]
apps\api\src\modules\identity\infrastructure\password.test.ts [4.3 KB]
apps\api\src\modules\identity\infrastructure\password.ts [6.1 KB]
apps\api\src\modules\identity\infrastructure\postgres-session-store.ts [22.3 KB]
apps\api\src\modules\identity\infrastructure\test-session-store.ts [9.7 KB]
apps\api\src\modules\identity\README.md [0.1 KB]
apps\api\src\modules\index.ts [0.2 KB]
apps\api\src\modules\inquiry\application\inquiry-repository.ts [2.6 KB]
apps\api\src\modules\inquiry\application\inquiry-service.ts [7.1 KB]
apps\api\src\modules\inquiry\application\published-product-port.ts [0.9 KB]
apps\api\src\modules\inquiry\composition.ts [2.7 KB]
apps\api\src\modules\inquiry\domain\inquiry.ts [4.8 KB]
apps\api\src\modules\inquiry\http.ts [5.4 KB]
apps\api\src\modules\inquiry\index.ts [0.2 KB]
apps\api\src\modules\inquiry\infrastructure\catalog-published-port.ts [1.3 KB]
apps\api\src\modules\inquiry\infrastructure\in-memory-inquiry-repository.ts [3.1 KB]
apps\api\src\modules\inquiry\infrastructure\postgres-inquiry-repository.test.ts [10.6 KB]
apps\api\src\modules\inquiry\infrastructure\postgres-inquiry-repository.ts [6 KB]
apps\api\src\modules\inquiry\inquiry-journey.test.ts [25.2 KB]
apps\api\src\modules\inquiry\README.md [0.1 KB]
apps\api\src\modules\media\application\media-repository.ts [1.4 KB]
apps\api\src\modules\media\application\media-service.test.ts [33.5 KB]
apps\api\src\modules\media\application\media-service.ts [17.9 KB]
apps\api\src\modules\media\composition.ts [2.3 KB]
apps\api\src\modules\media\domain\media-attachment.ts [0.4 KB]
apps\api\src\modules\media\domain\media-object-key.ts [0.4 KB]
apps\api\src\modules\media\domain\media-state.test.ts [3.9 KB]
apps\api\src\modules\media\domain\media-state.ts [3.1 KB]
apps\api\src\modules\media\domain\media-verification.test.ts [2.7 KB]
apps\api\src\modules\media\domain\media-verification.ts [2.1 KB]
apps\api\src\modules\media\http.test.ts [12 KB]
apps\api\src\modules\media\http.ts [4.2 KB]
apps\api\src\modules\media\index.ts [0.2 KB]
apps\api\src\modules\media\infrastructure\in-memory-media-repository.ts [2.5 KB]
apps\api\src\modules\media\infrastructure\postgres-media-repository.test.ts [3.6 KB]
apps\api\src\modules\media\infrastructure\postgres-media-repository.ts [4.8 KB]
apps\api\src\modules\media\README.md [0.1 KB]
apps\api\src\modules\review\application\review-port.ts [3.2 KB]
apps\api\src\modules\review\application\review-service.ts [6.9 KB]
apps\api\src\modules\review\composition.test.ts [9.9 KB]
apps\api\src\modules\review\composition.ts [3.3 KB]
apps\api\src\modules\review\domain\review-readiness.test.ts [15.1 KB]
apps\api\src\modules\review\domain\review-readiness.ts [6.7 KB]
apps\api\src\modules\review\http.test.ts [11.6 KB]
apps\api\src\modules\review\http.ts [3.2 KB]
apps\api\src\modules\review\index.ts [0.1 KB]
apps\api\src\modules\review\infrastructure\ai-suggestions-port.ts [4.1 KB]
apps\api\src\modules\review\infrastructure\catalog-review-port.ts [1.9 KB]
apps\api\src\modules\review\README.md [3.1 KB]
apps\api\src\modules\review\review-publish.test.ts [16.8 KB]
apps\api\src\modules\sync\README.md [0.1 KB]
apps\api\src\shared\auth\session.test.ts [8.2 KB]
apps\api\src\shared\auth\session.ts [13.7 KB]
apps\api\src\shared\context\api-env.ts [0.7 KB]
apps\api\src\shared\context\request-context.ts [0.2 KB]
apps\api\src\shared\errors\app-error.ts [1.2 KB]
apps\api\src\shared\index.ts [0.2 KB]
apps\api\src\shared\persistence\database.ts [0.3 KB]
apps\api\src\shared\persistence\postgres-connection.test.ts [5.7 KB]
apps\api\src\shared\persistence\postgres-connection.ts [2.3 KB]
apps\api\src\shared\persistence\postgres-database.test.ts [7.7 KB]
apps\api\src\shared\persistence\postgres-database.ts [3.5 KB]
apps\api\src\shared\ratelimit\index.ts [3 KB]
apps\api\src\shared\ratelimit\in-memory-rate-limiter.test.ts [3.5 KB]
apps\api\src\shared\ratelimit\in-memory-rate-limiter.ts [2.5 KB]
apps\api\src\shared\ratelimit\rate-limiter.ts [0.8 KB]
apps\api\src\shared\ratelimit\rate-limit-middleware.ts [1.8 KB]
apps\api\src\shared\security\constant-time.ts [1 KB]
apps\api\src\shared\storage\composition.ts [1.5 KB]
apps\api\src\shared\storage\object-storage.ts [0.5 KB]
apps\api\src\shared\storage\s3-object-storage.ts [3.1 KB]
apps\api\src\worker.ts [1.1 KB]
apps\api\src\worker-wasm.d.ts [0.4 KB]
apps\api\tmp\wrangler-dry-run\index.js [405.9 KB]
apps\api\tmp\wrangler-dry-run\index.js.map [754.7 KB]
apps\api\tmp\wrangler-dry-run\README.md [0.1 KB]
apps\api\tsconfig.json [0.3 KB]
apps\api\wrangler.jsonc [1.6 KB]
apps\api\wrangler-config.test.ts [7 KB]
apps\mobile\.gitignore [0.4 KB]
apps\mobile\.vscode\extensions.json [0 KB]
apps\mobile\.vscode\settings.json [0.1 KB]
apps\mobile\app.json [1.1 KB]
apps\mobile\assets\expo.icon\Assets\expo-symbol 2.svg [0.6 KB]
apps\mobile\assets\expo.icon\Assets\grid.png [52.4 KB]
apps\mobile\assets\expo.icon\icon.json [0.8 KB]
apps\mobile\assets\images\android-icon-background.png [17.1 KB]
apps\mobile\assets\images\android-icon-foreground.png [76.9 KB]
apps\mobile\assets\images\android-icon-monochrome.png [4 KB]
apps\mobile\assets\images\expo-badge.png [4 KB]
apps\mobile\assets\images\expo-badge-white.png [4 KB]
apps\mobile\assets\images\expo-logo.png [3.2 KB]
apps\mobile\assets\images\favicon.png [1.1 KB]
apps\mobile\assets\images\icon.png [780.3 KB]
apps\mobile\assets\images\logo-glow.png [323.9 KB]
apps\mobile\assets\images\react-logo.png [6.2 KB]
apps\mobile\assets\images\react-logo@2x.png [13.9 KB]
apps\mobile\assets\images\react-logo@3x.png [20.8 KB]
apps\mobile\assets\images\splash-icon.png [3.2 KB]
apps\mobile\assets\images\tabIcons\explore.png [0.2 KB]
apps\mobile\assets\images\tabIcons\explore@2x.png [0.3 KB]
apps\mobile\assets\images\tabIcons\explore@3x.png [0.5 KB]
apps\mobile\assets\images\tabIcons\home.png [0.2 KB]
apps\mobile\assets\images\tabIcons\home@2x.png [0.3 KB]
apps\mobile\assets\images\tabIcons\home@3x.png [0.5 KB]
apps\mobile\assets\images\tutorial-web.png [57.6 KB]
apps\mobile\eslint.config.mjs [0.3 KB]
apps\mobile\expo-env.d.ts [0.1 KB]
apps\mobile\LICENSE [1.1 KB]
apps\mobile\metro.config.js [0.5 KB]
apps\mobile\metro-debug.log [1.6 KB]
apps\mobile\package.json [1.6 KB]
apps\mobile\README.md [2.1 KB]
apps\mobile\scripts\reset-project.js [3.6 KB]
apps\mobile\src\app\(home)\_layout.tsx [0.6 KB]
apps\mobile\src\app\(home)\index.tsx [7.4 KB]
apps\mobile\src\app\(home)\inquiries\_layout.tsx [0.3 KB]
apps\mobile\src\app\(home)\inquiries\index.tsx [0.4 KB]
apps\mobile\src\app\_layout.tsx [1 KB]
apps\mobile\src\app\_layout.tsx.splash-diagnostic-backup [1.2 KB]
apps\mobile\src\app\explore\_layout.tsx [0.5 KB]
apps\mobile\src\app\explore\discovery\[productId].tsx [1 KB]
apps\mobile\src\app\explore\discovery\index.tsx [0.5 KB]
apps\mobile\src\app\explore\index.tsx [0.8 KB]
apps\mobile\src\components\animated-icon.module.css [0 KB]
apps\mobile\src\components\animated-icon.tsx [3.3 KB]
apps\mobile\src\components\animated-icon.web.tsx [2.3 KB]
apps\mobile\src\components\app-tabs.tsx [1 KB]
apps\mobile\src\components\app-tabs.web.tsx [3 KB]
apps\mobile\src\components\external-link.tsx [0.8 KB]
apps\mobile\src\components\hint-row.tsx [0.9 KB]
apps\mobile\src\components\themed-text.tsx [1.6 KB]
apps\mobile\src\components\themed-view.tsx [0.5 KB]
apps\mobile\src\components\ui\collapsible.tsx [1.9 KB]
apps\mobile\src\components\web-badge.tsx [1 KB]
apps\mobile\src\config\api.ts [0.6 KB]
apps\mobile\src\constants\theme.ts [1.6 KB]
apps\mobile\src\features\auth\AuthScreen.tsx [7.9 KB]
apps\mobile\src\features\auth\auth-state.test.ts [14.2 KB]
apps\mobile\src\features\auth\auth-state.ts [7.5 KB]
apps\mobile\src\features\auth\session-provider.tsx [6.4 KB]
apps\mobile\src\features\capture\CreateProductScreen.tsx [13.9 KB]
apps\mobile\src\features\capture\DraftStatus.tsx [1.8 KB]
apps\mobile\src\features\capture\PhotoCapture.tsx [2.8 KB]
apps\mobile\src\features\capture\VoiceRecorder.tsx [3.4 KB]
apps\mobile\src\features\discovery\discovery-display.test.ts [2.9 KB]
apps\mobile\src\features\discovery\discovery-display.ts [2 KB]
apps\mobile\src\features\discovery\DiscoveryScreen.tsx [16 KB]
apps\mobile\src\features\discovery\ProductDetailScreen.tsx [7.2 KB]
apps\mobile\src\features\inquiry\InquiryComposer.tsx [8.3 KB]
apps\mobile\src\features\inquiry\InquiryHistory.tsx [10 KB]
apps\mobile\src\features\inquiry\inquiry-navigation.test.ts [1.7 KB]
apps\mobile\src\features\inquiry\inquiry-navigation.ts [1.1 KB]
apps\mobile\src\features\inquiry\inquiry-transport-shared.ts [0.9 KB]
apps\mobile\src\features\review\review-decision.test.ts [15.5 KB]
apps\mobile\src\features\review\review-decision.ts [9.8 KB]
apps\mobile\src\features\review\ReviewProductScreen.tsx [25.2 KB]
apps\mobile\src\global.css [0 KB]
apps\mobile\src\hooks\use-color-scheme.ts [0 KB]
apps\mobile\src\hooks\use-color-scheme.web.ts [0.5 KB]
apps\mobile\src\hooks\use-theme.ts [0.3 KB]
apps\mobile\src\network\authorization.ts [4.9 KB]
apps\mobile\src\network\auth-transport.test.ts [15.6 KB]
apps\mobile\src\network\auth-transport.ts [13 KB]
apps\mobile\src\network\discovery-transport.test.ts [19.7 KB]
apps\mobile\src\network\discovery-transport.ts [12.5 KB]
apps\mobile\src\network\expo-file-byte-uploader.test.ts [4.3 KB]
apps\mobile\src\network\expo-file-byte-uploader.ts [3.1 KB]
apps\mobile\src\network\expo-file-size-probe.ts [1 KB]
apps\mobile\src\network\inquiry-transport.test.ts [10.9 KB]
apps\mobile\src\network\inquiry-transport.ts [11.9 KB]
apps\mobile\src\network\media-sync-transport.test.ts [14.5 KB]
apps\mobile\src\network\media-sync-transport.ts [7.4 KB]
apps\mobile\src\network\product-sync-contract.ts [0.5 KB]
apps\mobile\src\network\product-sync-transport.test.ts [2.8 KB]
apps\mobile\src\network\product-sync-transport.ts [2.3 KB]
apps\mobile\src\network\review-contract.ts [8 KB]
apps\mobile\src\network\review-transport.test.ts [30.2 KB]
apps\mobile\src\network\review-transport.ts [16.9 KB]
apps\mobile\src\security\redact-secrets.test.ts [3.9 KB]
apps\mobile\src\security\redact-secrets.ts [3.9 KB]
apps\mobile\src\security\session-storage.test.ts [5.2 KB]
apps\mobile\src\security\session-storage.ts [8.8 KB]
apps\mobile\src\storage\database.ts [6.1 KB]
apps\mobile\src\storage\index.ts [0.1 KB]
apps\mobile\src\storage\media-intents.ts [8.1 KB]
apps\mobile\src\storage\product-drafts.ts [5.4 KB]
apps\mobile\src\storage\sync-operations.ts [16 KB]
apps\mobile\src\sync\byte-uploader.ts [0.9 KB]
apps\mobile\src\sync\index.ts [0.1 KB]
apps\mobile\src\sync\local-file-size.ts [1.5 KB]
apps\mobile\src\sync\media-sync.ts [15.7 KB]
apps\mobile\src\sync\media-sync-contract.ts [1.6 KB]
apps\mobile\src\sync\product-sync.ts [1.7 KB]
apps\mobile\src\sync\upload-outcome.test.ts [4.5 KB]
apps\mobile\src\sync\upload-outcome.ts [1.5 KB]
apps\mobile\src\types\css.d.ts [0.2 KB]
apps\mobile\tsconfig.json [0.3 KB]
CONTEXT.md [10 KB]
docs\adr\001-modular-monolith-boundaries.md [2.3 KB]
docs\adr\002-canonical-state-and-ai-boundary.md [2.5 KB]
docs\adr\003-offline-first-sync-and-idempotency.md [2.9 KB]
docs\adr\004-media-upload-and-object-lifecycle.md [3.7 KB]
docs\adr\005-ai-jobs-provider-abstraction.md [3.4 KB]
docs\adr\006-authentication-authorization-boundary.md [12.4 KB]
docs\adr\007-database-ownership-and-rls.md [4.2 KB]
docs\adr\008-events-outbox-and-queue-boundary.md [3 KB]
docs\adr\009-api-contract-and-versioning.md [3.3 KB]
docs\adr\010-verification-and-testing-strategy.md [3.3 KB]
docs\adr\011-repository-layout-and-module-implementation.md [3.2 KB]
docs\agent\evidence-template.md [0.5 KB]
docs\agent\execution-protocol.md [2.3 KB]
docs\agent\m10-auth-postgres-evidence.md [8.9 KB]
docs\agent\m4-ai-pipeline-task.md [13.1 KB]
docs\agent\m5-review-publish-task.md [24.5 KB]
docs\agent\m6-buyer-journey-task.md [16.8 KB]
docs\agent\m8-buyer-session-task.md [84.2 KB]
docs\agent\review-template.md [1.1 KB]
docs\agent\task-template.md [0.6 KB]
docs\architecture\ai-contract.md [4.6 KB]
docs\architecture\architecture-baseline.md [2.5 KB]
docs\architecture\auth-and-session-contract.md [39.2 KB]
docs\architecture\data-and-rls-contract.md [6.4 KB]
docs\architecture\module-boundaries.md [2.8 KB]
docs\architecture\security-privacy-observability-contract.md [3.3 KB]
docs\architecture\sync-contract.md [3 KB]
docs\specs\first-vertical-slice.md [4.5 KB]
graphify-out\.graphify_analysis.json [207 KB]
graphify-out\.graphify_labels.json [6 KB]
graphify-out\.graphify_labels.json.sig [4.3 KB]
graphify-out\.graphify_root [0 KB]
graphify-out\2026-09-28\.graphify_labels.json [4.2 KB]
graphify-out\2026-09-28\graph.json [2741.7 KB]
graphify-out\2026-09-28\GRAPH_REPORT.md [28.2 KB]
graphify-out\2026-09-28\manifest.json [50.6 KB]
graphify-out\2026-10-01\.graphify_labels.json [4 KB]
graphify-out\2026-10-01\graph.json [2783 KB]
graphify-out\2026-10-01\GRAPH_REPORT.md [26.3 KB]
graphify-out\2026-10-01\manifest.json [50.6 KB]
graphify-out\2026-10-02\.graphify_labels.json [5.1 KB]
graphify-out\2026-10-02\graph.json [3886.4 KB]
graphify-out\2026-10-02\GRAPH_REPORT.md [33.5 KB]
graphify-out\2026-10-02\manifest.json [60.7 KB]
graphify-out\2026-10-04\.graphify_analysis.json [207 KB]
graphify-out\2026-10-04\.graphify_labels.json [6 KB]
graphify-out\2026-10-04\graph.json [4775.5 KB]
graphify-out\2026-10-04\GRAPH_REPORT.md [38.9 KB]
graphify-out\2026-10-04\manifest.json [64.9 KB]
graphify-out\2026-10-17\.graphify_analysis.json [207 KB]
graphify-out\2026-10-17\.graphify_labels.json [5.9 KB]
graphify-out\2026-10-17\graph.json [4786.1 KB]
graphify-out\2026-10-17\GRAPH_REPORT.md [38.3 KB]
graphify-out\2026-10-17\manifest.json [64.9 KB]
graphify-out\cache\.gfy-replace-bak-xh6cx78n.tmp [0.7 KB]
graphify-out\cache\ast\v0.9.67-s4\03d6af71b3a06076403dca181e24d60aade2621ee5a513120e9a30f6ed4dad15.json [4 KB]
graphify-out\cache\ast\v0.9.67-s4\04037fb453344be64c567de75b16cc12d62426d9b38db5f86248e5799682d6e6.json [7.5 KB]
graphify-out\cache\ast\v0.9.67-s4\04234862e78a37acfeeed0b6a1bf6ff0714d08f472bde1c77bd35474ccf18b9d.json [4.4 KB]
graphify-out\cache\ast\v0.9.67-s4\0687eb15dd7861cfd34e29e38be5d625640a957dbaa0ad51c55b4b09812859f7.json [3.6 KB]
graphify-out\cache\ast\v0.9.67-s4\07bc050eef15b6194e83484a439a24d6b9ec3a2304ecbcec1a8d1a3492227d73.json [0.3 KB]
graphify-out\cache\ast\v0.9.67-s4\0bc2f9042d71f9a7527ac3ae37db1fc0f0dea24c64ec9f8e7cb0bff5a394b454.json [7.5 KB]
graphify-out\cache\ast\v0.9.67-s4\0cd74ff18c311be9d6036513949e04a0a939f45fdf51f585d5a7245faa901c9d.json [3.7 KB]
graphify-out\cache\ast\v0.9.67-s4\0cfd3f39e18d9e866685e3ba5ccb42be17e82d2372d7c9b17c0316e5081da666.json [2.9 KB]
graphify-out\cache\ast\v0.9.67-s4\0ecceb8c689993233b5a3fa8b95093500482c74fd6b6440c5d19f139cd5e54ca.json [17.5 KB]
graphify-out\cache\ast\v0.9.67-s4\13ebf3120fe9e47c28564f6b9b18a5ce7dcb416f792962333621772b76d3413b.json [5.4 KB]
graphify-out\cache\ast\v0.9.67-s4\152a8373774a7b670bf012cdfb5e9cad134fc6b5457bd8bf13edef1a3c9bedce.json [3 KB]
graphify-out\cache\ast\v0.9.67-s4\16a9fc35a12fea681db2f566ac5584150519575a2bc373b9ef09cb079173664d.json [8.1 KB]
graphify-out\cache\ast\v0.9.67-s4\175b15072b6023e3c33df59bb6060cf7f4f27750e40cb6f2e8838997c6493af1.json [17.5 KB]
graphify-out\cache\ast\v0.9.67-s4\18f4a5c0b61f97666eb13782982ab1b8655c4239909cacd0175dc68562a9e1ab.json [1.7 KB]
graphify-out\cache\ast\v0.9.67-s4\1b30d8a626ef1e5fee2788c9ea123f46265ccaf28b6306def7c4f0157853282e.json [4.3 KB]
graphify-out\cache\ast\v0.9.67-s4\1d3a857d7b6a336df68be3f07e235a0b3c3f5ed2d02f878e6b1040f9a1d4c820.json [9.2 KB]
graphify-out\cache\ast\v0.9.67-s4\1d5bbb2d690ff18e0423904de18d6caffd51187ef1798051cd4827f9a19dc291.json [6.3 KB]
graphify-out\cache\ast\v0.9.67-s4\1e4d64a15e6b9270bd162670ed5d1c440f647db620ece9b96cdba69f3a1f991b.json [10 KB]
graphify-out\cache\ast\v0.9.67-s4\1fe75094c144e7756ee03c50ab097256dcd3550da94a10e56ad7e942e5aef30c.json [5.4 KB]
graphify-out\cache\ast\v0.9.67-s4\242759fe64e0d0d59cf134bb50faee20b6f3e76a193b16a9d3af66e60de630ca.json [0.3 KB]
graphify-out\cache\ast\v0.9.67-s4\28e6de689bc3d18bd87354f0659274680908e7766a185ed3c2066a8b3acac80e.json [1.7 KB]
graphify-out\cache\ast\v0.9.67-s4\2afbed5a56ae6dce3cd192688301d0cffdbaeea3e92d15358b0ccae150c33138.json [0.2 KB]
graphify-out\cache\ast\v0.9.67-s4\30258c504585519d27817cc05ea222cdad8642f7e7b1c23761e166a190a2964c.json [18.5 KB]
graphify-out\cache\ast\v0.9.67-s4\339955175df94bdc50b1ed798c9c47c5eb158bea74e4275e8eba062b6499dbf6.json [6.3 KB]
graphify-out\cache\ast\v0.9.67-s4\3959215b317a2d7868411ba11940ee29d6b8d840d439d85940f1a5ca24903c38.json [3.1 KB]
graphify-out\cache\ast\v0.9.67-s4\3d6644988fea67e40988885223dcb71565606f8cf907330791d4e0d428edb8a2.json [3.9 KB]
graphify-out\cache\ast\v0.9.67-s4\411082a8404272fec0498600b75be293f2572172425e5e70bd886e3b4777ec47.json [7 KB]
graphify-out\cache\ast\v0.9.67-s4\46c085feacd820ca876e9a0a50cfafb84295d23dac3367d9f8ef49cd18af8c0c.json [0.2 KB]
graphify-out\cache\ast\v0.9.67-s4\47419a9a0eb29fbe3034230a54774ce96f0d050ab8b5e679ee4d93016e516a06.json [6.6 KB]
graphify-out\cache\ast\v0.9.67-s4\483cc1fda27f232800f341389a87278deeb1869bdf5261ae7920585e01eba739.json [14.8 KB]
graphify-out\cache\ast\v0.9.67-s4\48b7d35cb06b34a946528d975d2ffcff0e54f8fa24f09b31258325dfa31a5a63.json [0.2 KB]
graphify-out\cache\ast\v0.9.67-s4\4ca71fa90090bc2bd06e68d523c5a86108ecb40f071112687c55b81166065548.json [3.2 KB]
graphify-out\cache\ast\v0.9.67-s4\4dc14831a2d8810aba6b6cf125031e51a5ae18fd5dc10b8f37862292204068f3.json [35.3 KB]
graphify-out\cache\ast\v0.9.67-s4\4e43a01a777e937b45b51b1461974137a7deb6fa1f2859fc6a3d1b2f3108da19.json [30.3 KB]
graphify-out\cache\ast\v0.9.67-s4\51774a5fb85040812554dea07bd21ab9f9d60a82887c44b726013d0b250564da.json [16.9 KB]
graphify-out\cache\ast\v0.9.67-s4\53d0d29763caeffde352a0fdbb8275fe17c38ed26878791aa45278e1a33d6292.json [21.6 KB]
graphify-out\cache\ast\v0.9.67-s4\54ed94455029322f4fd09c6abe4761c4713893b6fc5db5cd820b8ddf8ab5a09e.json [8.1 KB]
graphify-out\cache\ast\v0.9.67-s4\568cd04daa16afce2fdaa0902e990c3750d02f0832b91e5dd116f249960ebf32.json [1.7 KB]
graphify-out\cache\ast\v0.9.67-s4\60fdf5ef71a1f73765a5727642c4b175c42de99f78bd91777678e1d0ddb2d3db.json [8.5 KB]
graphify-out\cache\ast\v0.9.67-s4\6708bd30903e2c348cfe96f59eb7fe4367908bfe1d6ec47eda81bf5c721afcb4.json [2.2 KB]
graphify-out\cache\ast\v0.9.67-s4\69c7e3e14a7ca1bbd53f97a69f19b3bd283cb5931a0307b0bd539b9521788d2c.json [0.3 KB]
graphify-out\cache\ast\v0.9.67-s4\6b1bb9cb4c86e0e1e43699d70aea16be4500837f8772dbf84299740258be1394.json [0.7 KB]
graphify-out\cache\ast\v0.9.67-s4\6e4f06ebd636ecf739b59c753be9a5b7fac9c7b94272dda432ca57ab97f864db.json [3.2 KB]
graphify-out\cache\ast\v0.9.67-s4\6e7e1a4e4fd0ee6eef203c62769a9687d86ab6bf75164b97500f13422854d05a.json [9.4 KB]
graphify-out\cache\ast\v0.9.67-s4\6eaf9fc2dcff69982faad85ca5014c35d86f2a380bba9c48fcbbf2a18335ee4c.json [14.3 KB]
graphify-out\cache\ast\v0.9.67-s4\729090ddb6b43aa69c3e05b4fd2733de19c85e72672da7557ca12b1f82a867e9.json [13.2 KB]
graphify-out\cache\ast\v0.9.67-s4\78485694d21b95d853ac5c77ce3d5872a8929efd4056e19f407ec6e78c56a0db.json [6.7 KB]
graphify-out\cache\ast\v0.9.67-s4\7b1720b2de2da82841f237f61995a27a9fb7a67a09e5ddb282f977f4f4b28221.json [0.3 KB]
graphify-out\cache\ast\v0.9.67-s4\7b42940e57e5d015b77d38a558f848600ed86274c600fd1a517c5f0f0cd6bbbc.json [3.7 KB]
graphify-out\cache\ast\v0.9.67-s4\7c738d26611d8db81e9007ac65f5f90918c2d17bc42a64422ea3c07bef46e5e4.json [5 KB]
graphify-out\cache\ast\v0.9.67-s4\82d77d35a051bf8bb2e73dc0d4d67e0d0d9cd8e70822fbed9cd0d43bf8a51f69.json [0.6 KB]
graphify-out\cache\ast\v0.9.67-s4\82dd0e13208849da7d3129822a31d6b5b919fbe3423c9349f53abf459bd8b34f.json [5.7 KB]
graphify-out\cache\ast\v0.9.67-s4\8369aaa9541365c1ef0fc10296c04b95cfb5b887d21fde2e86bfea34ec91ad13.json [4.8 KB]
graphify-out\cache\ast\v0.9.67-s4\83a5f02ef00b91d933929bd4794f37ae5e0242e166d30359799cabeffd80f097.json [52.9 KB]
graphify-out\cache\ast\v0.9.67-s4\891e70112e098a2d1cd0e38978c19348b3d8414a310ce7f9fd62ba411141b005.json [6.1 KB]
graphify-out\cache\ast\v0.9.67-s4\8a52e2ae245a0147a3f850026218d81722b6e52264c2d3d2828022b6a2782100.json [7.9 KB]
graphify-out\cache\ast\v0.9.67-s4\8b5b8936a4e2cbed1f9a5628c55b6ef0ca2ff8e63e7978bedaec0ea7a6528d2f.json [5.2 KB]
graphify-out\cache\ast\v0.9.67-s4\93ab03e7fb1a66c99e81e2fae501c2ec7e5c3ad2f5b1fdb906ebba0b7ea65ea1.json [21 KB]
graphify-out\cache\ast\v0.9.67-s4\95b08e0de70f6f3402506cab4ab52320b3f8dde4480340e15c98faee443dee6b.json [13.5 KB]
graphify-out\cache\ast\v0.9.67-s4\9884b4097fb593068a8ad5680d6a3c85e329152e705b2795d159ea0fb178a52f.json [32 KB]
graphify-out\cache\ast\v0.9.67-s4\a02c455705ea0e6b08c77025944a185c01ed8a7a4af0af35c024a9cf58eb4c72.json [0.3 KB]
graphify-out\cache\ast\v0.9.67-s4\a0d1b12a4197c62a381eb11b14cb533b03a432a4a471ee375184b8e4d7d2ff5d.json [0.3 KB]
graphify-out\cache\ast\v0.9.67-s4\a2217dda2bc58f8fbd29b63eab15bc585c87cd8b062a3e3b16c12d3c554fdda6.json [32.9 KB]
graphify-out\cache\ast\v0.9.67-s4\a41dd913016c58a7dc489356d06a30b3ca5983db8879f7ffa6badd4a9949dd99.json [5.7 KB]
graphify-out\cache\ast\v0.9.67-s4\a74ddd50bb8b9bf45339e74c998a2ae1918b247675d8ade37b8a16a8a4effcfe.json [13.2 KB]
graphify-out\cache\ast\v0.9.67-s4\abdb88e8cba7a5735055b984aec7cfc103f4a7712517045dfbcb8095ac294da8.json [0.7 KB]
graphify-out\cache\ast\v0.9.67-s4\aced604046d458949f0930dcf363a3716c173222441518a64da254556441c46f.json [5.9 KB]
graphify-out\cache\ast\v0.9.67-s4\b01041f8b6e44a08a5b30e8d2f36bb752b2105878bcb51d453d9826568dc1f34.json [0.7 KB]
graphify-out\cache\ast\v0.9.67-s4\b08c441b3831b71da93d9cbbecca99c250198fe92d568f6d7d5f6aef87cba03b.json [0.2 KB]
graphify-out\cache\ast\v0.9.67-s4\b7c8f9af730bd85b23024f8e6c376669cb0dd51b65ba26da43394193cf34cc46.json [7.9 KB]
graphify-out\cache\ast\v0.9.67-s4\b938ed10e16790a3fd2f4c81fbbda6ea3901c87495bdfe7f34b82bbf5babb4e3.json [10.2 KB]
graphify-out\cache\ast\v0.9.67-s4\bbba83a250a8aec0706c82196e9b0513655a0a2015b53b494dbffe692ea0e1c2.json [64.7 KB]
graphify-out\cache\ast\v0.9.67-s4\bd5bbfd154edf9efa1d85877d196e00f49ed85b3204c2c491b8cfb34c39e7854.json [0.3 KB]
graphify-out\cache\ast\v0.9.67-s4\be56293de113c955e4fe24e28f994b587c17010306d8a797aeb1b3bb64ab67d4.json [3.3 KB]
graphify-out\cache\ast\v0.9.67-s4\c18704b479260db3211a57f49a2539107c2e9eb8e451601123ce5f9070a2167a.json [21.2 KB]
graphify-out\cache\ast\v0.9.67-s4\c33124a71fb8476662d86d01a5c924d9830e5e9921358ab54d619cc19b1d2205.json [5.6 KB]
graphify-out\cache\ast\v0.9.67-s4\c4700151058999590c690d14f6c02d9254140cadeaba4733cad607555db5c076.json [0.7 KB]
graphify-out\cache\ast\v0.9.67-s4\c4cc722b1249b7f79b22d353057e4329fc9bc5dec8c358329ab28f7f3561e14f.json [5.1 KB]
graphify-out\cache\ast\v0.9.67-s4\c9209ba063b189586d6bad4d96c69ff24af396bbe15de7c89ae5b16d03015ef1.json [0.3 KB]
graphify-out\cache\ast\v0.9.67-s4\c93ebec5d1c60f22c6d8ea62bc25b51c87bbb89c33cb4199389967e694bab941.json [4.1 KB]
graphify-out\cache\ast\v0.9.67-s4\c9f7c82b1b302cf9dc6c2fa0498faffaefb6dde4170740f2d09bafdf50ed23ee.json [10 KB]
graphify-out\cache\ast\v0.9.67-s4\caa6a3843e231bd39b8d471258632a21ecdc5e6cd95559acfd0d5a44a54c2fdc.json [3.9 KB]
graphify-out\cache\ast\v0.9.67-s4\cd4bf4d4d0b0d1624a6178df2cca07955b9a8bf46a4bb18059c37703efb7e1f9.json [25.9 KB]
graphify-out\cache\ast\v0.9.67-s4\d238af45233f606221c589278175b882f9cf9d89be151e879792cca4d0663c7d.json [5.4 KB]
graphify-out\cache\ast\v0.9.67-s4\d3bc7aabef3a35007ed729ee6cf2d95e2a7c48870f176868caab47e2522dfd4d.json [0.3 KB]
graphify-out\cache\ast\v0.9.67-s4\d7a7c2179ab14a1e6628ed60514cd0f2358c14eaa6a42644d896004914f0d0d7.json [6.6 KB]
graphify-out\cache\ast\v0.9.67-s4\d945e35c651ea8ca40acd7f00be467129249e2ff6eba2866ce186ee39266e40a.json [0.3 KB]
graphify-out\cache\ast\v0.9.67-s4\da903c58c77d9d0f13b12717634f4b8d80dd6f5db9742b80abc476c1371e58cc.json [6.2 KB]
graphify-out\cache\ast\v0.9.67-s4\db3f9f3a1d50f10e95122b3d3d6e9b01010f8bdfdd7c8405b1db4ed139967527.json [0.3 KB]
graphify-out\cache\ast\v0.9.67-s4\dbd7c9972f0513bb556ea284a24d54d1ffb27eec7ddbc2a022c965c19e39cfb7.json [4.1 KB]
graphify-out\cache\ast\v0.9.67-s4\de7ef51468eb1023b093c0dbcd0d8abd82a87596389a57e0d6ca741192961c21.json [4 KB]
graphify-out\cache\ast\v0.9.67-s4\e331d2ff5c4ea6a7887821f850925a66c34d4492e282765a441d894b2fdc6e2f.json [5.8 KB]
graphify-out\cache\ast\v0.9.67-s4\e4c1a49dbc50b73c81244c2c37dac19fe6bc86ced5cfec431bce78a8c93827ff.json [0.7 KB]
graphify-out\cache\ast\v0.9.67-s4\f2e9fd1ba565f63dae5fd5020ded0aacf1bfeb2809c8308540c155e2516fba42.json [11.8 KB]
graphify-out\cache\ast\v0.9.67-s4\f32c754dcd361f41e89ea77e28a6ca373b23ad5db1156058c3462fb7f02d5986.json [0.3 KB]
graphify-out\cache\ast\v0.9.67-s4\f3ca3523daf4a84164fe8707ad1971fb7961bf08e3f250b29b640a31998988c9.json [4.9 KB]
graphify-out\cache\ast\v0.9.67-s4\f533e6685baa366897c6d35d95b6ef92bfe736d0764b419a6157152ce7cd2887.json [5.9 KB]
graphify-out\cache\ast\v0.9.67-s4\f8882540dc803695d22e92b784dbfa78eecb840ba4ddec15b57d27f44512248e.json [8.8 KB]
graphify-out\cache\ast\v0.9.67-s4\f924f29b716fb5406a61ca60b4490d5a22017096f001858b6c7dd4d2b7e6de84.json [9.9 KB]
graphify-out\cache\ast\v0.9.67-s4\fd97c89971e79de5e3979316b98c592ee6e4d07a4db965f0a441b0e173112007.json [0.2 KB]
graphify-out\cache\ast\v0.9.67-s4\ffcf791afbaad6ac8df3be0d946a8ee9f9bcca36a9a17cd4c851c8dcc38fc64e.json [6.8 KB]
graphify-out\cache\last_query_stamp [0 KB]
graphify-out\cache\stat-index.json [65.4 KB]
graphify-out\graph.html [4008.5 KB]
graphify-out\graph.json [5323.7 KB]
graphify-out\GRAPH_REPORT.md [39.1 KB]
graphify-out\manifest.json [69.7 KB]
infra\database\app-role.sql [3.2 KB]
infra\database\README.md [4 KB]
infra\docker\local-compose.yml [1.5 KB]
infra\migrations\001_catalog\migration.sql [0.9 KB]
infra\migrations\001_catalog\README.md [0.6 KB]
infra\migrations\002_media\migration.sql [1.9 KB]
infra\migrations\002_media\README.md [0.6 KB]
infra\migrations\003_catalog_idempotency.sql [0.4 KB]
infra\migrations\004_media_upload_verification.sql [1.7 KB]
infra\migrations\005_catalog_versions.sql [4.2 KB]
infra\migrations\006_ai_jobs_and_proposals.sql [12.6 KB]
infra\migrations\007_inquiries_and_published_search.sql [8.3 KB]
infra\migrations\008_identity_accounts_and_sessions.sql [19.4 KB]
infra\migrations\009_identity_refresh_grants.sql [6 KB]
infra\migrations\010_row_level_security.sql [14 KB]
M8_MIGRATION_009_DESIGN_REPORT.md [12.2 KB]
package.json [0.4 KB]
packages\config\package.json [0.3 KB]
packages\config\src\index.ts [0.1 KB]
packages\config\tsconfig.json [0.2 KB]
packages\contracts\package.json [0.3 KB]
packages\contracts\src\ai\ai.ts [9.4 KB]
packages\contracts\src\catalog\catalog.ts [2.7 KB]
packages\contracts\src\discovery\discovery.ts [3.7 KB]
packages\contracts\src\index.ts [0.2 KB]
packages\contracts\src\inquiry\inquiry.ts [3.3 KB]
packages\contracts\src\media\media.ts [1.6 KB]
packages\contracts\src\review\review.ts [4.3 KB]
packages\contracts\tsconfig.json [0.2 KB]
packages\utils\package.json [0.3 KB]
packages\utils\src\index.ts [0.1 KB]
packages\utils\tsconfig.json [0.2 KB]
pnpm-lock.yaml [359.3 KB]
pnpm-workspace.yaml [0.5 KB]
README.md [0.4 KB]
scripts\verify.ps1 [6.8 KB]
scripts\verify-m10-auth-postgres.ps1 [7.9 KB]
scripts\verify-m3-postgres.ps1 [3.3 KB]
scripts\verify-m4-postgres.ps1 [4.4 KB]
scripts\verify-m5-postgres.ps1 [5.6 KB]
scripts\verify-m6-postgres.ps1 [6.1 KB]
scripts\verify-m8-actor-isolation-postgres.ps1 [6.4 KB]
scripts\verify-m8-db-wiring-postgres.ps1 [6.5 KB]
scripts\verify-m8-identity-migration-postgres.ps1 [34.6 KB]
scripts\verify-m8-unauthenticated-401-postgres.ps1 [6.3 KB]
scripts\verify-m9-identity-migration-postgres.ps1 [29.2 KB]
scripts\verify-rls-postgres.ps1 [2.8 KB]
scripts\verify-worker-auth.ps1 [17.6 KB]
skills-lock.json [14.1 KB]
tests\m10-auth-postgres\auth-postgres-runtime.test.ts [23.2 KB]
tests\m10-auth-postgres\tsconfig.json [0.3 KB]
tests\m1-storage\node-sqlite-test-shim.ts [1.3 KB]
tests\m1-storage\storage-runtime.test.ts [4.2 KB]
tests\m1-storage\tsconfig.json [0.2 KB]
tests\m2-account-isolation\account-isolation-runtime.test.ts [18.1 KB]
tests\m2-account-isolation\tsconfig.json [0.2 KB]
tests\m2-media-upload\expo-file-system-test-shim.ts [0.6 KB]
tests\m2-media-upload\media-upload-pipeline-runtime.test.ts [37.3 KB]
tests\m2-media-upload\media-upload-runtime.test.ts [18.9 KB]
tests\m2-media-upload\media-upload-storage-runtime.test.ts [7.7 KB]
tests\m2-media-upload\tsconfig.json [0.3 KB]
tests\m2-product-sync\product-sync-runtime.test.ts [3.1 KB]
tests\m2-product-sync\tsconfig.json [0.2 KB]
tests\m3-catalog-lifecycle\catalog-lifecycle-postgres-runtime.test.ts [12 KB]
tests\m3-catalog-lifecycle\tsconfig.json [0.2 KB]
tests\m4-ai-pipeline\ai-pipeline-postgres-runtime.test.ts [27.6 KB]
tests\m4-ai-pipeline\tsconfig.json [0.1 KB]
tests\m5-review-publish\review-publish-postgres-runtime.test.ts [25.4 KB]
tests\m5-review-publish\review-screen-transport-identity.test.ts [4.6 KB]
tests\m5-review-publish\tsconfig.json [0.1 KB]
tests\m6-buyer-journey\buyer-journey-postgres-runtime.test.ts [39.8 KB]
tests\m6-buyer-journey\tsconfig.json [0.1 KB]
tests\m8-actor-isolation\actor-isolation-runtime.test.ts [13 KB]
tests\m8-actor-isolation\tsconfig.json [0.3 KB]
tests\m8-db-wiring\db-wiring-runtime.test.ts [17 KB]
tests\m8-db-wiring\tsconfig.json [0.3 KB]
tests\m8-unauthenticated-401\tsconfig.json [0.3 KB]
tests\m8-unauthenticated-401\unauthenticated-401-runtime.test.ts [17.5 KB]
tests\rls-policy\rls-policy-postgres-runtime.test.ts [31.4 KB]
tests\rls-policy\tsconfig.json [0.1 KB]
tests\rls-policy\tsconfig.typecheck.json [0.3 KB]
tmp\api-8789.log [2.6 KB]
tmp\api-8789-restart.log [5.8 KB]
tmp\m2c-8789.stderr.log [1.7 KB]
tmp\m2c-8789.stdout.log [41.1 KB]
tmp\m2c-probe.json [0 KB]
tsconfig.json [0.2 KB]

## 4. Package manifests and scripts

### package.json
Name: artisan-marketplace
Package manager: pnpm@11.9.0
Scripts:
- check: pnpm -r run check
- test: pnpm -r run test
- typecheck: pnpm -r run typecheck
- verify:mobile: powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/verify.ps1
- verify: pnpm run verify:mobile
### .opencode\package.json
Name: 
Package manager: 
Scripts:
### apps\api\package.json
Name: @artisan-marketplace/api
Package manager: 
Scripts:
- check: pnpm run typecheck
- typecheck: tsc --noEmit
- test: echo "API tests not created yet"
- dev: wrangler dev
- deploy: wrangler deploy
### apps\mobile\package.json
Name: mobile
Package manager: 
Scripts:
- start: expo start
- reset-project: node ./scripts/reset-project.js
- android: expo start --android
- ios: expo start --ios
- web: expo start --web
- lint: eslint .
- typecheck: tsc --noEmit
### packages\config\package.json
Name: @artisan-marketplace/config
Package manager: 
Scripts:
- check: pnpm run typecheck
- typecheck: tsc --noEmit
- test: echo "Config tests not created yet"
### packages\contracts\package.json
Name: @artisan-marketplace/contracts
Package manager: 
Scripts:
- check: pnpm run typecheck
- typecheck: tsc --noEmit
- test: echo "Contract tests not created yet"
### packages\utils\package.json
Name: @artisan-marketplace/utils
Package manager: 
Scripts:
- check: pnpm run typecheck
- typecheck: tsc --noEmit
- test: echo "Utility tests not created yet"

## 5. Skills, agents, and project instructions

.agents\skills\animate-expo\RECIPES.md
.agents\skills\animate-expo\SKILL.md
.agents\skills\animation-vocabulary\SKILL.md
.agents\skills\api-and-interface-design\SKILL.md
.agents\skills\browser-testing-with-devtools\SKILL.md
.agents\skills\ci-cd-and-automation\SKILL.md
.agents\skills\cloudflare\references\ai-gateway\configuration.md
.agents\skills\cloudflare\references\ai-gateway\dynamic-routing.md
.agents\skills\cloudflare\references\ai-gateway\features.md
.agents\skills\cloudflare\references\ai-gateway\README.md
.agents\skills\cloudflare\references\ai-gateway\sdk-integration.md
.agents\skills\cloudflare\references\ai-gateway\troubleshooting.md
.agents\skills\cloudflare\references\ai-search\api.md
.agents\skills\cloudflare\references\ai-search\configuration.md
.agents\skills\cloudflare\references\ai-search\gotchas.md
.agents\skills\cloudflare\references\ai-search\patterns.md
.agents\skills\cloudflare\references\ai-search\README.md
.agents\skills\cloudflare\references\analytics-engine\api.md
.agents\skills\cloudflare\references\analytics-engine\configuration.md
.agents\skills\cloudflare\references\analytics-engine\gotchas.md
.agents\skills\cloudflare\references\analytics-engine\patterns.md
.agents\skills\cloudflare\references\analytics-engine\README.md
.agents\skills\cloudflare\references\api\api.md
.agents\skills\cloudflare\references\api\configuration.md
.agents\skills\cloudflare\references\api\gotchas.md
.agents\skills\cloudflare\references\api\patterns.md
.agents\skills\cloudflare\references\api\README.md
.agents\skills\cloudflare\references\api-shield\api.md
.agents\skills\cloudflare\references\api-shield\configuration.md
.agents\skills\cloudflare\references\api-shield\gotchas.md
.agents\skills\cloudflare\references\api-shield\patterns.md
.agents\skills\cloudflare\references\api-shield\README.md
.agents\skills\cloudflare\references\argo-smart-routing\api.md
.agents\skills\cloudflare\references\argo-smart-routing\configuration.md
.agents\skills\cloudflare\references\argo-smart-routing\gotchas.md
.agents\skills\cloudflare\references\argo-smart-routing\patterns.md
.agents\skills\cloudflare\references\argo-smart-routing\README.md
.agents\skills\cloudflare\references\artifacts\api.md
.agents\skills\cloudflare\references\artifacts\configuration.md
.agents\skills\cloudflare\references\artifacts\README.md
.agents\skills\cloudflare\references\bindings\api.md
.agents\skills\cloudflare\references\bindings\configuration.md
.agents\skills\cloudflare\references\bindings\gotchas.md
.agents\skills\cloudflare\references\bindings\patterns.md
.agents\skills\cloudflare\references\bindings\README.md
.agents\skills\cloudflare\references\bot-management\api.md
.agents\skills\cloudflare\references\bot-management\configuration.md
.agents\skills\cloudflare\references\bot-management\gotchas.md
.agents\skills\cloudflare\references\bot-management\patterns.md
.agents\skills\cloudflare\references\bot-management\README.md
.agents\skills\cloudflare\references\browser-rendering\api.md
.agents\skills\cloudflare\references\browser-rendering\configuration.md
.agents\skills\cloudflare\references\browser-rendering\gotchas.md
.agents\skills\cloudflare\references\browser-rendering\patterns.md
.agents\skills\cloudflare\references\browser-rendering\README.md
.agents\skills\cloudflare\references\c3\api.md
.agents\skills\cloudflare\references\c3\configuration.md
.agents\skills\cloudflare\references\c3\gotchas.md
.agents\skills\cloudflare\references\c3\patterns.md
.agents\skills\cloudflare\references\c3\README.md
.agents\skills\cloudflare\references\cache-reserve\api.md
.agents\skills\cloudflare\references\cache-reserve\configuration.md
.agents\skills\cloudflare\references\cache-reserve\gotchas.md
.agents\skills\cloudflare\references\cache-reserve\patterns.md
.agents\skills\cloudflare\references\cache-reserve\README.md
.agents\skills\cloudflare\references\containers\api.md
.agents\skills\cloudflare\references\containers\configuration.md
.agents\skills\cloudflare\references\containers\gotchas.md
.agents\skills\cloudflare\references\containers\patterns.md
.agents\skills\cloudflare\references\containers\README.md
.agents\skills\cloudflare\references\cron-triggers\api.md
.agents\skills\cloudflare\references\cron-triggers\configuration.md
.agents\skills\cloudflare\references\cron-triggers\gotchas.md
.agents\skills\cloudflare\references\cron-triggers\patterns.md
.agents\skills\cloudflare\references\cron-triggers\README.md
.agents\skills\cloudflare\references\d1\api.md
.agents\skills\cloudflare\references\d1\configuration.md
.agents\skills\cloudflare\references\d1\gotchas.md
.agents\skills\cloudflare\references\d1\patterns.md
.agents\skills\cloudflare\references\d1\README.md
.agents\skills\cloudflare\references\ddos\api.md
.agents\skills\cloudflare\references\ddos\configuration.md
.agents\skills\cloudflare\references\ddos\gotchas.md
.agents\skills\cloudflare\references\ddos\patterns.md
.agents\skills\cloudflare\references\ddos\README.md
.agents\skills\cloudflare\references\do-storage\api.md
.agents\skills\cloudflare\references\do-storage\configuration.md
.agents\skills\cloudflare\references\do-storage\gotchas.md
.agents\skills\cloudflare\references\do-storage\patterns.md
.agents\skills\cloudflare\references\do-storage\README.md
.agents\skills\cloudflare\references\do-storage\testing.md
.agents\skills\cloudflare\references\email-routing\api.md
.agents\skills\cloudflare\references\email-routing\configuration.md
.agents\skills\cloudflare\references\email-routing\gotchas.md
.agents\skills\cloudflare\references\email-routing\patterns.md
.agents\skills\cloudflare\references\email-routing\README.md
.agents\skills\cloudflare\references\email-workers\api.md
.agents\skills\cloudflare\references\email-workers\configuration.md
.agents\skills\cloudflare\references\email-workers\gotchas.md
.agents\skills\cloudflare\references\email-workers\patterns.md
.agents\skills\cloudflare\references\email-workers\README.md
.agents\skills\cloudflare\references\flagship\api.md
.agents\skills\cloudflare\references\flagship\configuration.md
.agents\skills\cloudflare\references\flagship\gotchas.md
.agents\skills\cloudflare\references\flagship\patterns.md
.agents\skills\cloudflare\references\flagship\README.md
.agents\skills\cloudflare\references\graphql-api\api.md
.agents\skills\cloudflare\references\graphql-api\configuration.md
.agents\skills\cloudflare\references\graphql-api\gotchas.md
.agents\skills\cloudflare\references\graphql-api\patterns.md
.agents\skills\cloudflare\references\graphql-api\README.md
.agents\skills\cloudflare\references\hyperdrive\api.md
.agents\skills\cloudflare\references\hyperdrive\configuration.md
.agents\skills\cloudflare\references\hyperdrive\gotchas.md
.agents\skills\cloudflare\references\hyperdrive\patterns.md
.agents\skills\cloudflare\references\hyperdrive\README.md
.agents\skills\cloudflare\references\images\api.md
.agents\skills\cloudflare\references\images\configuration.md
.agents\skills\cloudflare\references\images\gotchas.md
.agents\skills\cloudflare\references\images\patterns.md
.agents\skills\cloudflare\references\images\README.md
.agents\skills\cloudflare\references\kv\api.md
.agents\skills\cloudflare\references\kv\configuration.md
.agents\skills\cloudflare\references\kv\gotchas.md
.agents\skills\cloudflare\references\kv\patterns.md
.agents\skills\cloudflare\references\kv\README.md
.agents\skills\cloudflare\references\miniflare\api.md
.agents\skills\cloudflare\references\miniflare\configuration.md
.agents\skills\cloudflare\references\miniflare\gotchas.md
.agents\skills\cloudflare\references\miniflare\patterns.md
.agents\skills\cloudflare\references\miniflare\README.md
.agents\skills\cloudflare\references\network-interconnect\api.md
.agents\skills\cloudflare\references\network-interconnect\configuration.md
.agents\skills\cloudflare\references\network-interconnect\gotchas.md
.agents\skills\cloudflare\references\network-interconnect\patterns.md
.agents\skills\cloudflare\references\network-interconnect\README.md
.agents\skills\cloudflare\references\observability\api.md
.agents\skills\cloudflare\references\observability\configuration.md
.agents\skills\cloudflare\references\observability\gotchas.md
.agents\skills\cloudflare\references\observability\patterns.md
.agents\skills\cloudflare\references\observability\README.md
.agents\skills\cloudflare\references\pages\api.md
.agents\skills\cloudflare\references\pages\configuration.md
.agents\skills\cloudflare\references\pages\gotchas.md
.agents\skills\cloudflare\references\pages\patterns.md
.agents\skills\cloudflare\references\pages\README.md
.agents\skills\cloudflare\references\pages-functions\api.md
.agents\skills\cloudflare\references\pages-functions\configuration.md
.agents\skills\cloudflare\references\pages-functions\gotchas.md
.agents\skills\cloudflare\references\pages-functions\patterns.md
.agents\skills\cloudflare\references\pages-functions\README.md
.agents\skills\cloudflare\references\pipelines\api.md
.agents\skills\cloudflare\references\pipelines\configuration.md
.agents\skills\cloudflare\references\pipelines\gotchas.md
.agents\skills\cloudflare\references\pipelines\patterns.md
.agents\skills\cloudflare\references\pipelines\README.md
.agents\skills\cloudflare\references\pulumi\api.md
.agents\skills\cloudflare\references\pulumi\configuration.md
.agents\skills\cloudflare\references\pulumi\gotchas.md
.agents\skills\cloudflare\references\pulumi\patterns.md
.agents\skills\cloudflare\references\pulumi\README.md
.agents\skills\cloudflare\references\queues\api.md
.agents\skills\cloudflare\references\queues\configuration.md
.agents\skills\cloudflare\references\queues\gotchas.md
.agents\skills\cloudflare\references\queues\patterns.md
.agents\skills\cloudflare\references\queues\README.md
.agents\skills\cloudflare\references\r2\api.md
.agents\skills\cloudflare\references\r2\configuration.md
.agents\skills\cloudflare\references\r2\gotchas.md
.agents\skills\cloudflare\references\r2\patterns.md
.agents\skills\cloudflare\references\r2\README.md
.agents\skills\cloudflare\references\r2-data-catalog\api.md
.agents\skills\cloudflare\references\r2-data-catalog\configuration.md
.agents\skills\cloudflare\references\r2-data-catalog\gotchas.md
.agents\skills\cloudflare\references\r2-data-catalog\patterns.md
.agents\skills\cloudflare\references\r2-data-catalog\README.md
.agents\skills\cloudflare\references\r2-sql\api.md
.agents\skills\cloudflare\references\r2-sql\configuration.md
.agents\skills\cloudflare\references\r2-sql\gotchas.md
.agents\skills\cloudflare\references\r2-sql\patterns.md
.agents\skills\cloudflare\references\r2-sql\README.md
.agents\skills\cloudflare\references\realtimekit\api.md
.agents\skills\cloudflare\references\realtimekit\configuration.md
.agents\skills\cloudflare\references\realtimekit\gotchas.md
.agents\skills\cloudflare\references\realtimekit\patterns.md
.agents\skills\cloudflare\references\realtimekit\README.md
.agents\skills\cloudflare\references\realtime-sfu\api.md
.agents\skills\cloudflare\references\realtime-sfu\configuration.md
.agents\skills\cloudflare\references\realtime-sfu\gotchas.md
.agents\skills\cloudflare\references\realtime-sfu\patterns.md
.agents\skills\cloudflare\references\realtime-sfu\README.md
.agents\skills\cloudflare\references\secrets-store\api.md
.agents\skills\cloudflare\references\secrets-store\configuration.md
.agents\skills\cloudflare\references\secrets-store\gotchas.md
.agents\skills\cloudflare\references\secrets-store\patterns.md
.agents\skills\cloudflare\references\secrets-store\README.md
.agents\skills\cloudflare\references\smart-placement\api.md
.agents\skills\cloudflare\references\smart-placement\configuration.md
.agents\skills\cloudflare\references\smart-placement\gotchas.md
.agents\skills\cloudflare\references\smart-placement\patterns.md
.agents\skills\cloudflare\references\smart-placement\README.md
.agents\skills\cloudflare\references\snippets\api.md
.agents\skills\cloudflare\references\snippets\configuration.md
.agents\skills\cloudflare\references\snippets\gotchas.md
.agents\skills\cloudflare\references\snippets\patterns.md
.agents\skills\cloudflare\references\snippets\README.md
.agents\skills\cloudflare\references\spectrum\api.md
.agents\skills\cloudflare\references\spectrum\configuration.md
.agents\skills\cloudflare\references\spectrum\gotchas.md
.agents\skills\cloudflare\references\spectrum\patterns.md
.agents\skills\cloudflare\references\spectrum\README.md
.agents\skills\cloudflare\references\static-assets\api.md
.agents\skills\cloudflare\references\static-assets\configuration.md
.agents\skills\cloudflare\references\static-assets\gotchas.md
.agents\skills\cloudflare\references\static-assets\patterns.md
.agents\skills\cloudflare\references\static-assets\README.md
.agents\skills\cloudflare\references\stream\api.md
.agents\skills\cloudflare\references\stream\api-live.md
.agents\skills\cloudflare\references\stream\configuration.md
.agents\skills\cloudflare\references\stream\gotchas.md
.agents\skills\cloudflare\references\stream\patterns.md
.agents\skills\cloudflare\references\stream\README.md
.agents\skills\cloudflare\references\tail-workers\api.md
.agents\skills\cloudflare\references\tail-workers\configuration.md
.agents\skills\cloudflare\references\tail-workers\gotchas.md
.agents\skills\cloudflare\references\tail-workers\patterns.md
.agents\skills\cloudflare\references\tail-workers\README.md
.agents\skills\cloudflare\references\terraform\api.md
.agents\skills\cloudflare\references\terraform\configuration.md
.agents\skills\cloudflare\references\terraform\gotchas.md
.agents\skills\cloudflare\references\terraform\patterns.md
.agents\skills\cloudflare\references\terraform\README.md
.agents\skills\cloudflare\references\tunnel\api.md
.agents\skills\cloudflare\references\tunnel\configuration.md
.agents\skills\cloudflare\references\tunnel\gotchas.md
.agents\skills\cloudflare\references\tunnel\networking.md
.agents\skills\cloudflare\references\tunnel\patterns.md
.agents\skills\cloudflare\references\tunnel\README.md
.agents\skills\cloudflare\references\turn\api.md
.agents\skills\cloudflare\references\turn\configuration.md
.agents\skills\cloudflare\references\turn\gotchas.md
.agents\skills\cloudflare\references\turn\patterns.md
.agents\skills\cloudflare\references\turn\README.md
.agents\skills\cloudflare\references\vectorize\api.md
.agents\skills\cloudflare\references\vectorize\configuration.md
.agents\skills\cloudflare\references\vectorize\gotchas.md
.agents\skills\cloudflare\references\vectorize\patterns.md
.agents\skills\cloudflare\references\vectorize\README.md
.agents\skills\cloudflare\references\waf\api.md
.agents\skills\cloudflare\references\waf\configuration.md
.agents\skills\cloudflare\references\waf\gotchas.md
.agents\skills\cloudflare\references\waf\patterns.md
.agents\skills\cloudflare\references\waf\README.md
.agents\skills\cloudflare\references\web-analytics\configuration.md
.agents\skills\cloudflare\references\web-analytics\gotchas.md
.agents\skills\cloudflare\references\web-analytics\integration.md
.agents\skills\cloudflare\references\web-analytics\patterns.md
.agents\skills\cloudflare\references\web-analytics\README.md
.agents\skills\cloudflare\references\workerd\api.md
.agents\skills\cloudflare\references\workerd\configuration.md
.agents\skills\cloudflare\references\workerd\gotchas.md
.agents\skills\cloudflare\references\workerd\patterns.md
.agents\skills\cloudflare\references\workerd\README.md
.agents\skills\cloudflare\references\workers-ai\api.md
.agents\skills\cloudflare\references\workers-ai\configuration.md
.agents\skills\cloudflare\references\workers-ai\gotchas.md
.agents\skills\cloudflare\references\workers-ai\patterns.md
.agents\skills\cloudflare\references\workers-ai\README.md
.agents\skills\cloudflare\references\workers-for-platforms\api.md
.agents\skills\cloudflare\references\workers-for-platforms\configuration.md
.agents\skills\cloudflare\references\workers-for-platforms\gotchas.md
.agents\skills\cloudflare\references\workers-for-platforms\patterns.md
.agents\skills\cloudflare\references\workers-for-platforms\README.md
.agents\skills\cloudflare\references\workers-playground\api.md
.agents\skills\cloudflare\references\workers-playground\configuration.md
.agents\skills\cloudflare\references\workers-playground\gotchas.md
.agents\skills\cloudflare\references\workers-playground\patterns.md
.agents\skills\cloudflare\references\workers-playground\README.md
.agents\skills\cloudflare\references\workers-vpc\api.md
.agents\skills\cloudflare\references\workers-vpc\configuration.md
.agents\skills\cloudflare\references\workers-vpc\gotchas.md
.agents\skills\cloudflare\references\workers-vpc\patterns.md
.agents\skills\cloudflare\references\workers-vpc\README.md
.agents\skills\cloudflare\references\workflows\api.md
.agents\skills\cloudflare\references\workflows\configuration.md
.agents\skills\cloudflare\references\workflows\gotchas.md
.agents\skills\cloudflare\references\workflows\patterns.md
.agents\skills\cloudflare\references\workflows\README.md
.agents\skills\cloudflare\references\zaraz\api.md
.agents\skills\cloudflare\references\zaraz\configuration.md
.agents\skills\cloudflare\references\zaraz\gotchas.md
.agents\skills\cloudflare\references\zaraz\IMPLEMENTATION_SUMMARY.md
.agents\skills\cloudflare\references\zaraz\patterns.md
.agents\skills\cloudflare\references\zaraz\README.md
.agents\skills\cloudflare\SKILL.md
.agents\skills\codebase-design\agents\openai.yaml
.agents\skills\codebase-design\DEEPENING.md
.agents\skills\codebase-design\DESIGN-IT-TWICE.md
.agents\skills\codebase-design\SKILL.md
.agents\skills\code-review-and-quality\SKILL.md
.agents\skills\code-simplification\SKILL.md
.agents\skills\constraint-driven-development\references\floor-guard.md
.agents\skills\constraint-driven-development\SKILL.md
.agents\skills\context-engineering\SKILL.md
.agents\skills\debugging-and-error-recovery\SKILL.md
.agents\skills\deprecation-and-migration\SKILL.md
.agents\skills\diagnosing-bugs\agents\openai.yaml
.agents\skills\diagnosing-bugs\scripts\hitl-loop.template.sh
.agents\skills\diagnosing-bugs\SKILL.md
.agents\skills\documentation-and-adrs\SKILL.md
.agents\skills\domain-modeling\ADR-FORMAT.md
.agents\skills\domain-modeling\agents\openai.yaml
.agents\skills\domain-modeling\CONTEXT-FORMAT.md
.agents\skills\domain-modeling\SKILL.md
.agents\skills\doubt-driven-development\SKILL.md
.agents\skills\emil-design-eng\SKILL.md
.agents\skills\expo-animation\agents\openai.yaml
.agents\skills\expo-animation\LICENSE
.agents\skills\expo-animation\RECIPES.md
.agents\skills\expo-animation\SKILL.md
.agents\skills\expo-data-fetching\agents\openai.yaml
.agents\skills\expo-data-fetching\references\expo-router-loaders.md
.agents\skills\expo-data-fetching\references\offline-and-cancellation.md
.agents\skills\expo-data-fetching\SKILL.md
.agents\skills\expo-design-system\agents\openai.yaml
.agents\skills\expo-design-system\references\audit.md
.agents\skills\expo-design-system\references\native-slop.md
.agents\skills\expo-design-system\SKILL.md
.agents\skills\expo-examples\agents\openai.yaml
.agents\skills\expo-examples\references\catalog.md
.agents\skills\expo-examples\SKILL.md
.agents\skills\expo-overview\agents\openai.yaml
.agents\skills\expo-overview\SKILL.md
.agents\skills\expo-project-structure\agents\openai.yaml
.agents\skills\expo-project-structure\SKILL.md
.agents\skills\expo-router\agents\openai.yaml
.agents\skills\expo-router\references\form-sheet.md
.agents\skills\expo-router\references\route-structure.md
.agents\skills\expo-router\references\search.md
.agents\skills\expo-router\references\tabs.md
.agents\skills\expo-router\references\toolbar-and-headers.md
.agents\skills\expo-router\references\zoom-transitions.md
.agents\skills\expo-router\SKILL.md
.agents\skills\expo-upgrade\agents\openai.yaml
.agents\skills\expo-upgrade\references\expo-av-to-audio.md
.agents\skills\expo-upgrade\references\expo-av-to-video.md
.agents\skills\expo-upgrade\references\native-tabs.md
.agents\skills\expo-upgrade\references\new-architecture.md
.agents\skills\expo-upgrade\references\react-19.md
.agents\skills\expo-upgrade\references\react-compiler.md
.agents\skills\expo-upgrade\references\react-navigation-to-expo-router.md
.agents\skills\expo-upgrade\SKILL.md
.agents\skills\find-animation-opportunities\SKILL.md
.agents\skills\frontend-design\LICENSE.txt
.agents\skills\frontend-design\SKILL.md
.agents\skills\frontend-ui-engineering\SKILL.md
.agents\skills\git-workflow-and-versioning\SKILL.md
.agents\skills\grill-with-docs\agents\openai.yaml
.agents\skills\grill-with-docs\SKILL.md
.agents\skills\handoff\agents\openai.yaml
.agents\skills\handoff\SKILL.md
.agents\skills\idea-refine\examples.md
.agents\skills\idea-refine\frameworks.md
.agents\skills\idea-refine\refinement-criteria.md
.agents\skills\idea-refine\scripts\idea-refine.sh
.agents\skills\idea-refine\SKILL.md
.agents\skills\imagegen-frontend-mobile\SKILL.md
.agents\skills\impeccable\reference\adapt.md
.agents\skills\impeccable\reference\adapt.native.md
.agents\skills\impeccable\reference\android.md
.agents\skills\impeccable\reference\animate.md
.agents\skills\impeccable\reference\audit.md
.agents\skills\impeccable\reference\audit.native.md
.agents\skills\impeccable\reference\bolder.md
.agents\skills\impeccable\reference\clarify.md
.agents\skills\impeccable\reference\colorize.md
.agents\skills\impeccable\reference\component-review.md
.agents\skills\impeccable\reference\craft.md
.agents\skills\impeccable\reference\craft-floor.md
.agents\skills\impeccable\reference\critique.md
.agents\skills\impeccable\reference\degraded\asset-producer.md
.agents\skills\impeccable\reference\degraded\documenter.md
.agents\skills\impeccable\reference\degraded\finish-reviewer.md
.agents\skills\impeccable\reference\degraded\manual-edit-applier.md
.agents\skills\impeccable\reference\delight.md
.agents\skills\impeccable\reference\distill.md
.agents\skills\impeccable\reference\doctor.md
.agents\skills\impeccable\reference\document.md
.agents\skills\impeccable\reference\extract.md
.agents\skills\impeccable\reference\generate.md
.agents\skills\impeccable\reference\harden.md
.agents\skills\impeccable\reference\hooks.md
.agents\skills\impeccable\reference\init.md
.agents\skills\impeccable\reference\ios.md
.agents\skills\impeccable\reference\layout.md
.agents\skills\impeccable\reference\live.md
.agents\skills\impeccable\reference\live-setup.md
.agents\skills\impeccable\reference\new-work.md
.agents\skills\impeccable\reference\onboard.md
.agents\skills\impeccable\reference\operate.md
.agents\skills\impeccable\reference\optimize.md
.agents\skills\impeccable\reference\overdrive.md
.agents\skills\impeccable\reference\polish.md
.agents\skills\impeccable\reference\quieter.md
.agents\skills\impeccable\reference\region-map.md
.agents\skills\impeccable\reference\routing.md
.agents\skills\impeccable\reference\shape.md
.agents\skills\impeccable\reference\typeset.md
.agents\skills\impeccable\reference\visualize.md
.agents\skills\impeccable\scripts\command-metadata.json
.agents\skills\impeccable\scripts\data\font-index.json
.agents\skills\impeccable\scripts\data\font-index-failures.json
.agents\skills\impeccable\scripts\impeccable
.agents\skills\impeccable\scripts\impeccable.cmd
.agents\skills\impeccable\scripts\live-browser.js
.agents\skills\impeccable\scripts\live-browser-dom.js
.agents\skills\impeccable\scripts\live-browser-ignores.js
.agents\skills\impeccable\scripts\live-browser-session.js
.agents\skills\impeccable\scripts\modern-screenshot.umd.js
.agents\skills\impeccable\scripts\VERSION
.agents\skills\impeccable\SKILL.md
.agents\skills\improve-animations\AUDIT.md
.agents\skills\improve-animations\PLAN-TEMPLATE.md
.agents\skills\improve-animations\SKILL.md
.agents\skills\incremental-implementation\SKILL.md
.agents\skills\interview-me\SKILL.md
.agents\skills\karpathy-guidelines\SKILL.md
.agents\skills\observability-and-instrumentation\SKILL.md
.agents\skills\performance-optimization\SKILL.md
.agents\skills\planning-and-task-breakdown\SKILL.md
.agents\skills\prototype\agents\openai.yaml
.agents\skills\prototype\LOGIC.md
.agents\skills\prototype\SKILL.md
.agents\skills\prototype\UI.md
.agents\skills\react-native-best-practices\agents\openai.yaml
.agents\skills\react-native-best-practices\POWER.md
.agents\skills\react-native-best-practices\references\bundle-analyze-app.md
.agents\skills\react-native-best-practices\references\bundle-analyze-js.md
.agents\skills\react-native-best-practices\references\bundle-barrel-exports.md
.agents\skills\react-native-best-practices\references\bundle-code-splitting.md
.agents\skills\react-native-best-practices\references\bundle-hermes-mmap.md
.agents\skills\react-native-best-practices\references\bundle-library-size.md
.agents\skills\react-native-best-practices\references\bundle-native-assets.md
.agents\skills\react-native-best-practices\references\bundle-r8-android.md
.agents\skills\react-native-best-practices\references\bundle-tree-shaking.md
.agents\skills\react-native-best-practices\references\images\bundle-treemap-source-map-explorer.png
.agents\skills\react-native-best-practices\references\images\controlled-textinput-pingpong.png
.agents\skills\react-native-best-practices\references\images\devtools-flamegraph.png
.agents\skills\react-native-best-practices\references\images\emerge-xray-ios.png
.agents\skills\react-native-best-practices\references\images\expo-atlas-treemap.png
.agents\skills\react-native-best-practices\references\images\flashlight-flatlist-vs-flashlist.png
.agents\skills\react-native-best-practices\references\images\fps-drop-graph.png
.agents\skills\react-native-best-practices\references\images\memory-heap-snapshot.png
.agents\skills\react-native-best-practices\references\images\tti-warm-start-diagram.png
.agents\skills\react-native-best-practices\references\images\view-hierarchy-flattening.png
.agents\skills\react-native-best-practices\references\images\xcode-instruments-templates.png
.agents\skills\react-native-best-practices\references\images\xcode-thread-view.png
.agents\skills\react-native-best-practices\references\js-animations-reanimated.md
.agents\skills\react-native-best-practices\references\js-atomic-state.md
.agents\skills\react-native-best-practices\references\js-bottomsheet.md
.agents\skills\react-native-best-practices\references\js-concurrent-react.md
.agents\skills\react-native-best-practices\references\js-lists-flatlist-flashlist.md
.agents\skills\react-native-best-practices\references\js-measure-fps.md
.agents\skills\react-native-best-practices\references\js-memory-leaks.md
.agents\skills\react-native-best-practices\references\js-profile-react.md
.agents\skills\react-native-best-practices\references\js-react-compiler.md
.agents\skills\react-native-best-practices\references\js-uncontrolled-components.md
.agents\skills\react-native-best-practices\references\native-android-16kb-alignment.md
.agents\skills\react-native-best-practices\references\native-measure-tti.md
.agents\skills\react-native-best-practices\references\native-memory-leaks.md
.agents\skills\react-native-best-practices\references\native-memory-patterns.md
.agents\skills\react-native-best-practices\references\native-platform-setup.md
.agents\skills\react-native-best-practices\references\native-profiling.md
.agents\skills\react-native-best-practices\references\native-sdks-over-polyfills.md
.agents\skills\react-native-best-practices\references\native-threading-model.md
.agents\skills\react-native-best-practices\references\native-turbo-modules.md
.agents\skills\react-native-best-practices\references\native-view-flattening.md
.agents\skills\react-native-best-practices\SKILL.md
.agents\skills\research\agents\openai.yaml
.agents\skills\research\SKILL.md
.agents\skills\review-animations\SKILL.md
.agents\skills\review-animations\STANDARDS.md
.agents\skills\security-and-hardening\references\hardening-patterns.md
.agents\skills\security-and-hardening\SKILL.md
.agents\skills\shipping-and-launch\SKILL.md
.agents\skills\source-driven-development\SKILL.md
.agents\skills\spec-driven-development\SKILL.md
.agents\skills\supabase\assets\feedback-issue-template.md
.agents\skills\supabase\CHANGELOG.md
.agents\skills\supabase\references\skill-feedback.md
.agents\skills\supabase\SKILL.md
.agents\skills\supabase-postgres-best-practices\CHANGELOG.md
.agents\skills\supabase-postgres-best-practices\references\_contributing.md
.agents\skills\supabase-postgres-best-practices\references\_sections.md
.agents\skills\supabase-postgres-best-practices\references\_template.md
.agents\skills\supabase-postgres-best-practices\references\advanced-full-text-search.md
.agents\skills\supabase-postgres-best-practices\references\advanced-jsonb-indexing.md
.agents\skills\supabase-postgres-best-practices\references\conn-idle-timeout.md
.agents\skills\supabase-postgres-best-practices\references\conn-limits.md
.agents\skills\supabase-postgres-best-practices\references\conn-pooling.md
.agents\skills\supabase-postgres-best-practices\references\conn-prepared-statements.md
.agents\skills\supabase-postgres-best-practices\references\data-batch-inserts.md
.agents\skills\supabase-postgres-best-practices\references\data-n-plus-one.md
.agents\skills\supabase-postgres-best-practices\references\data-pagination.md
.agents\skills\supabase-postgres-best-practices\references\data-upsert.md
.agents\skills\supabase-postgres-best-practices\references\lock-advisory.md
.agents\skills\supabase-postgres-best-practices\references\lock-deadlock-prevention.md
.agents\skills\supabase-postgres-best-practices\references\lock-short-transactions.md
.agents\skills\supabase-postgres-best-practices\references\lock-skip-locked.md
.agents\skills\supabase-postgres-best-practices\references\monitor-explain-analyze.md
.agents\skills\supabase-postgres-best-practices\references\monitor-pg-stat-statements.md
.agents\skills\supabase-postgres-best-practices\references\monitor-vacuum-analyze.md
.agents\skills\supabase-postgres-best-practices\references\query-composite-indexes.md
.agents\skills\supabase-postgres-best-practices\references\query-covering-indexes.md
.agents\skills\supabase-postgres-best-practices\references\query-index-types.md
.agents\skills\supabase-postgres-best-practices\references\query-missing-indexes.md
.agents\skills\supabase-postgres-best-practices\references\query-partial-indexes.md
.agents\skills\supabase-postgres-best-practices\references\schema-constraints.md
.agents\skills\supabase-postgres-best-practices\references\schema-data-types.md
.agents\skills\supabase-postgres-best-practices\references\schema-foreign-key-indexes.md
.agents\skills\supabase-postgres-best-practices\references\schema-lowercase-identifiers.md
.agents\skills\supabase-postgres-best-practices\references\schema-partitioning.md
.agents\skills\supabase-postgres-best-practices\references\schema-primary-keys.md
.agents\skills\supabase-postgres-best-practices\references\security-privileges.md
.agents\skills\supabase-postgres-best-practices\references\security-rls-basics.md
.agents\skills\supabase-postgres-best-practices\references\security-rls-performance.md
.agents\skills\supabase-postgres-best-practices\SKILL.md
.agents\skills\test-driven-development\SKILL.md
.agents\skills\upgrading-react-native\agents\openai.yaml
.agents\skills\upgrading-react-native\references\expo-sdk-upgrade.md
.agents\skills\upgrading-react-native\references\monorepo-singlerepo-targeting.md
.agents\skills\upgrading-react-native\references\react.md
.agents\skills\upgrading-react-native\references\upgrade-helper-core.md
.agents\skills\upgrading-react-native\references\upgrade-verification.md
.agents\skills\upgrading-react-native\references\upgrading-dependencies.md
.agents\skills\upgrading-react-native\references\upgrading-react-native.md
.agents\skills\upgrading-react-native\SKILL.md
.agents\skills\using-agent-skills\SKILL.md
.agents\skills\workers-best-practices\references\configuration.md
.agents\skills\workers-best-practices\references\platform-apis.md
.agents\skills\workers-best-practices\references\runtime-patterns.md
.agents\skills\workers-best-practices\SKILL.md
.agents\skills\wrangler\SKILL.md
.opencode\.gitignore
.opencode\agents\lead.md
.opencode\agents\researcher.md
.opencode\agents\reviewer.md
.opencode\agents\verifier.md
.opencode\opencode.json
.opencode\package.json
.opencode\package-lock.json
.opencode\plugins\graphify.js
.opencode\skill-routing-inventory.json
.opencode\skills\graphify\.graphify_version
.opencode\skills\graphify\references\add-watch.md
.opencode\skills\graphify\references\exports.md
.opencode\skills\graphify\references\extraction-spec.md
.opencode\skills\graphify\references\github-and-merge.md
.opencode\skills\graphify\references\hooks.md
.opencode\skills\graphify\references\query.md
.opencode\skills\graphify\references\transcribe.md
.opencode\skills\graphify\references\update.md
.opencode\skills\graphify\SKILL.md
AGENTS.md
CONTEXT.md
skills-lock.json

## 6. Architecture, database, API, and test files

.agents\skills\cloudflare\references\ai-gateway\README.md
.agents\skills\cloudflare\references\ai-search\README.md
.agents\skills\cloudflare\references\analytics-engine\README.md
.agents\skills\cloudflare\references\api\README.md
.agents\skills\cloudflare\references\api-shield\README.md
.agents\skills\cloudflare\references\argo-smart-routing\README.md
.agents\skills\cloudflare\references\artifacts\README.md
.agents\skills\cloudflare\references\bindings\README.md
.agents\skills\cloudflare\references\bot-management\README.md
.agents\skills\cloudflare\references\browser-rendering\README.md
.agents\skills\cloudflare\references\c3\README.md
.agents\skills\cloudflare\references\cache-reserve\README.md
.agents\skills\cloudflare\references\containers\README.md
.agents\skills\cloudflare\references\cron-triggers\README.md
.agents\skills\cloudflare\references\d1\README.md
.agents\skills\cloudflare\references\ddos\README.md
.agents\skills\cloudflare\references\do-storage\README.md
.agents\skills\cloudflare\references\email-routing\README.md
.agents\skills\cloudflare\references\email-workers\README.md
.agents\skills\cloudflare\references\flagship\README.md
.agents\skills\cloudflare\references\graphql-api\README.md
.agents\skills\cloudflare\references\hyperdrive\README.md
.agents\skills\cloudflare\references\images\README.md
.agents\skills\cloudflare\references\kv\README.md
.agents\skills\cloudflare\references\miniflare\README.md
.agents\skills\cloudflare\references\network-interconnect\README.md
.agents\skills\cloudflare\references\observability\README.md
.agents\skills\cloudflare\references\pages\README.md
.agents\skills\cloudflare\references\pages-functions\README.md
.agents\skills\cloudflare\references\pipelines\README.md
.agents\skills\cloudflare\references\pulumi\README.md
.agents\skills\cloudflare\references\queues\README.md
.agents\skills\cloudflare\references\r2\README.md
.agents\skills\cloudflare\references\r2-data-catalog\README.md
.agents\skills\cloudflare\references\r2-sql\README.md
.agents\skills\cloudflare\references\realtimekit\README.md
.agents\skills\cloudflare\references\realtime-sfu\README.md
.agents\skills\cloudflare\references\secrets-store\README.md
.agents\skills\cloudflare\references\smart-placement\README.md
.agents\skills\cloudflare\references\snippets\README.md
.agents\skills\cloudflare\references\spectrum\README.md
.agents\skills\cloudflare\references\static-assets\README.md
.agents\skills\cloudflare\references\stream\README.md
.agents\skills\cloudflare\references\tail-workers\README.md
.agents\skills\cloudflare\references\terraform\README.md
.agents\skills\cloudflare\references\tunnel\README.md
.agents\skills\cloudflare\references\turn\README.md
.agents\skills\cloudflare\references\vectorize\README.md
.agents\skills\cloudflare\references\waf\README.md
.agents\skills\cloudflare\references\web-analytics\README.md
.agents\skills\cloudflare\references\workerd\README.md
.agents\skills\cloudflare\references\workers-ai\README.md
.agents\skills\cloudflare\references\workers-for-platforms\README.md
.agents\skills\cloudflare\references\workers-playground\README.md
.agents\skills\cloudflare\references\workers-vpc\README.md
.agents\skills\cloudflare\references\workflows\README.md
.agents\skills\cloudflare\references\zaraz\README.md
.agents\skills\codebase-design\agents\openai.yaml
.agents\skills\diagnosing-bugs\agents\openai.yaml
.agents\skills\domain-modeling\agents\openai.yaml
.agents\skills\expo-animation\agents\openai.yaml
.agents\skills\expo-data-fetching\agents\openai.yaml
.agents\skills\expo-design-system\agents\openai.yaml
.agents\skills\expo-examples\agents\openai.yaml
.agents\skills\expo-overview\agents\openai.yaml
.agents\skills\expo-project-structure\agents\openai.yaml
.agents\skills\expo-router\agents\openai.yaml
.agents\skills\expo-upgrade\agents\openai.yaml
.agents\skills\grill-with-docs\agents\openai.yaml
.agents\skills\handoff\agents\openai.yaml
.agents\skills\prototype\agents\openai.yaml
.agents\skills\react-native-best-practices\agents\openai.yaml
.agents\skills\research\agents\openai.yaml
.agents\skills\supabase-postgres-best-practices\references\schema-constraints.md
.agents\skills\supabase-postgres-best-practices\references\schema-data-types.md
.agents\skills\supabase-postgres-best-practices\references\schema-foreign-key-indexes.md
.agents\skills\supabase-postgres-best-practices\references\schema-lowercase-identifiers.md
.agents\skills\supabase-postgres-best-practices\references\schema-partitioning.md
.agents\skills\supabase-postgres-best-practices\references\schema-primary-keys.md
.agents\skills\upgrading-react-native\agents\openai.yaml
apps\api\.tmp-test\api.test.js
apps\api\.tmp-test\modules\catalog\catalog-service.test.js
apps\api\.tmp-test\modules\catalog\domain\catalog-state.test.js
apps\api\.tmp-test\modules\media\domain\media-state.test.js
apps\api\.tmp-test\modules\media\http.test.js
apps\api\src\api.test.ts
apps\api\src\modules\ai\application\ai-pipeline-service.test.ts
apps\api\src\modules\ai\application\ai-review-service.test.ts
apps\api\src\modules\ai\composition.test.ts
apps\api\src\modules\ai\domain\ai-job.test.ts
apps\api\src\modules\ai\domain\ai-validation-pipeline.test.ts
apps\api\src\modules\ai\http.test.ts
apps\api\src\modules\ai\infrastructure\postgres-ai-repository.test.ts
apps\api\src\modules\ai\README.md
apps\api\src\modules\audit\README.md
apps\api\src\modules\catalog\catalog-approve.test.ts
apps\api\src\modules\catalog\catalog-lifecycle.test.ts
apps\api\src\modules\catalog\catalog-lifecycle-http.test.ts
apps\api\src\modules\catalog\catalog-published-read.test.ts
apps\api\src\modules\catalog\catalog-service.test.ts
apps\api\src\modules\catalog\composition.test.ts
apps\api\src\modules\catalog\domain\catalog-publish.test.ts
apps\api\src\modules\catalog\domain\catalog-state.test.ts
apps\api\src\modules\catalog\http.test.ts
apps\api\src\modules\catalog\infrastructure\postgres-catalog-repository.test.ts
apps\api\src\modules\catalog\README.md
apps\api\src\modules\discovery\discovery-journey.test.ts
apps\api\src\modules\discovery\discovery-journey.test.ts.20261022-095305.bak
apps\api\src\modules\discovery\domain\discovery-query.test.ts
apps\api\src\modules\discovery\README.md
apps\api\src\modules\identity\auth-http.test.ts
apps\api\src\modules\identity\composition.test.ts
apps\api\src\modules\identity\identity.test.ts
apps\api\src\modules\identity\infrastructure\argon2-driver.test.ts
apps\api\src\modules\identity\infrastructure\password.test.ts
apps\api\src\modules\identity\README.md
apps\api\src\modules\inquiry\infrastructure\postgres-inquiry-repository.test.ts
apps\api\src\modules\inquiry\inquiry-journey.test.ts
apps\api\src\modules\inquiry\README.md
apps\api\src\modules\media\application\media-service.test.ts
apps\api\src\modules\media\domain\media-state.test.ts
apps\api\src\modules\media\domain\media-verification.test.ts
apps\api\src\modules\media\http.test.ts
apps\api\src\modules\media\infrastructure\postgres-media-repository.test.ts
apps\api\src\modules\media\README.md
apps\api\src\modules\review\composition.test.ts
apps\api\src\modules\review\domain\review-readiness.test.ts
apps\api\src\modules\review\http.test.ts
apps\api\src\modules\review\README.md
apps\api\src\modules\review\review-publish.test.ts
apps\api\src\modules\sync\README.md
apps\api\src\shared\auth\session.test.ts
apps\api\src\shared\persistence\postgres-connection.test.ts
apps\api\src\shared\persistence\postgres-database.test.ts
apps\api\src\shared\ratelimit\in-memory-rate-limiter.test.ts
apps\api\tmp\wrangler-dry-run\README.md
apps\api\wrangler.jsonc
apps\api\wrangler-config.test.ts
apps\mobile\README.md
apps\mobile\src\features\auth\auth-state.test.ts
apps\mobile\src\features\discovery\discovery-display.test.ts
apps\mobile\src\features\inquiry\inquiry-navigation.test.ts
apps\mobile\src\features\review\review-decision.test.ts
apps\mobile\src\network\auth-transport.test.ts
apps\mobile\src\network\discovery-transport.test.ts
apps\mobile\src\network\expo-file-byte-uploader.test.ts
apps\mobile\src\network\inquiry-transport.test.ts
apps\mobile\src\network\media-sync-transport.test.ts
apps\mobile\src\network\product-sync-transport.test.ts
apps\mobile\src\network\review-transport.test.ts
apps\mobile\src\security\redact-secrets.test.ts
apps\mobile\src\security\session-storage.test.ts
apps\mobile\src\sync\upload-outcome.test.ts
docs\architecture\architecture-baseline.md
infra\database\app-role.sql
infra\database\README.md
infra\docker\local-compose.yml
infra\migrations\001_catalog\migration.sql
infra\migrations\001_catalog\README.md
infra\migrations\002_media\migration.sql
infra\migrations\002_media\README.md
infra\migrations\003_catalog_idempotency.sql
infra\migrations\004_media_upload_verification.sql
infra\migrations\005_catalog_versions.sql
infra\migrations\006_ai_jobs_and_proposals.sql
infra\migrations\007_inquiries_and_published_search.sql
infra\migrations\008_identity_accounts_and_sessions.sql
infra\migrations\009_identity_refresh_grants.sql
infra\migrations\010_row_level_security.sql
M8_MIGRATION_009_DESIGN_REPORT.md
pnpm-lock.yaml
pnpm-workspace.yaml
README.md
scripts\verify-m8-identity-migration-postgres.ps1
scripts\verify-m9-identity-migration-postgres.ps1
tests\m10-auth-postgres\auth-postgres-runtime.test.ts
tests\m1-storage\storage-runtime.test.ts
tests\m2-account-isolation\account-isolation-runtime.test.ts
tests\m2-media-upload\media-upload-pipeline-runtime.test.ts
tests\m2-media-upload\media-upload-runtime.test.ts
tests\m2-media-upload\media-upload-storage-runtime.test.ts
tests\m2-product-sync\product-sync-runtime.test.ts
tests\m3-catalog-lifecycle\catalog-lifecycle-postgres-runtime.test.ts
tests\m4-ai-pipeline\ai-pipeline-postgres-runtime.test.ts
tests\m5-review-publish\review-publish-postgres-runtime.test.ts
tests\m5-review-publish\review-screen-transport-identity.test.ts
tests\m6-buyer-journey\buyer-journey-postgres-runtime.test.ts
tests\m8-actor-isolation\actor-isolation-runtime.test.ts
tests\m8-db-wiring\db-wiring-runtime.test.ts
tests\m8-unauthenticated-401\unauthenticated-401-runtime.test.ts
tests\rls-policy\rls-policy-postgres-runtime.test.ts

## 7. Relevant documentation excerpts

### .agents\skills\cloudflare\references\ai-gateway\README.md
# Cloudflare AI Gateway

Use AI Gateway to observe and control requests to AI providers through caching, rate limiting, logging, and routing.

Fetch the linked documentation before choosing endpoints, authentication headers, SDK options, model names, or limits. Keep implementation details in the current docs.

## Choose a task

| Task | Reference |
|------|-----------|
| Create a gateway or choose authentication and provider credentials | [Configuration](./configuration.md) |
| Integrate an SDK, direct HTTP, or a Worker binding | [SDK integration](./sdk-integration.md) |
| Configure caching, rate limits, security, billing, or logging | [Features](./features.md) |
| Add fallbacks, conditional routing, or traffic splits | [Dynamic routing](./dynamic-routing.md) |
| Diagnose failed requests, caching, or missing logs | [Troubleshooting](./troubleshooting.md) |

For new single-model calls, start with the [REST API](https://developers.cloudflare.com/ai-gateway/usage/rest-api/) or [Workers bindings](https://developers.cloudflare.com/ai-gateway/usage/worker-binding-methods/), depending on the runtime. Preserve provider-native integrations when their API shape is needed; use the corresponding [provider guide](https://developers.cloudflare.com/ai-gateway/usage/providers/).

The [legacy Unified API](https://developers.cloudflare.com/ai-gateway/usage/chat-completion/) is deprecated for single-model calls but remains required for dynamic routes. Check the task before changing an existing endpoint.

Gateway authentication and upstream provider credentials are separate concerns. Choose the endpoint first, then follow its authentication and billing requirements in [configuration](./configuration.md).

## Related references

- [Workers AI](../workers-ai/README.md) â€” model inference.
- [Agents SDK documentation](https://developers.cloudflare.com/agents/) â€” stateful agents.
- [Vectorize](../vectorize/README.md) â€” vector search.

### .agents\skills\cloudflare\references\ai-search\README.md
# Cloudflare AI Search

Use AI Search for managed content indexing and retrieval, with optional answer generation. Start with [How AI Search works](https://developers.cloudflare.com/ai-search/concepts/how-ai-search-works/).

## Choose the right product

- **Managed search or RAG over your content:** AI Search.
- **Custom embeddings and vector-index management:** [Vectorize](../vectorize/README.md).
- **Model inference without a managed retrieval pipeline:** [Workers AI](../workers-ai/README.md).

For freshness requirements, read [Syncing](https://developers.cloudflare.com/ai-search/configuration/indexing/syncing/) for your data source before choosing an architecture. Use the current [limits and pricing](https://developers.cloudflare.com/ai-search/platform/limits-pricing/) instead of assuming a fixed indexing interval or account limit.

## Find the right documentation

Read the linked page before implementing; these references route to the maintained documentation instead of copying API examples or configuration.

| Task | Start here |
|------|------------|
| Build a new Worker integration | [Workers binding quick start](https://developers.cloudflare.com/ai-search/get-started/workers/) |
| Choose an API or maintain an existing integration | [API routes](api.md) |
| Connect data, configure indexing, or manage environments | [Configuration routes](configuration.md) |
| Choose retrieval, generation, or tenant isolation patterns | [Pattern routes](patterns.md) |
| Diagnose indexing, authentication, filters, or limits | [Troubleshooting routes](gotchas.md) |

Existing `env.AI.autorag()` integrations can continue to work. Use the [migration guide](https://developers.cloudflare.com/ai-search/api/migration/workers-binding/) when upgrading; migration is not required just to maintain an existing integration.

### .agents\skills\cloudflare\references\analytics-engine\README.md
# Cloudflare Workers Analytics Engine Reference

Expert guidance for implementing unlimited-cardinality analytics at scale using Cloudflare Workers Analytics Engine.

## What is Analytics Engine?

Time-series analytics database designed for high-cardinality data (millions of unique dimensions). Write data points from Workers, query via SQL API. Use for:
- Custom user-facing analytics dashboards
- Usage-based billing & metering
- Per-customer/per-feature monitoring
- High-frequency instrumentation without performance impact

**Key Capability:** Track metrics with unlimited unique values (e.g., millions of user IDs, API keys) without performance degradation.

## Core Concepts

| Concept | Description | Example |
|---------|-------------|---------|
| **Dataset** | Logical table for related metrics | `api_requests`, `user_events` |
| **Data Point** | Single measurement with timestamp | One API request's metrics |
| **Blobs** | String dimensions (max 20) | endpoint, method, status, user_id |
| **Doubles** | Numeric values (max 20) | latency_ms, request_count, bytes |
| **Indexes** | Filtered blobs for efficient queries | customer_id, api_key |

## Reading Order

| Task | Start Here | Then Read |
|------|------------|-----------|
| **First-time setup** | [configuration.md](configuration.md) â†’ [api.md](api.md) â†’ [patterns.md](patterns.md) | |
| **Writing data** | [api.md](api.md) â†’ [gotchas.md](gotchas.md) (sampling) | |
| **Querying data** | [api.md](api.md) (SQL API) â†’ [patterns.md](patterns.md) (examples) | |
| **Debugging** | [gotchas.md](gotchas.md) â†’ [api.md](api.md) (limits) | |
| **Optimization** | [patterns.md](patterns.md) (anti-patterns) â†’ [gotchas.md](gotchas.md) | |

## When to Use Analytics Engine

```
Need to track metrics? â†’ Yes
  â†“
Millions of unique dimension values? â†’ Yes
    â†“
  Need real-time queries? â†’ Yes
      â†“
    Use Analytics Engine âœ“

Alternative scenarios:
- Low cardinality (<10k unique values) â†’ Workers Analytics (free tier)
- Complex joins/relations â†’ D1 Database
- Logs/debugging â†’ Tail Workers (logpush)
- External tools â†’ Send to external analytics (Datadog, etc.)
```

## Quick Start

1. Add binding to `wrangler.jsonc`:
```jsonc
{
  "analytics_engine_datasets": [
    { "binding": "ANALYTICS", "dataset": "my_events" }
  ]
}
```

2. Write data points (fire-and-forget, no await):
```typescript
env.ANALYTICS.writeDataPoint({
  blobs: ["/api/users", "GET", "200"],
  doubles: [145.2, 1],  // latency_ms, count
  indexes: [customerId]
});
```

3. Query via SQL API (HTTP):
```sql
SELECT blob1, SUM(double2) AS total_requests
FROM my_events
WHERE index1 = 'customer_123'
  AND timestamp >= NOW() - INTERVAL '7' DAY
GROUP BY blob1
ORDER BY total_requests DESC
```

## In This Reference

- **[configuration.md](configuration.md)** - Setup, bindings, TypeScript types, limits
- **[api.md](api.md)** - `writeDataPoint()`, SQL API, query syntax
- **[patterns.md](patterns.md)** - Use cases, examples, anti-patterns
- **[gotchas.md](gotchas.md)** - Sampling, index selection, troubleshooting

## See Also

- [Cloudflare Analytics Engine Docs](https://developers.cloudflare.com/analytics/analytics-engine/)
- [GraphQL Analytics API Reference](../graphql-api/) - Query built-in Cloudflare analytics (HTTP, Workers, DNS, Firewall, etc.)
- [Observability Reference](../observability/) - Workers Logs, Traces, and real-time debugging

### .agents\skills\cloudflare\references\api\README.md
# Cloudflare API Integration

Guide for working with Cloudflare's REST API - authentication, SDK usage, common patterns, and troubleshooting.

## Quick Decision Tree

```
How are you calling the Cloudflare API?
â”œâ”€ From Workers runtime â†’ Use bindings, not REST API (see ../bindings/)
â”œâ”€ Server-side (Node/Python/Go) â†’ Official SDK (see api.md)
â”œâ”€ CLI/scripts â†’ Wrangler or curl (see configuration.md)
â”œâ”€ Infrastructure-as-code â†’ See ../pulumi/ or ../terraform/
â””â”€ One-off requests â†’ curl examples (see api.md)
```

## SDK Selection

| Language | Package | Best For | Default Retries |
|----------|---------|----------|-----------------|
| TypeScript | `cloudflare` | Node.js, Bun, Next.js, Workers | 2 |
| Python | `cloudflare` | FastAPI, Django, scripts | 2 |
| Go | `cloudflare-go/v4` | CLI tools, microservices | 10 |

All SDKs are Stainless-generated from OpenAPI spec (consistent APIs).

## Authentication Methods

| Method | Security | Use Case | Scope |
|--------|----------|----------|-------|
| **API Token** âœ“ | Scoped, rotatable | Production | Per-zone or account |
| API Key + Email | Full account access | Legacy only | Everything |
| User Service Key | Limited | Origin CA certs only | Origin CA |

**Always use API tokens** for new projects.

## Rate Limits

| Limit | Value |
|-------|-------|
| Per user/token | 1200 requests / 5 minutes |
| Per IP | 200 requests / second |
| GraphQL | 320 / 5 minutes (cost-based) |

## Reading Order

| Task | Files to Read |
|------|---------------|
| Initialize SDK client | api.md |
| Configure auth/timeout/retry | configuration.md |
| Find usage patterns | patterns.md |
| Debug errors/rate limits | gotchas.md |
| Product-specific APIs | [Workers docs](https://developers.cloudflare.com/workers/), ../r2/, ../kv/, etc. |

## In This Reference

- **[api.md](api.md)** - SDK client initialization, pagination, error handling, examples
- **[configuration.md](configuration.md)** - Environment variables, SDK config, Wrangler setup
- **[patterns.md](patterns.md)** - Real-world patterns, batch operations, workflows
- **[gotchas.md](gotchas.md)** - Rate limits, SDK-specific issues, troubleshooting

## See Also

- [Cloudflare API Docs](https://developers.cloudflare.com/api/)
- [Bindings Reference](../bindings/) - Workers runtime bindings (preferred over REST API)
- [Wrangler Reference](https://developers.cloudflare.com/workers/wrangler/) - CLI tool for Cloudflare development
- [GraphQL Analytics API Reference](../graphql-api/) - Analytics data via GraphQL (separate endpoint from REST API)

### .agents\skills\cloudflare\references\api-shield\README.md
# Cloudflare API Shield Reference

Expert guidance for API Shield - comprehensive API security suite for discovery, protection, and monitoring.

## Reading Order

| Task | Files to Read |
|------|---------------|
| Initial setup | README â†’ configuration.md |
| Implement JWT validation | configuration.md â†’ api.md |
| Add schema validation | configuration.md â†’ patterns.md |
| Detect API attacks | patterns.md â†’ api.md |
| Debug issues | gotchas.md |

## Feature Selection

What protection do you need?

```
â”œâ”€ Validate request/response structure â†’ Schema Validation 2.0 (configuration.md)
â”œâ”€ Verify auth tokens â†’ JWT Validation (configuration.md)
â”œâ”€ Client certificates â†’ mTLS (configuration.md)
â”œâ”€ Detect BOLA attacks â†’ BOLA Detection (patterns.md)
â”œâ”€ Track auth coverage â†’ Auth Posture (patterns.md)
â”œâ”€ Stop volumetric abuse â†’ Abuse Detection (patterns.md)
â””â”€ Discover shadow APIs â†’ API Discovery (api.md)
```

## In This Reference

- **[configuration.md](configuration.md)** - Setup, session identifiers, rules, token/mTLS configs
- **[api.md](api.md)** - Endpoint management, discovery, validation APIs, GraphQL operations
- **[patterns.md](patterns.md)** - Common patterns, progressive rollout, OWASP mappings, workflows
- **[gotchas.md](gotchas.md)** - Troubleshooting, false positives, performance, best practices

## Quick Start

API Shield: Enterprise-grade API security (Discovery, Schema Validation 2.0, JWT, mTLS, BOLA Detection, Auth Posture). Available as Enterprise add-on with preview access.

## See Also

- [API Shield Docs](https://developers.cloudflare.com/api-shield/)
- [API Reference](https://developers.cloudflare.com/api/resources/api_gateway/)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)

### .agents\skills\cloudflare\references\argo-smart-routing\README.md
# Cloudflare Argo Smart Routing Skill Reference

## Overview

Cloudflare Argo Smart Routing is a performance optimization service that detects real-time network issues and routes web traffic across the most efficient network path. It continuously monitors network conditions and intelligently routes traffic through the fastest, most reliable routes in Cloudflare's network.

**Note on Smart Shield:** Argo Smart Routing is being integrated into Cloudflare's Smart Shield product for enhanced DDoS protection and performance. Existing Argo customers maintain full functionality with gradual migration to Smart Shield features.

## Quick Start

### Enable via cURL
```bash
curl -X PATCH "https://api.cloudflare.com/client/v4/zones/{zone_id}/argo/smart_routing" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value": "on"}'
```

### Enable via TypeScript SDK
```typescript
import Cloudflare from 'cloudflare';

const client = new Cloudflare({ apiToken: process.env.CLOUDFLARE_API_TOKEN });

const result = await client.argo.smartRouting.edit({
  zone_id: 'your-zone-id',
  value: 'on',
});

console.log(`Argo enabled: ${result.value}`);
```

## Core Concepts

### What It Does
- **Intelligent routing**: Detects congestion, outages, packet loss in real-time
- **Global optimization**: Routes across 300+ Cloudflare data centers
- **Automatic failover**: Switches paths when issues detected (typically <1s)
- **Works with existing setup**: No origin changes required

### Billing Model
- Usage-based: Charged per GB of traffic (excluding DDoS/WAF mitigated traffic)
- Requires billing configuration before enabling
- Available on Enterprise+ plans (check zone eligibility)

### When to Use
- **High-traffic production sites** with global user base
- **Latency-sensitive applications** (APIs, real-time services)
- **Sites behind Cloudflare proxy** (orange-clouded DNS records)
- **Combined with Tiered Cache** for maximum performance gains

### When NOT to Use
- Development/staging environments (cost control)
- Low-traffic sites (<1TB/month) where cost may exceed benefit
- Sites with primarily single-region traffic

## Should I Enable Argo?

| Your Situation | Recommendation |
|----------------|----------------|
| Global production app, >1TB/month traffic | âœ… Enable - likely ROI positive |
| Enterprise plan, latency-critical APIs | âœ… Enable - performance matters |
| Regional site, <100GB/month traffic | âš ï¸ Evaluate - cost may not justify |
| Development/staging environment | âŒ Disable - use in production only |
| Not yet configured billing | âŒ Configure billing first |

## Reading Order by Task

| Your Goal | Start With | Then Read |
|-----------|------------|-----------|
| Enable Argo for first time | Quick Start above â†’ [configuration.md](configuration.md) | [gotchas.md](gotchas.md) |
| Use TypeScript/Python SDK | [api.md](api.md) | [patterns.md](patterns.md) |
| Terraform/IaC setup | [configuration.md](configuration.md) | - |
| Enable for Spectrum TCP app | [patterns.md](patterns.md) â†’ Spectrum section | [api.md](api.md) |
| Troubleshoot enablement issue | [gotchas.md](gotchas.md) | [api.md](api.md) |
| Manage billing/usage | [patterns.md](patterns.md) â†’ Billing section | [gotchas.md](gotchas.md) |

## In This Reference

- **[api.md](api.md)** - API endpoints, SDK methods, error handling, Python/TypeScript examples
- **[configuration.md](configuration.md)** - Terraform setup, environment config, billing configuration
- **[patterns.md](patterns.md)** - Tiered Cache integration, Spectrum TCP apps, billing management, validation patterns
- **[gotchas.md](gotchas.md)** - Common errors, permission issues, limits, best practices

## See Also

- [Cloudflare Argo Smart Routing Docs](https://developers.cloudflare.com/argo-smart-routing/)
- [Cloudflare Smart Shield](https://developers.cloudflare.com/smart-shield/)
- [Spectrum Documentation](https://developers.cloudflare.com/spectrum/)
- [Tiered Cache](https://developers.cloudflare.com/cache/how-to/tiered-cache/)

### .agents\skills\cloudflare\references\artifacts\README.md
# Cloudflare Artifacts

Store versioned file trees behind a repo-style interface that works from Workers, the REST API, and Git-compatible tooling.

## Overview

Use **Artifacts** when the thing you need to store is a versioned filesystem tree rather than a single object, key, or SQL row.

Typical Artifacts use cases:
- Git-style repositories
- Per-agent, per-session, or per-task repos
- Build outputs and deployment bundles
- Checkpoints and generated assets
- Shared file trees passed between developer tools and Workers

Artifacts is a good fit when the same content needs to be addressable from **Workers**, the **REST API**, and **Git-compatible clients**.

Artifacts is especially useful for agent and automation workflows where each unit of work should have its own isolated repo and token.

**Prefer retrieval over memory** for current availability, authentication details, route shapes, limits, and pricing. Start at `https://developers.cloudflare.com/artifacts/`.

## When to Use Artifacts

| Need | Use | Why |
|------|-----|-----|
| Versioned file trees such as repos, build outputs, checkpoints, or generated assets | Artifacts | Artifacts stores and shares **versioned filesystem content** |
| A git-compatible workflow with `clone`, `fetch`, `pull`, or `push` | Artifacts | Artifacts exposes **git-over-HTTPS remotes** and repo-scoped tokens |
| The same artifact accessible from Workers, HTTP APIs, and developer tooling | Artifacts | Artifacts is available through a **Workers binding**, **REST API**, and **git-compatible interface** |
| Large files by object key, app config by key, or relational app data | R2, KV, or D1 | Use storage products directly when you need **objects, key-value entries, or SQL rows**, not versioned file trees |

## Recommended Workflow

- Create one repo per agent, session, user workspace, or task when work should stay isolated.
- Fork from a stable baseline when many repos need the same starter files or prompts.
- Use branches only when collaborators share the same lifecycle and need to work in one repo.
- Use namespaces to separate environments, teams, or high-rate workloads.

## Quick Start

**From a Worker:**

```typescript
interface Env {
  ARTIFACTS: Artifacts;
}

const created = await env.ARTIFACTS.create("starter-repo");
// created.remote -> git remote URL
// created.token -> initial repo token
```

**From the REST API:**

Use the namespace-scoped Artifacts base URL plus a gateway JWT. For imports from existing HTTPS remotes, use the REST API rather than the Workers binding.

## Reading Order

| Task | Read |
|------|------|
| Decide whether Artifacts is the right product | README only |
| Create or manage repos from a Worker | README â†’ configuration.md â†’ api.md |
| Integrate Artifacts from an external system | README â†’ api.md |
| Set up agent or sandbox workflows | README â†’ configuration.md |
| Verify exact auth, routes, limits, or pricing | Live docs first: `https://developers.cloudflare.com/artifacts/` |

## In This Reference

- **[api.md](api.md)** - Workers binding methods, REST routes, token and repo operations
- **[configuration.md](configuration.md)** - Wrangler binding shape, Worker typing, REST configuration guidance

## See Also

- [Cloudflare Artifacts Docs](https://developers.cloudflare.com/artifacts/)
- [Artifacts Git Protocol Docs](https://developers.cloudflare.com/artifacts/api/git-protocol/)
- [ArtifactFS Docs](https://developers.cloudflare.com/artifacts/guides/artifact-fs/)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Cloudflare Durable Objects Docs](https://developers.cloudflare.com/durable-objects/)
- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)
- [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)

### .agents\skills\cloudflare\references\bindings\README.md
# Cloudflare Workers Bindings

Bindings grant a Worker access to configured resources through its environment. Prefer a product's binding for supported operations inside Workers; use the REST API when the caller or operation requires it.

Read the relevant current documentation before implementing. These references route to maintained APIs and configuration rather than copying binding catalogs, type tables, or limits.

## Start here

- [Bindings overview and catalog](https://developers.cloudflare.com/workers/runtime-apis/bindings/): capability model, available products, environment access, and binding lifecycle.
- [Storage options](https://developers.cloudflare.com/workers/platform/storage-options/): choose storage from consistency, query, and coordination requirements.
- [api.md](./api.md): environment access, generated types, and product APIs.
- [configuration.md](./configuration.md): binding configuration, environments, secrets, and local development.
- [patterns.md](./patterns.md): Worker-to-Worker calls, testing, and resource selection.
- [gotchas.md](./gotchas.md): missing bindings, stale clients, development differences, and limits.

Treat each binding as a capability granted to code. Select only the resources the Worker needs, and confirm which environment and resource each binding targets before using it.

### .agents\skills\cloudflare\references\bot-management\README.md
# Cloudflare Bot Management

Enterprise-grade bot detection, protection, and mitigation using ML/heuristics, bot scores, JavaScript detections, and verified bot handling.

## Overview

Bot Management provides multi-tier protection:
- **Free (Bot Fight Mode)**: Auto-blocks definite bots, no config
- **Pro/Business (Super Bot Fight Mode)**: Configurable actions, static resource protection, analytics groupings
- **Enterprise (Bot Management)**: Granular 1-99 scores, WAF integration, JA3/JA4 fingerprinting, Workers API, Advanced Analytics

## Quick Start

```txt
# Dashboard: Security > Bots
# Enterprise: Deploy rule template
(cf.bot_management.score eq 1 and not cf.bot_management.verified_bot) â†’ Block
(cf.bot_management.score le 29 and not cf.bot_management.verified_bot) â†’ Managed Challenge
```

## What Do You Need?

```txt
â”œâ”€ Initial setup â†’ configuration.md
â”‚   â”œâ”€ Free tier â†’ "Bot Fight Mode"
â”‚   â”œâ”€ Pro/Business â†’ "Super Bot Fight Mode"
â”‚   â””â”€ Enterprise â†’ "Bot Management for Enterprise"
â”œâ”€ Workers API integration â†’ api.md
â”œâ”€ WAF rules â†’ patterns.md
â”œâ”€ Debugging â†’ gotchas.md
â””â”€ Analytics â†’ api.md#bot-analytics
```

## Reading Order

| Task | Files to Read |
|------|---------------|
| Enable bot protection | README â†’ configuration.md |
| Workers bot detection | README â†’ api.md |
| WAF rule templates | README â†’ patterns.md |
| Debug bot issues | gotchas.md |
| Advanced analytics | api.md#bot-analytics |

## Core Concepts

**Bot Scores**: 1-99 (1 = definitely automated, 99 = definitely human). Threshold: <30 indicates bot traffic. Enterprise gets granular 1-99; Pro/Business get groupings only.

**Detection Engines**: Heuristics (known fingerprints, assigns score=1), ML (majority of detections, supervised learning on billions of requests), Anomaly Detection (optional, baseline traffic analysis), JavaScript Detections (headless browser detection).

**Verified Bots**: Allowlisted good bots (search engines, AI crawlers) verified via reverse DNS or Web Bot Auth. Access via `cf.bot_management.verified_bot` or `cf.verified_bot_category`.

## Platform Limits

| Plan | Bot Scores | JA3/JA4 | Custom Rules | Analytics Retention |
|------|------------|---------|--------------|---------------------|
| Free | No (auto-block only) | No | 5 | N/A (no analytics) |
| Pro/Business | Groupings only | No | 20/100 | 30 days (72h at a time) |
| Enterprise | 1-99 granular | Yes | 1,000+ | 30 days (1 week at a time) |

## Basic Patterns

```typescript
// Workers: Check bot score
export default {
  async fetch(request: Request): Promise<Response> {
    const botScore = request.cf?.botManagement?.score;
    if (botScore && botScore < 30 && !request.cf?.botManagement?.verifiedBot) {
      return new Response('Bot detected', { status: 403 });
    }
    return fetch(request);
  }
};
```

```txt
# WAF: Block definite bots
(cf.bot_management.score eq 1 and not cf.bot_management.verified_bot)

# WAF: Protect sensitive endpoints
(cf.bot_management.score lt 50 and http.request.uri.path in {"/login" "/checkout"} and not cf.bot_management.verified_bot)
```

## In This Reference

- [configuration.md](./configuration.md) - Product tiers, WAF rule setup, JavaScript Detections, ML auto-updates
- [api.md](./api.md) - Workers BotManagement interface, WAF fields, JA4 Signals
- [patterns.md](./patterns.md) - E-commerce, API protection, mobile app allowlisting, SEO-friendly handling
- [gotchas.md](./gotchas.md) - False positives/negatives, score=0 issues, JSD limitations, CSP requirements

## See Also

- [waf](../waf/) - WAF custom rules for bot enforcement
- [workers](https://developers.cloudflare.com/workers/) - Workers request.cf.botManagement API
- [api-shield](../api-shield/) - API-specific bot protection

### .agents\skills\cloudflare\references\browser-rendering\README.md
# Browser Run (formerly Browser Rendering)

Use Browser Run for screenshots, PDFs, rendered content extraction, and browser automation. Read the relevant current documentation before implementing; use the [documentation index](https://developers.cloudflare.com/browser-run/llms.txt) to discover additional guides.

Choose the integration by the work and runtime:

- For a self-contained screenshot, PDF, or extraction, start with Quick Actions. They are available through REST and Workers bindings; check the chosen action's supported interface.
- For multi-step interactions or persistent state, use browser sessions. In Workers, use Cloudflare's Puppeteer or Playwright package; from external scripts or CI, use the CDP integration.
- When adapting existing automation, preserve its library where supported and check installed versions against the corresponding guide.

Read only the reference needed for the task:

| Task | Reference |
|------|-----------|
| Set up bindings, dependencies, or development | [configuration.md](configuration.md) |
| Select an endpoint or browser client API | [api.md](api.md) |
| Implement a workflow or manage reusable sessions | [patterns.md](patterns.md) |
| Diagnose failures or plan capacity and cost | [gotchas.md](gotchas.md) |

### .agents\skills\cloudflare\references\c3\README.md
# C3 (create-cloudflare)

Official CLI for scaffolding Cloudflare Workers and Pages projects with templates, TypeScript, and instant deployment.

## Quick Start

```bash
# Interactive (recommended for first-time)
npm create cloudflare@latest my-app

# Worker (API/WebSocket/Cron)
npm create cloudflare@latest my-api -- --type=hello-world --ts

# Pages (static/SSG)
npm create cloudflare@latest my-site -- --type=web-app --framework=astro --platform=pages
```

## Platform Decision Tree

```
What are you building?

â”œâ”€ API / WebSocket / Cron / Email handler
â”‚   â””â”€ Workers (default) - no --platform flag needed
â”‚       npm create cloudflare@latest my-api -- --type=hello-world

â”œâ”€ Static site / SSG / Documentation
â”‚   â””â”€ Pages - requires --platform=pages
â”‚       npm create cloudflare@latest my-site -- --type=web-app --framework=astro --platform=pages

â”œâ”€ Full-stack app (Next.js/Remix/SvelteKit)
â”‚   â””â”€ Follow the current framework guide below

â””â”€ Convert existing project
    â””â”€ npm create cloudflare@latest . -- --type=pre-existing --existing-script=./src/worker.ts
```

**Critical:** Pages projects require `--platform=pages` flag. Without it, C3 defaults to Workers.

## Framework Setup

Fetch the [Workers framework guide](https://developers.cloudflare.com/workers/framework-guides/) for the chosen framework before scaffolding or adapting an existing app. For Next.js, follow [Next.js on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/); use the [Pages static export guide](https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/) only when targeting a Next.js static export on Pages.

## Interactive Flow

When run without flags, C3 prompts in this order:

1. **Project name** - Directory to create (defaults to current dir with `.`)
2. **Application type** - `hello-world`, `web-app`, `demo`, `pre-existing`, `remote-template`
3. **Platform** - `workers` (default) or `pages` (for web apps only)
4. **Framework** - If web-app: `next`, `remix`, `astro`, `react-router`, `solid`, `svelte`, etc.
5. **TypeScript** - `yes` (recommended) or `no`
6. **Git** - Initialize repository? `yes` or `no`
7. **Deploy** - Deploy now? `yes` or `no` (requires `wrangler login`)

## Installation Methods

```bash
# NPM
npm create cloudflare@latest

# Yarn
yarn create cloudflare

# PNPM
pnpm create cloudflare@latest
```

## In This Reference

| File | Purpose | Use When |
|------|---------|----------|
| **api.md** | Complete CLI flag reference | Scripting, CI/CD, advanced usage |
| **configuration.md** | Generated files, bindings, types | Understanding output, customization |
| **patterns.md** | Workflows, CI/CD, monorepos | Real-world integration |
| **gotchas.md** | Troubleshooting failures | Deployment blocked, errors |

## Reading Order

| Task | Read |
|------|------|
| Create first project | README only |
| Set up CI/CD | README â†’ api â†’ patterns |
| Debug failed deploy | gotchas |
| Understand generated files | configuration |
| Full CLI reference | api |
| Create custom template | patterns â†’ configuration |
| Convert existing project | README â†’ patterns |

## Post-Creation

```bash
cd my-app

# Local dev with hot reload
npm run dev

# Generate TypeScript types for bindings
npm run cf-typegen

# Deploy to Cloudflare
npm run deploy
```

## See Also

- **workers/README.md** - Workers runtime, bindings, APIs
- **workers-ai/README.md** - AI/ML models
- **pages/README.md** - Pages-specific features
- **wrangler/README.md** - Wrangler CLI beyond initial setup
- **d1/README.md** - SQLite database
- **r2/README.md** - Object storage

### .agents\skills\cloudflare\references\cache-reserve\README.md
# Cloudflare Cache Reserve

**Persistent cache storage built on R2 for long-term content retention**

## Smart Shield Integration

Cache Reserve is part of **Smart Shield**, Cloudflare's comprehensive security and performance suite:

- **Smart Shield Advanced tier**: Includes 2TB Cache Reserve storage
- **Standalone purchase**: Available separately if not using Smart Shield
- **Migration**: Existing standalone customers can migrate to Smart Shield bundles

**Decision**: Already on Smart Shield Advanced? Cache Reserve is included. Otherwise evaluate standalone purchase vs Smart Shield upgrade.

## Overview

Cache Reserve is Cloudflare's persistent, large-scale cache storage layer built on R2. It acts as the ultimate upper-tier cache, storing cacheable content for extended periods (30+ days) to maximize cache hits, reduce origin egress fees, and shield origins from repeated requests for long-tail content.

## Core Concepts

### What is Cache Reserve?

- **Persistent storage layer**: Built on R2, sits above tiered cache hierarchy
- **Long-term retention**: 30-day default retention, extended on each access
- **Automatic operation**: Works seamlessly with existing CDN, no code changes required
- **Origin shielding**: Dramatically reduces origin egress by serving cached content longer
- **Usage-based pricing**: Pay only for storage + read/write operations

### Cache Hierarchy

```
Visitor Request
    â†“
Lower-Tier Cache (closest to visitor)
    â†“ (on miss)
Upper-Tier Cache (closest to origin)
    â†“ (on miss)
Cache Reserve (R2 persistent storage)
    â†“ (on miss)
Origin Server
```

### How It Works

1. **On cache miss**: Content fetched from origin ï¿½ï¿½ written to Cache Reserve + edge caches simultaneously
2. **On edge eviction**: Content may be evicted from edge cache but remains in Cache Reserve
3. **On subsequent request**: If edge cache misses but Cache Reserve hits â†’ content restored to edge caches
4. **Retention**: Assets remain in Cache Reserve for 30 days since last access (configurable via TTL)

## When to Use Cache Reserve

```
Need persistent caching?
â”œâ”€ High origin egress costs â†’ Cache Reserve âœ“
â”œâ”€ Long-tail content (archives, media libraries) â†’ Cache Reserve âœ“
â”œâ”€ Already using Smart Shield Advanced â†’ Included! âœ“
â”œâ”€ Video streaming with seeking (range requests) â†’ âœ— Not supported
â”œâ”€ Dynamic/personalized content â†’ âœ— Use edge cache only
â”œâ”€ Need per-request cache control from Workers â†’ âœ— Use R2 directly
â””â”€ Frequently updated content (< 10hr lifetime) â†’ âœ— Not eligible
```

## Asset Eligibility

Cache Reserve only stores assets meeting **ALL** criteria:

- Cacheable per Cloudflare's standard rules
- Minimum 10-hour TTL (36000 seconds)
- `Content-Length` header present
- Original files only (not transformed images)

### Eligibility Checklist

Use this checklist to verify if an asset is eligible:

- [ ] Zone has Cache Reserve enabled
- [ ] Zone has Tiered Cache enabled (required)
- [ ] Asset TTL â‰¥ 10 hours (36,000 seconds)
- [ ] `Content-Length` header present on origin response
- [ ] No `Set-Cookie` header (or uses private directive)
- [ ] `Vary` header is NOT `*` (can be `Accept-Encoding`)
- [ ] Not an image transformation variant (original images OK)
- [ ] Not a range request (no HTTP 206 support)
- [ ] Not O2O (Orange-to-Orange) proxied request

**All boxes must be checked for Cache Reserve eligibility.**

### Not Eligible

- Assets with TTL < 10 hours
- Responses without `Content-Length` header
- Image transformation variants (original images are eligible)
- Responses with `Set-Cookie` headers
- Responses with `Vary: *` header
- Assets from R2 public buckets on same zone
- O2O (Orange-to-Orange) setup requests
- **Range requests** (video seeking, partial content downloads)

## Quick Start

```bash
# Enable via Dashboard
https://dash.cloudflare.com/caching/cache-reserve
# Click "Enable Storage Sync" or "Purchase" button
```

**Prerequisites:**
- Paid Cache Reserve plan or Smart Shield Advanced required
- Tiered Cache required for optimal performance

## Essential Commands

```bash
# Check Cache Reserve status
curl -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/cache/cache_reserve" \
  -H "Authorization: Bearer $API_TOKEN"

# Enable Cache Reserve
curl -X PATCH "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/cache/cache_reserve" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value": "on"}'

# Check asset cache status
curl -I https://example.com/asset.jpg | grep -i cache
```

## In This Reference

| Task | Files |
|------|-------|
| Evaluate if Cache Reserve fits your use case | README.md (this file) |
| Enable Cache Reserve for your zone | README.md + [configuration.md](./configuration.md) |
| Use with Workers (understand limitations) | [api.md](./api.md) |
| Setup via SDKs or IaC (TypeScript, Python, Terraform) | [configuration.md](./configuration.md) |
| Optimize costs and debug issues | [patterns.md](./patterns.md) + [gotchas.md](./gotchas.md) |
| Understand eligibility and troubleshoot | [gotchas.md](./gotchas.md) â†’ [patterns.md](./patterns.md) |

**Files:**
- [configuration.md](./configuration.md) - Setup, API, SDKs, and Cache Rules
- [api.md](./api.md) - Purging, monitoring, Workers integration
- [patterns.md](./patterns.md) - Best practices, cost optimization, debugging
- [gotchas.md](./gotchas.md) - Common issues, limitations, troubleshooting

## See Also
- [r2](../r2/) - Cache Reserve built on R2 storage
- [workers](https://developers.cloudflare.com/workers/) - Workers integration with Cache API

### .agents\skills\cloudflare\references\containers\README.md
# Cloudflare Containers

Use this reference for containerized applications on the Workers platform, including container-enabled Durable Objects, lifecycle management, and request routing.

## Choose the runtime

Use [Containers](https://developers.cloudflare.com/containers/) for existing container images, custom runtimes, system dependencies, full filesystem access, or workloads needing additional CPU and memory. Use [Workers](https://developers.cloudflare.com/workers/) when the application fits the Workers runtime without those requirements.

Containers are controlled through [Durable Objects](https://developers.cloudflare.com/durable-objects/). An instance's identity does not make its filesystem persistent: design for restarts and store durable data outside the container disk. Read [Container lifecycle](https://developers.cloudflare.com/containers/concepts/architecture/) and [Container interface](https://developers.cloudflare.com/containers/reference/container-class/) for the relationship between the process, its Durable Object, and persistent storage.

## Find the documentation for the task

Read the linked page before writing code or configuration; use its current API, examples, and constraints rather than reconstructing them from memory.

| Task | Start here |
| --- | --- |
| Create a project and deploy the first container | [Get started](https://developers.cloudflare.com/containers/get-started/) |
| Configure images, bindings, instance sizes, and deployments | [Configuration](configuration.md) |
| Control startup, requests, lifecycle, and scheduling | [API](api.md) |
| Choose routing or connect other services | [Patterns](patterns.md) |
| Diagnose startup, persistence, capacity, or rollout issues | [Gotchas](gotchas.md) |

For additional topics, consult the [Containers documentation index](https://developers.cloudflare.com/containers/llms.txt).

### .agents\skills\cloudflare\references\cron-triggers\README.md
# Cloudflare Cron Triggers

Use Cron Triggers to start periodic Worker jobs. Fetch the relevant current documentation before implementing; configuration, API signatures, examples, and limits belong in the docs.

- **Set up a recurring job:** [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) covers scheduling, deployment, and execution history.
- **Implement the job:** [Scheduled handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/) covers controller properties, asynchronous work, and multiple schedules.
- **Schedule durable work:** [Trigger Workflows](https://developers.cloudflare.com/workflows/build/trigger-workflows/) covers direct Workflow schedules and starting instances from a Worker. Check this before introducing a Worker whose only job is to start a Workflow.
- **Check capacity:** fetch [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) for the target plan and invocation type.

## In This Reference

- [configuration.md](./configuration.md) â€” schedule setup, environments, removal, and Green Compute
- [api.md](./api.md) â€” handler implementation, asynchronous completion, and tests
- [patterns.md](./patterns.md) â€” choosing execution boundaries and integrations
- [gotchas.md](./gotchas.md) â€” investigating timing, failures, and repeated work

## See Also

- [Workflows](../workflows/README.md) â€” durable multi-step jobs
- [Queues](../queues/README.md) â€” asynchronous message processing

### .agents\skills\cloudflare\references\d1\README.md
# Cloudflare D1 Database

Use D1 for managed relational application data with SQLite semantics. For an existing external database, consider [Hyperdrive](../hyperdrive/); for per-entity coordination, consider [Durable Objects](https://developers.cloudflare.com/workers/platform/storage-options/#sql-in-durable-objects-vs-d1). See [storage options](https://developers.cloudflare.com/workers/platform/storage-options/) before choosing a product.

Read the relevant current documentation before implementing. These references route tasks to the source of truth rather than maintaining copies of APIs, configuration, or plan tables.

## Start here

- [Get started](https://developers.cloudflare.com/d1/get-started/): create a database, bind it to a Worker, and run a first query.
- [configuration.md](./configuration.md): bindings, environments, migrations, local development, and ORM integration.
- [api.md](./api.md): parameterized queries, batches, sessions, HTTP access, and testing.
- [patterns.md](./patterns.md): query design, caching, tenant isolation, replication, and recovery.
- [gotchas.md](./gotchas.md): errors, types, constraints, performance, and limits.

Check [limits](https://developers.cloudflare.com/d1/platform/limits/) and [pricing](https://developers.cloudflare.com/d1/platform/pricing/) for capacity, allowances, and plan availability; do not infer them from old examples.

### .agents\skills\cloudflare\references\ddos\README.md
# Cloudflare DDoS Protection

Autonomous, always-on protection against DDoS attacks across L3/4 and L7.

## Protection Types

- **HTTP DDoS (L7)**: Protects HTTP/HTTPS traffic, phase `ddos_l7`, zone/account level
- **Network DDoS (L3/4)**: UDP/SYN/DNS floods, phase `ddos_l4`, account level only
- **Adaptive DDoS**: Learns 7-day baseline, detects deviations, 4 profile types (Origins, User-Agents, Locations, Protocols)

## Plan Availability

| Feature | Free | Pro | Business | Enterprise | Enterprise Advanced |
|---------|------|-----|----------|------------|---------------------|
| HTTP DDoS (L7) | âœ“ | âœ“ | âœ“ | âœ“ | âœ“ |
| Network DDoS (L3/4) | âœ“ | âœ“ | âœ“ | âœ“ | âœ“ |
| Override rules | 1 | 1 | 1 | 1 | 10 |
| Custom expressions | âœ— | âœ— | âœ— | âœ— | âœ“ |
| Log action | âœ— | âœ— | âœ— | âœ— | âœ“ |
| Adaptive DDoS | âœ— | âœ— | âœ— | âœ“ | âœ“ |
| Alert filters | Basic | Basic | Basic | Advanced | Advanced |

## Actions & Sensitivity

- **Actions**: `block`, `managed_challenge`, `challenge`, `log` (Enterprise Advanced only)
- **Sensitivity**: `default` (high), `medium`, `low`, `eoff` (essentially off)
- **Override**: By category/tag or individual rule ID
- **Scope**: Zone-level overrides take precedence over account-level

## Reading Order

| File | Purpose | Start Here If... |
|------|---------|------------------|
| [configuration.md](./configuration.md) | Dashboard setup, rule structure, adaptive profiles | You're setting up DDoS protection for the first time |
| [api.md](./api.md) | API endpoints, SDK usage, ruleset ID discovery | You're automating configuration or need programmatic access |
| [patterns.md](./patterns.md) | Protection strategies, defense-in-depth, dynamic response | You need implementation patterns or layered security |
| [gotchas.md](./gotchas.md) | False positives, tuning, error handling | You're troubleshooting or optimizing existing protection |

## See Also
- [waf](../waf/) - Application-layer security rules
- [bot-management](../bot-management/) - Bot detection and mitigation

### .agents\skills\cloudflare\references\do-storage\README.md
# Cloudflare Durable Objects Storage

Use SQLite for new classes. Existing KV-backed classes need their matching API reference; using key-value methods does not by itself identify the backend.

Fetch the relevant current documentation before implementing or reviewing changes.

| Task | Documentation |
|------|---------------|
| Choose SQL, key-value access, transactions, or recovery APIs | [SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/); [Legacy KV storage API](https://developers.cloudflare.com/durable-objects/api/legacy-kv-storage-api/) |
| Configure the backend, class lifecycle, and placement | [Configuration](configuration.md) |
| Find operation semantics and storage options | [API routing](api.md) |
| Design schemas, caches, scheduled work, or cleanup | [Patterns](patterns.md) |
| Diagnose concurrency, limits, and billing | [Troubleshooting](gotchas.md) |
| Verify storage behavior in the Workers runtime | [Testing](testing.md) |

For object routing, WebSockets, and coordination design, see the [Durable Objects skill](../../../durable-objects/SKILL.md).

### .agents\skills\cloudflare\references\email-routing\README.md
# Email Routing

Use routing rules for address-based forwarding; use an Email Worker when incoming mail needs custom processing. Fetch the linked docs before implementing APIs, DNS, configuration, or limits.

| Task | Start here |
| --- | --- |
| Forward incoming mail to an existing mailbox | [Route emails](https://developers.cloudflare.com/email-service/get-started/route-emails/) |
| Manage addresses, verification, catch-all rules, or subaddressing | [Routing rules and addresses](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/) |
| Filter, parse, reply to, or store incoming mail | [Email Workers](../email-workers/README.md) |
| Send a new outbound message | [Send emails](https://developers.cloudflare.com/email-service/get-started/send-emails/) â€” Workers binding, REST API, or SMTP |

Forwarding requires verified destinations. Replying within an incoming email event and sending a new outbound message have different requirements; use the relevant API docs.

## Reference map

- [Configuration](configuration.md): domains, rules, deployment, and local testing.
- [API](api.md): routing management and inbound/outbound operations.
- [Patterns](patterns.md): filtering, parsing, storage, and notifications.
- [Troubleshooting](gotchas.md): authentication, delivery, and current limits.

### .agents\skills\cloudflare\references\email-workers\README.md
# Email Workers

Use an Email Worker's `email()` handler for custom processing of incoming mail. Use [routing rules](../email-routing/README.md) for simple address-based forwarding. Fetch current documentation before implementing the handler or its dependencies.

| Operation | Documentation |
| --- | --- |
| Forward to a verified destination, reject, or reply within the incoming event | [Email handler API](https://developers.cloudflare.com/email-service/api/route-emails/email-handler/) |
| Send a new message or a later response | [Sending Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/) |
| Parse and store mail for later processing | [Email storage and processing](https://developers.cloudflare.com/email-service/examples/email-routing/email-storage/) |

`message.raw` is a single-use stream. If parsing and archiving both need the raw content, plan how to reuse it rather than reading the stream twice. Forwarding destinations must be verified; reply requirements are documented separately from outbound sending.

## Reference map

- [Configuration](configuration.md): routing, bindings, local development, and types.
- [API](api.md): message actions, MIME, and sending.
- [Patterns](patterns.md): filtering, storage, attachments, and background processing.
- [Troubleshooting](gotchas.md): stream handling, authentication, limits, and errors.

### .agents\skills\cloudflare\references\flagship\README.md
# Cloudflare Flagship

Feature flag service for controlling feature visibility without redeploying code. Define flags with targeting rules and percentage-based rollouts, then evaluate them in Workers via a native binding or from any JavaScript runtime via the OpenFeature SDK.

## When to Use

| Need | Use Flagship? | Alternative |
|------|--------------|-------------|
| Feature toggles (on/off) | Yes | â€” |
| Gradual rollouts (percentage-based) | Yes | â€” |
| A/B testing with attribute targeting | Yes | â€” |
| Multi-variant configuration delivery | Yes | â€” |
| Environment-specific config (dev/staging/prod) | Consider | Wrangler environments, secrets |
| Static config that never changes | No | `wrangler.jsonc` vars |
| Per-request rate limiting | No | Rate Limiting rules |

## Key Concepts

- **Apps** â€” Top-level organizational unit. Maps to a project or service. Each account can have multiple apps.
- **Flags** â€” Named feature toggles with a key, variations, targeting rules, and enabled/disabled state.
- **Variations** â€” Possible values a flag returns. Types: boolean, string, number, JSON object. All variations on a flag must share the same type.
- **Targeting rules** â€” Sequential, priority-ordered conditions that determine which variation to serve. First match wins; no match returns the default.
- **Evaluation context** â€” Key-value attributes (`userId`, `country`, `plan`, etc.) passed at evaluation time for rule matching and rollout bucketing.
- **Percentage rollouts** â€” Gradually release to a fraction of users. Consistent hashing on a configurable attribute ensures sticky bucketing.

## Two Evaluation Paths

| Path | Runtime | Package | Latency | Auth |
|------|---------|---------|---------|------|
| **Binding** (`env.FLAGS`) | Workers only | `@cloudflare/workers-types` | Lowest (no HTTP) | Automatic via binding |
| **OpenFeature SDK** | Workers, Node.js, browser | `@cloudflare/flagship` + `@openfeature/server-sdk` or `@openfeature/web-sdk` | HTTP per eval (server) or prefetch (client) | API token or binding passthrough |

**Recommendation:** Use the binding inside Workers. Use the SDK when running outside Workers or when you need OpenFeature vendor-neutrality.

## Reading Order

| Task | Read |
|------|------|
| Set up Flagship in a Worker | `configuration.md` â†’ `api.md` |
| Evaluate flags in code | `configuration.md` â†’ `patterns.md` |
| Manage flags via REST API | `api.md` â†’ `patterns.md` |
| Design targeting rules & rollouts | `patterns.md` â†’ `gotchas.md` |
| Debug flag evaluation issues | `gotchas.md` â†’ `api.md` |

REST API note: management endpoints use Cloudflare v4 envelopes (`result`, `result_info`, `errors`) and snake_case fields. The `/evaluate` endpoint is the exception: it is not enveloped and returns OpenFeature-style camelCase.

## In This Reference

- **[api.md](./api.md)** â€” REST API endpoints, binding methods, OpenFeature SDK, schemas
- **[configuration.md](./configuration.md)** â€” Wrangler binding setup, SDK installation, TypeScript types
- **[patterns.md](./patterns.md)** â€” Flag CRUD via API, targeting rules, rollouts, OpenFeature usage
- **[gotchas.md](./gotchas.md)** â€” Common errors, limits, anti-patterns, troubleshooting

## See Also

- **[Flagship API reference](https://developers.cloudflare.com/api/resources/flagship/)** â€” Source of truth for REST API paths, envelopes, and response fields
- **[Workers docs](https://developers.cloudflare.com/workers/)** â€” Workers runtime (Flagship runs inside Workers)
- **[../kv/](../kv/)** â€” KV storage (Flagship uses KV infrastructure for flag delivery)
- **[Wrangler docs](https://developers.cloudflare.com/workers/wrangler/)** â€” Wrangler CLI for deployment and config

### .agents\skills\cloudflare\references\graphql-api\README.md
# Cloudflare GraphQL Analytics API

Query analytics data across all Cloudflare products via a single GraphQL endpoint. Covers HTTP requests, Workers metrics, DNS, Firewall events, Network Analytics, and 70+ other datasets.

## Overview

- **Single endpoint** for all analytics: `https://api.cloudflare.com/client/v4/graphql`
- **1,400+ schema types** spanning every Cloudflare product
- **Two scopes**: zone-level (per-domain) and account-level (cross-domain)
- **Adaptive sampling** on high-traffic datasets with confidence intervals
- **No mutations** - read-only analytics (the Mutation type is a stub)
- **Cost-based rate limiting** - default 300 queries per 5 minutes per user (max 320, varies by query cost)

## Quick Decision Tree

```
Need analytics data from Cloudflare?
â”œâ”€ HTTP traffic (requests, bandwidth, cache) â†’ httpRequestsAdaptiveGroups (zone or account)
â”œâ”€ Workers performance (CPU, wall time, errors) â†’ workersInvocationsAdaptive (account)
â”œâ”€ Firewall/WAF events â†’ firewallEventsAdaptive / firewallEventsAdaptiveGroups (zone or account)
â”œâ”€ DNS query analytics â†’ dnsAnalyticsAdaptive / dnsAnalyticsAdaptiveGroups (zone or account)
â”œâ”€ Network layer (DDoS, Magic Transit) â†’ *NetworkAnalyticsAdaptiveGroups (account)
â”œâ”€ Storage (R2, KV, D1, DO) â†’ r2OperationsAdaptiveGroups / kvOperationsAdaptiveGroups / etc. (account)
â”œâ”€ AI (Workers AI, AI Gateway) â†’ aiInferenceAdaptive / aiGatewayRequestsAdaptiveGroups (account)
â”œâ”€ Load Balancing â†’ loadBalancingRequestsAdaptiveGroups (zone)
â”œâ”€ Custom high-cardinality metrics â†’ Workers Analytics Engine (see ../analytics-engine/)
â””â”€ Need raw logs, not aggregates â†’ Logpush (see Cloudflare docs)
```

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Endpoint** | `POST https://api.cloudflare.com/client/v4/graphql` |
| **Explorer** | [graphql.cloudflare.com](https://graphql.cloudflare.com/) - interactive query builder |
| **Viewer** | Root query object: `viewer { zones(...) { ... } }` or `viewer { accounts(...) { ... } }` |
| **Dataset (Node)** | A queryable table under a zone or account (e.g., `httpRequestsAdaptiveGroups`) |
| **Dimensions** | Fields to group by (time buckets, country, status code, script name, etc.) |
| **Metrics** | Aggregation fields: `count`, `sum { ... }`, `avg { ... }`, `quantiles { ... }`, `ratio { ... }` |
| **Filter** | Input object constraining results by time range, dimensions, etc. |
| **Limit** | Maximum rows returned per dataset node (required, max varies by dataset) |
| **OrderBy** | Enum-based sorting: `[field_ASC]` or `[field_DESC]` |
| **Adaptive Sampling** | Nodes with `Adaptive` in the name use ABR sampling; results are statistically representative |

## Query Structure

Every query follows this pattern:

```graphql
{
  viewer {
    # Zone-scoped
    zones(filter: { zoneTag: "ZONE_ID" }) {
      datasetName(
        filter: { datetime_gt: "...", datetime_lt: "..." }
        limit: 1000
        orderBy: [datetimeFiveMinutes_DESC]
      ) {
        count
        dimensions { ... }
        sum { ... }
      }
    }
    # Account-scoped
    accounts(filter: { accountTag: "ACCOUNT_ID" }) {
      datasetName(filter: { ... }, limit: 100) {
        count
        dimensions { ... }
        sum { ... }
      }
    }
  }
}
```

## Dataset Naming Convention

Dataset names follow a consistent pattern visible in the schema:

| Pattern | Meaning | Example |
|---------|---------|---------|
| `*Adaptive` | Raw rows with adaptive sampling; some (e.g., `workersInvocationsAdaptive`) also support aggregation fields (`sum`, `quantiles`, `avg`) | `httpRequestsAdaptive`, `workersInvocationsAdaptive` |
| `*AdaptiveGroups` | Aggregated data with adaptive sampling | `httpRequestsAdaptiveGroups` |
| `*1hGroups` | Hourly rollups (pre-aggregated) | `httpRequests1hGroups` |
| `*1dGroups` | Daily rollups (pre-aggregated) | `httpRequests1dGroups` |
| `*1mGroups` | Minutely rollups | `httpRequests1mGroups` |
| `Zone*` prefix | Zone-scoped dataset | `ZoneHttpRequestsAdaptiveGroups` |
| `Account*` prefix | Account-scoped dataset | `AccountWorkersInvocationsAdaptive` |

**Prefer `*AdaptiveGroups` nodes** for most use cases - they support flexible time grouping via dimension fields (`datetimeFiveMinutes`, `datetimeHour`, etc.) and are the most commonly used.

## Key Datasets by Product

### Zone-Scoped (per-domain)

| Dataset | Description |
|---------|-------------|
| `httpRequestsAdaptiveGroups` | HTTP traffic: requests, bytes, cache status, bot scores, WAF scores |
| `httpRequests1hGroups` / `1dGroups` / `1mGroups` | Pre-aggregated HTTP rollups (hourly/daily/minutely) |
| `firewallEventsAdaptiveGroups` | WAF, rate limiting, bot management, firewall rule events |
| `dnsAnalyticsAdaptiveGroups` | DNS query volumes, response codes, query types |
| `loadBalancingRequestsAdaptiveGroups` | Load Balancer origin request metrics |
| `pageShieldReportsAdaptiveGroups` | Page Shield CSP reports |

### Account-Scoped (cross-domain)

| Dataset | Description |
|---------|-------------|
| `workersInvocationsAdaptive` | Workers: requests, errors, CPU time, wall time, subrequests |
| `durableObjectsInvocationsAdaptiveGroups` | DO invocations |
| `durableObjectsStorageGroups` / `durableObjectsPeriodicGroups` | DO storage and periodic metrics |
| `d1AnalyticsAdaptiveGroups` / `d1QueriesAdaptiveGroups` | D1 database analytics |
| `r2OperationsAdaptiveGroups` / `r2StorageAdaptiveGroups` | R2 operations and storage |
| `kvOperationsAdaptiveGroups` / `kvStorageAdaptiveGroups` | KV operations and storage |
| `aiInferenceAdaptiveGroups` | Workers AI inference metrics |
| `aiGatewayRequestsAdaptiveGroups` | AI Gateway request analytics |
| `pagesFunctionsInvocationsAdaptiveGroups` | Pages Functions metrics |
| `magicTransitNetworkAnalyticsAdaptiveGroups` | Magic Transit packet/byte analytics |
| `spectrumNetworkAnalyticsAdaptiveGroups` | Spectrum TCP/UDP analytics |
| `gatewayL7RequestsAdaptiveGroups` | Zero Trust Gateway HTTP metrics |
| `gatewayResolverQueriesAdaptiveGroups` | Zero Trust Gateway DNS metrics |

## Reading Order

| Task | Start Here | Then Read |
|------|------------|-----------|
| **First query** | [configuration.md](configuration.md) (auth) -> this README (structure) | [api.md](api.md) |
| **Build a dashboard** | [patterns.md](patterns.md) (time-series, top-N) | [api.md](api.md) (aggregation fields) |
| **Debug query issues** | [gotchas.md](gotchas.md) | [api.md](api.md) (filtering) |
| **Understand sampling** | [gotchas.md](gotchas.md) (sampling section) | [api.md](api.md) (confidence intervals) |
| **Product-specific metrics** | [patterns.md](patterns.md) (per-product examples) | [api.md](api.md) (dataset reference) |

## In This Reference

- **[api.md](api.md)** - Query structure, aggregation fields (sum/avg/quantiles/count), filtering operators, dimensions, dataset details
- **[configuration.md](configuration.md)** - Authentication, API tokens, client setup (curl, JS, Python), introspection
- **[patterns.md](patterns.md)** - Common queries: time-series, top-N, Workers metrics, HTTP analytics, firewall events, multi-zone
- **[gotchas.md](gotchas.md)** - Rate limits, sampling caveats, query cost, common errors, plan-based limits

## See Also

- [GraphQL Analytics API Docs](https://developers.cloudflare.com/analytics/graphql-api/)
- [GraphQL API Explorer](https://graphql.cloudflare.com/)
- [Observability Reference](../observability/) - Workers Logs, Tail Workers, console logging
- [Analytics Engine Reference](../analytics-engine/) - Custom high-cardinality analytics via Workers
- [Web Analytics Reference](../web-analytics/) - Client-side (RUM) analytics
- [API Reference](../api/) - REST API, SDKs, authentication basics

### .agents\skills\cloudflare\references\hyperdrive\README.md
# Hyperdrive

Use Hyperdrive to connect Workers to an existing PostgreSQL or MySQL database with connection pooling and optional query caching. It does not replace the origin database or replicate its data. Start with [how Hyperdrive works](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/) and [supported databases and features](https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/) to assess fit.

## Retrieve current documentation

Fetch the relevant official page before implementing. Driver versions, compatibility settings, API shapes, CLI flags, cache settings, and limits belong in the docs rather than this reference. Use the [Hyperdrive documentation index](https://developers.cloudflare.com/hyperdrive/llms.txt) to discover additional pages. Retrieve a page as Markdown by sending `Accept: text/markdown` to its URL.

## Choose the next reference

| Task | Reference |
|------|-----------|
| Create a configuration, bind it, connect privately, or develop locally | [configuration.md](./configuration.md) |
| Choose a driver, use binding credentials, or integrate an ORM | [api.md](./api.md) |
| Decide read freshness, connection lifetime, or query placement | [patterns.md](./patterns.md) |
| Diagnose connection, cache, latency, or capacity problems | [gotchas.md](./gotchas.md) |

## Decisions to preserve

- Choose a driver for the database engine and existing application stack; verify supported versions and Worker requirements in its guide.
- Create database clients inside each handler invocation. Hyperdrive manages the underlying origin pool; consult [connection lifecycle](https://developers.cloudflare.com/hyperdrive/concepts/connection-lifecycle/) for cleanup behavior.
- Choose caching by read freshness. Disabling caching still allows connection pooling; a write does not invalidate cached reads. See [query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/).

## See also

- [D1](../d1/) for a managed SQLite alternative.
- [Workers](https://developers.cloudflare.com/workers/) for the runtime and bindings.

### .agents\skills\cloudflare\references\images\README.md
# Cloudflare Images

Choose the image source and operation before selecting an API. Hosted-image management, remote URL transformations, and the Workers optimization binding have different contracts. Retrieve the documentation for the path the project uses.

| Task | Start here |
|------|------------|
| Optimize image bytes in a Worker or manage hosted images | [API selection](api.md) |
| Configure a binding, variants, or private delivery | [Configuration](configuration.md) |
| Accept client uploads, serve responsive images, watermark, or store results in R2 | [Patterns](patterns.md) |
| Diagnose failures, check limits, or investigate caching | [Troubleshooting](gotchas.md) |

For new work, inspect the project's installed Wrangler version, compatibility settings, existing image storage, and public/private access requirements. Read only the relevant linked pages and adapt them to the project; preserve existing conventions and verify behavior with representative images.

### .agents\skills\cloudflare\references\kv\README.md
# Cloudflare Workers KV

Use KV for read-heavy configuration, preferences, and application caches that tolerate stale data. Read [how KV works](https://developers.cloudflare.com/kv/concepts/how-kv-works/) before choosing it: reads are eventually consistent, including cached missing keys, and immediate visibility is not guaranteed even in the location of a write.

For atomic updates or coordination, consider [Durable Objects](https://developers.cloudflare.com/durable-objects/); for relational queries, [D1](../d1/); for large objects, [R2](../r2/). Use the [storage comparison](https://developers.cloudflare.com/workers/platform/storage-options/) to choose based on requirements.

Read the current documentation for the task before implementing. Use the [KV documentation index](https://developers.cloudflare.com/kv/llms.txt) to discover additional guides; these files preserve task routes rather than copies of APIs, commands, or numeric limits.

## Start here

- [Get started](https://developers.cloudflare.com/kv/get-started/): create a namespace, bind it, and read and write data.
- [configuration.md](./configuration.md): bindings, environments, types, local development, CLI, and REST access.
- [api.md](./api.md): reads, writes, metadata, deletion, bulk operations, and pagination.
- [patterns.md](./patterns.md): caching, sessions, key design, versioning, and fallback decisions.
- [gotchas.md](./gotchas.md): stale reads, concurrent writes, missing values, performance, limits, and pricing.

### .agents\skills\cloudflare\references\miniflare\README.md
# Miniflare

Miniflare provides programmatic control of local Workers simulation. Read the linked documentation before choosing APIs, configuration, or a migration path.

## Choose the testing tool

| Need | Start here |
|------|------------|
| Unit tests that execute in the Workers runtime | [Workers Vitest setup](https://developers.cloudflare.com/workers/testing/vitest-integration/write-your-first-test/) |
| Integration tests against built Workers | [Integration test harness](https://developers.cloudflare.com/workers/testing/test-harness/) |
| Low-level simulator control for a custom harness | [Miniflare testing guide](https://developers.cloudflare.com/workers/testing/miniflare/writing-tests/) |
| Binding access from a Node.js process | [Wrangler getPlatformProxy](https://developers.cloudflare.com/workers/wrangler/api/#getplatformproxy) |

For interactive local development, use the project's Wrangler or Cloudflare Vite workflow. Direct Miniflare is useful when the higher-level testing tools do not expose the control needed.

## Read for the task

- [Get started](https://developers.cloudflare.com/workers/testing/miniflare/get-started/) â€” installation, scripts, lifecycle, and event dispatch.
- [API routing](./api.md) â€” events and access to local resources.
- [Configuration](./configuration.md) â€” modules, bindings, compatibility, and multiple Workers.
- [Testing patterns](./patterns.md) â€” runtime choice, mocking, and test lifecycle.
- [Troubleshooting and migrations](./gotchas.md) â€” build/configuration differences and existing test suites.

### .agents\skills\cloudflare\references\network-interconnect\README.md
# Cloudflare Network Interconnect (CNI)

Private, high-performance connectivity to Cloudflare's network. **Enterprise-only**.

## Connection Types

**Direct**: Physical fiber in shared datacenter. 10/100 Gbps. You order cross-connect.

**Partner**: Virtual via Console Connect, Equinix, Megaport, etc. Managed via partner SDN.

**Cloud**: AWS Direct Connect or GCP Cloud Interconnect. Magic WAN only.

## Dataplane Versions

**v1 (Classic)**: GRE tunnel support, VLAN/BFD/LACP, asymmetric MTU (1500â†“/1476â†‘), peering support.

**v2 (Beta)**: No GRE, 1500 MTU both ways, no VLAN/BFD/LACP yet, ECMP instead.

## Use Cases

- **Magic Transit DSR**: DDoS protection, egress via ISP (v1/v2)
- **Magic Transit + Egress**: DDoS + egress via CF (v1/v2)
- **Magic WAN + Zero Trust**: Private backbone (v1 needs GRE, v2 native)
- **Peering**: Public routes at PoP (v1 only)
- **App Security**: WAF/Cache/LB (v1/v2 over Magic Transit)

## Prerequisites

- Enterprise plan
- IPv4 /24+ or IPv6 /48+ prefixes
- BGP ASN for v1
- See [locations PDF](https://developers.cloudflare.com/network-interconnect/static/cni-locations-05-may-2026.pdf)

## Specs

- /31 point-to-point subnets
- 10km max optical distance
- 10G: 10GBASE-LR single-mode
- 100G: 100GBASE-LR4 single-mode
- **No SLA** (free service)
- Backup Internet required

## Throughput

| Direction | 10G | 100G |
|-----------|-----|------|
| CF â†’ Customer | 10 Gbps | 100 Gbps |
| Customer â†’ CF (peering) | 10 Gbps | 100 Gbps |
| Customer â†’ CF (Magic) | 1 Gbps/tunnel or CNI | 1 Gbps/tunnel or CNI |

## Timeline

2-4 weeks typical. Steps: request â†’ config review â†’ order connection â†’ configure â†’ test â†’ enable health checks â†’ activate â†’ monitor.

## In This Reference
- [configuration.md](./configuration.md) - BGP, routing, setup
- [api.md](./api.md) - API endpoints, SDKs
- [patterns.md](./patterns.md) - HA, hybrid cloud, failover
- [gotchas.md](./gotchas.md) - Troubleshooting, limits

## Reading Order by Task

| Task | Files to Load |
|------|---------------|
| Initial setup | README â†’ configuration.md â†’ api.md |
| Create interconnect via API | api.md â†’ gotchas.md |
| Design HA architecture | patterns.md â†’ README |
| Troubleshoot connection | gotchas.md â†’ configuration.md |
| Cloud integration (AWS/GCP) | configuration.md â†’ patterns.md |
| Monitor + alerts | configuration.md |

## Automation Boundary

**API-Automatable:**
- List/create/delete interconnects (Direct, Partner)
- List available slots
- Get interconnect status
- Download LOA PDF
- Create/update CNI objects (BGP config)
- Query settings

**Requires Account Team:**
- Initial request approval
- AWS Direct Connect setup (send LOA+VLAN to CF)
- GCP Cloud Interconnect final activation
- Partner interconnect acceptance (Equinix, Megaport)
- VLAN assignment (v1)
- Configuration document generation (v1)
- Escalations + troubleshooting support

**Cannot Be Automated:**
- Physical cross-connect installation (Direct)
- Partner portal operations (virtual circuit ordering)
- AWS/GCP portal operations
- Maintenance window coordination

## See Also
- [tunnel](../tunnel/) - Alternative for private network connectivity
- [spectrum](../spectrum/) - Layer 4 proxy for TCP/UDP traffic

### .agents\skills\cloudflare\references\observability\README.md
# Cloudflare Observability

Use this reference to choose a telemetry signal and find the maintained implementation guide. Fetch the linked documentation before writing configuration, queries, or export code; it is the source of truth for APIs, availability, retention, limits, and pricing.

## Choose a signal

| Need | Start here |
| --- | --- |
| Store, search, and investigate historical Worker logs | [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) |
| Watch a deployment or reproduce an issue live | [Real-time logs and Wrangler tail](https://developers.cloudflare.com/workers/observability/logs/real-time-logs/) |
| Understand request flows and dependency latency | [Workers Traces](https://developers.cloudflare.com/workers/observability/traces/) |
| Monitor built-in request, error, and CPU metrics | [Metrics and analytics](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/) |
| Record custom events and tenant-level usage for SQL analysis | [Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/get-started/) |
| Export logs and traces to an observability provider | [OpenTelemetry export](https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/) |
| Apply custom filtering, transformation, or delivery logic | [Tail Workers](https://developers.cloudflare.com/workers/observability/logs/tail-workers/) |
| Deliver Workers Trace Events to a supported log storage destination | [Workers Logpush](https://developers.cloudflare.com/workers/observability/logs/logpush/) |

Workers Logs supports retained historical data; live tailing is a separate debugging workflow. Choose persistence, sampling, and export destinations deliberately rather than assuming that every signal is stored or included without usage charges.

## Load only what the task needs

- [configuration.md](configuration.md): enable collection, bindings, environments, and exports.
- [api.md](api.md): logging, telemetry types, SQL, GraphQL, and Logpush APIs.
- [patterns.md](patterns.md): billing, performance, errors, tenant tracking, and export decisions.
- [gotchas.md](gotchas.md): missing data, sampling, timing, privacy, and cost checks.

For broader product tasks, see [Analytics Engine](../analytics-engine/README.md), [GraphQL API](../graphql-api/README.md), and [Tail Workers](../tail-workers/README.md).

### .agents\skills\cloudflare\references\pages\README.md
# Cloudflare Pages

Use this reference when maintaining an existing Pages project. For new applications, start with Workers as recommended in the [Pages framework guidance](https://developers.cloudflare.com/pages/framework-guides/). Fetch current documentation before implementing.

| Task | Documentation |
| --- | --- |
| Configure the existing build | [Build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/) |
| Manage automatic deployments from a repository | [Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/) |
| Deploy prebuilt output | [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/) |
| Implement server-side requests | [Functions API reference](https://developers.cloudflare.com/pages/functions/api-reference/) |
| Plan a move to Workers | [Migrate from Pages to Workers](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/) |

## In This Reference

- [configuration.md](./configuration.md) â€” build output, environments, and static rules
- [api.md](./api.md) â€” request handling and framework integration
- [patterns.md](./patterns.md) â€” project decisions and migration
- [gotchas.md](./gotchas.md) â€” build, routing, and deployment investigation

See [Pages Functions](../pages-functions/README.md) for handler-focused navigation. Identify the existing deployment method and framework before proposing changes.

### .agents\skills\cloudflare\references\pages-functions\README.md
# Cloudflare Pages Functions

Use this reference for server-side behavior in an existing Pages project. For new applications, follow the Workers recommendation in the [Pages framework guidance](https://developers.cloudflare.com/pages/framework-guides/).

| Task | Documentation |
| --- | --- |
| Identify filesystem routes and invocation boundaries | [Routing](https://developers.cloudflare.com/pages/functions/routing/) |
| Implement request handlers | [API reference](https://developers.cloudflare.com/pages/functions/api-reference/) |
| Understand generated Worker output | [Advanced mode](https://developers.cloudflare.com/pages/functions/advanced-mode/) |

Inspect whether the project uses a Functions directory or framework-generated advanced mode before selecting a routing approach. Fetch current documentation for signatures, supported bindings, configuration, and examples.

## In This Reference

- [api.md](./api.md) â€” handlers, context, middleware, and assets
- [configuration.md](./configuration.md) â€” bindings, environments, types, and local development
- [patterns.md](./patterns.md) â€” request ownership and shared logic
- [gotchas.md](./gotchas.md) â€” route, binding, and runtime investigation

See [Pages](../pages/README.md) for builds and deployment decisions.

### .agents\skills\cloudflare\references\pipelines\README.md
# Cloudflare Pipelines

Streaming ingest: receive events over HTTP/Workers/Logpush, transform with SQL, write to R2 as Iceberg tables or Parquet/JSON files.

## Documentation

This reference is a fast-start with verified code and gotchas. For limits, settings, full SQL syntax, and pricing, **retrieve the live docs** â€” use the Cloudflare MCP `docs` tool if available, otherwise `webfetch` the URL. Docs are source of truth over this file.

| Topic | URL |
|-------|-----|
| Overview / getting started | `https://developers.cloudflare.com/pipelines/getting-started/` |
| Streams (write, manage, Logpush) | `https://developers.cloudflare.com/pipelines/streams/` |
| Sinks | `https://developers.cloudflare.com/pipelines/sinks/` |
| Pipelines & SQL transforms | `https://developers.cloudflare.com/pipelines/pipelines/` |
| SQL reference (statements, types) | `https://developers.cloudflare.com/pipelines/sql-reference/` |
| Wrangler commands | `https://developers.cloudflare.com/pipelines/reference/wrangler-commands/` |
| Terraform | `https://developers.cloudflare.com/pipelines/reference/terraform/` |
| Limits | `https://developers.cloudflare.com/pipelines/platform/limits/` |
| Pricing | `https://developers.cloudflare.com/pipelines/platform/pricing/` |
| Metrics (GraphQL) | `https://developers.cloudflare.com/pipelines/observability/metrics/` |

## Three Components

```
Sources â†’ Stream â†’ Pipeline (SQL) â†’ Sink â†’ R2
          â†‘          â†“                 â†“
   HTTP / Workers / Transform     Iceberg (Data Catalog)
   Logpush          (row-level)   or Parquet/JSON files
```

| Component | Purpose |
|-----------|---------|
| **Stream** | Receives events (HTTP endpoint, Worker binding, or Logpush). Structured (schema-validated) or unstructured. |
| **Pipeline** | SQL connecting a stream to a sink. Row-level transforms only â€” no GROUP BY/aggregation. |
| **Sink** | Writes to R2 â€” Iceberg via Data Catalog, or raw Parquet/JSON. |

**Status:** Open beta (Workers Paid for production). Pricing announced; verify billing status in docs.

## Quick Start

```bash
# Interactive â€” creates stream + sink + pipeline, optionally bucket + catalog
npx wrangler pipelines setup
```

Minimal Worker producer:
```typescript
interface Env { MY_STREAM: Pipeline; }

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    ctx.waitUntil(env.MY_STREAM.send([{ event_id: crypto.randomUUID(), amount: 29.99 }]));
    return new Response("OK");
  }
} satisfies ExportedHandler<Env>;
```

## Which Sink Type?

```
Need SQL queries / ACID / time-travel on the data?
  â†’ R2 Data Catalog (Iceberg)   âœ… R2 SQL, schema evolution   âŒ more setup

Just archival / external tools (Spark, Athena)?
  â†’ R2 raw files (Parquet/JSON) âœ… simple, partitioned files  âŒ no built-in SQL
```

## Critical Behaviors (read before building)

These are non-obvious and prevent most failures â€” see [gotchas.md](gotchas.md) for detail.

- **Everything is immutable after creation** â€” stream schema, pipeline SQL, sink config. To change, delete and recreate.
- **Sinks create their own table** â€” they cannot target an existing Iceberg table.
- **`__ingest_ts` is added automatically** (TIMESTAMP, partitioned by day). Don't define it in your schema.
- **Data isn't queryable immediately** â€” first flush takes **3â€“7 minutes** (warm-up + table creation) even with a short roll interval.
- **Schema validation is deferred** â€” invalid events are accepted then silently dropped. Monitor via GraphQL error metrics.
- **Binding field renamed `pipeline` â†’ `stream`** (June 2026); old field still accepted.

## Reading Order

1. [configuration.md](configuration.md) â€” schema, streams, sinks, pipelines (CLI + REST + Terraform), bindings
2. [api.md](api.md) â€” `send()`, HTTP ingest, REST API, pipeline SQL, lifecycle states
3. [patterns.md](patterns.md) â€” fire-and-forget, validation, Logpush, observability, end-to-end
4. [gotchas.md](gotchas.md) â€” silent drops, immutability, RESTâ‰ CLI field names

## See Also

- [r2-data-catalog](../r2-data-catalog/) â€” Iceberg sink destination
- [r2-sql](../r2-sql/) â€” query the ingested data
- [r2](../r2/) Â· [queues](../queues/) Â· [workers](https://developers.cloudflare.com/workers/)

### .agents\skills\cloudflare\references\pulumi\README.md
# Cloudflare Pulumi Provider

Expert guidance for Cloudflare Pulumi Provider (@pulumi/cloudflare).

## Overview

Programmatic management of Cloudflare resources: Workers, Pages, D1, KV, R2, DNS, Queues, etc.

**Packages:**
- TypeScript/JS: `@pulumi/cloudflare`
- Python: `pulumi-cloudflare`
- Go: `github.com/pulumi/pulumi-cloudflare/sdk/v6/go/cloudflare`
- .NET: `Pulumi.Cloudflare`

**Version:** v6.x

## Core Principles

1. Use API tokens (not legacy API keys)
2. Store accountId in stack config
3. Match binding names across code/config
4. Use `module: true` for ES modules
5. Set `compatibilityDate` to lock behavior

## Authentication

```typescript
import * as cloudflare from "@pulumi/cloudflare";

// API Token (recommended): CLOUDFLARE_API_TOKEN env
const provider = new cloudflare.Provider("cf", { apiToken: process.env.CLOUDFLARE_API_TOKEN });

// API Key (legacy): CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL env
const provider = new cloudflare.Provider("cf", { apiKey: process.env.CLOUDFLARE_API_KEY, email: process.env.CLOUDFLARE_EMAIL });

// API User Service Key: CLOUDFLARE_API_USER_SERVICE_KEY env
const provider = new cloudflare.Provider("cf", { apiUserServiceKey: process.env.CLOUDFLARE_API_USER_SERVICE_KEY });
```

## Setup

**Pulumi.yaml:**
```yaml
name: my-cloudflare-app
runtime: nodejs
config:
  cloudflare:apiToken:
    value: ${CLOUDFLARE_API_TOKEN}
```

**Pulumi.<stack>.yaml:**
```yaml
config:
  cloudflare:accountId: "abc123..."
```

**index.ts:**
```typescript
import * as pulumi from "@pulumi/pulumi";
import * as cloudflare from "@pulumi/cloudflare";
const accountId = new pulumi.Config("cloudflare").require("accountId");
```

## Common Resource Types
- `Provider` - Provider config
- `WorkerScript` - Worker
- `WorkersKvNamespace` - KV
- `R2Bucket` - R2
- `D1Database` - D1
- `Queue` - Queue
- `PagesProject` - Pages
- `DnsRecord` - DNS
- `WorkerRoute` - Worker route
- `WorkersDomain` - Custom domain

## Key Properties
- `accountId` - Required for most resources
- `zoneId` - Required for DNS/domain
- `name`/`title` - Resource identifier
- `*Bindings` - Connect resources to Workers

## Reading Order

| Order | File | What | When to Read |
|-------|------|------|--------------|
| 1 | [configuration.md](./configuration.md) | Resource config for Workers/KV/D1/R2/Queues/Pages | First time setup, resource reference |
| 2 | [patterns.md](./patterns.md) | Architecture patterns, multi-env, component resources | Building complex apps, best practices |
| 3 | [api.md](./api.md) | Outputs, dependencies, imports, dynamic providers | Advanced features, integrations |
| 4 | [gotchas.md](./gotchas.md) | Common errors, troubleshooting, limits | Debugging, deployment issues |

## In This Reference
- [configuration.md](./configuration.md) - Provider config, stack setup, Workers/bindings
- [api.md](./api.md) - Resource types, Workers script, KV/D1/R2/queues/Pages
- [patterns.md](./patterns.md) - Multi-env, secrets, CI/CD, stack management
- [gotchas.md](./gotchas.md) - State issues, deployment failures, limits

## See Also
- [terraform](../terraform/) - Alternative IaC for Cloudflare
- [wrangler](https://developers.cloudflare.com/workers/wrangler/) - CLI deployment alternative
- [workers](https://developers.cloudflare.com/workers/) - Worker runtime documentation

### .agents\skills\cloudflare\references\queues\README.md
# Cloudflare Queues

Use Queues to decouple producers from asynchronous consumers and buffer bursts of work. Design consumers for duplicate delivery; use Workflows when the task needs durable multi-step orchestration.

Fetch the relevant documentation below before implementing. Treat current Cloudflare docs as the source of truth for API signatures, acknowledgement semantics, configuration, limits, and pricing.

## Choose a consumer

- Use a Worker push consumer when processing runs on Workers.
- Use an HTTP pull consumer when processing runs in another environment; plan for polling, visibility timeouts, and acknowledgement leases.
- Choose a message encoding the consumer can decode. Check serialization and compatibility-date behavior before sending existing application objects.

See [How Queues works](https://developers.cloudflare.com/queues/reference/how-queues-works/) and [delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/) before choosing ordering or deduplication strategies.

## Read by task

| Task | Reference |
|------|-----------|
| Create queues, bind producers, and configure consumers | [configuration.md](./configuration.md) |
| Send messages and implement acknowledgement or retries | [api.md](./api.md) |
| Buffer APIs, defer jobs, or integrate with storage and orchestration | [patterns.md](./patterns.md) |
| Diagnose delivery failures, duplicates, or capacity issues | [gotchas.md](./gotchas.md) |

For a first application, fetch [Getting started](https://developers.cloudflare.com/queues/get-started/). Retrieve [limits](https://developers.cloudflare.com/queues/platform/limits/) and [pricing](https://developers.cloudflare.com/queues/platform/pricing/) before sizing throughput, retention, or cost; plan-specific values are not maintained here.

### .agents\skills\cloudflare\references\r2\README.md
# Cloudflare R2 Object Storage

Use R2 for objects such as uploads, media, backups, and static assets. Fetch the linked documentation before implementing; API signatures, configuration, limits, and pricing belong in the current docs.

## Choose an access path

- Use a Workers binding for object access inside a Worker: [Workers API setup](https://developers.cloudflare.com/r2/get-started/workers-api/).
- Use the S3-compatible API for existing S3 clients or direct client access through presigned URLs: [S3 setup](https://developers.cloudflare.com/r2/get-started/s3/). Check supported operations rather than assuming full S3 parity.
- Decide whether objects need application authorization, temporary access, or public delivery before exposing the bucket. See [patterns.md](./patterns.md).

## Find the task

| Task | Reference |
|------|-----------|
| Bindings, credentials, local development, bucket settings | [configuration.md](./configuration.md) |
| Object operations, metadata, conditions, multipart, CLI | [api.md](./api.md) |
| Uploads, streaming, caching, public delivery, event processing | [patterns.md](./patterns.md) |
| Pagination, conditional responses, failed uploads, limits | [gotchas.md](./gotchas.md) |

For other topics, discover pages through the [R2 documentation index](https://developers.cloudflare.com/r2/llms.txt). Check [pricing](https://developers.cloudflare.com/r2/pricing/) before estimating costs.

## See also

- [Workers](https://developers.cloudflare.com/workers/) for request handling.
- [KV](../kv/) or [D1](../d1/) for application metadata associated with objects.
- [Queues](../queues/) for asynchronous processing of object events.

### .agents\skills\cloudflare\references\r2-data-catalog\README.md
# R2 Data Catalog

Use R2 Data Catalog for Iceberg analytics and data pipelines on object storage. For transactional application queries, consider a database; for unstructured objects, use [R2](../r2/).

Distinguish the Iceberg REST catalog used by query engines from Cloudflare's control-plane API for catalog administration. Start with the workflow you need:

| Task | Reference |
|------|-----------|
| Enable a catalog, discover connection values, and choose credentials | [Configuration](configuration.md) |
| Select administration or engine APIs | [API selection](api.md) |
| Choose a Python, Spark, or SQL workflow | [Patterns](patterns.md) |
| Diagnose authentication, maintenance, or client problems | [Troubleshooting](gotchas.md) |

Copy the actual **Catalog URI** and **Warehouse name** from the catalog detail page or Wrangler's enable output. Pass both to the selected engine; do not reconstruct them from an assumed bucket naming convention. Retrieve [Manage catalogs](https://developers.cloudflare.com/r2-data-catalog/manage-catalogs/) before setup or permission changes.

Related workflows: [Pipelines](../pipelines/) for ingest and [R2 SQL](../r2-sql/) for querying tables.

### .agents\skills\cloudflare\references\r2-sql\README.md
# Cloudflare R2 SQL

Serverless, distributed, **read-only** query engine (Apache DataFusion) for Apache Iceberg tables in R2 Data Catalog.

## Documentation

For full function lists, data types, and pricing, **retrieve the live docs** â€” use the Cloudflare MCP `docs` tool if available, otherwise `webfetch`.

| Topic | URL |
|-------|-----|
| Overview / get started | `https://developers.cloudflare.com/r2-sql/get-started/` |
| Query data | `https://developers.cloudflare.com/r2-sql/query-data/` |
| SQL reference | `https://developers.cloudflare.com/r2-sql/sql-reference/` |
| Aggregate functions | `https://developers.cloudflare.com/r2-sql/sql-reference/aggregate-functions/` |
| Scalar functions | `https://developers.cloudflare.com/r2-sql/sql-reference/scalar-functions/` |
| Complex types | `https://developers.cloudflare.com/r2-sql/sql-reference/complex-types/` |
| Limitations & best practices | `https://developers.cloudflare.com/r2-sql/reference/limitations-best-practices/` |
| Wrangler commands | `https://developers.cloudflare.com/r2-sql/reference/wrangler-commands/` |
| Pricing | `https://developers.cloudflare.com/r2-sql/platform/pricing/` |

## Connection Values

| Value | Format |
|-------|--------|
| REST endpoint | `https://api.sql.cloudflarestorage.com/api/v1/accounts/{ACCOUNT_ID}/r2-sql/query/{BUCKET}` |
| Wrangler | `npx wrangler r2 sql query "{WAREHOUSE}" "<SQL>"` with `WRANGLER_R2_SQL_AUTH_TOKEN` set |
| Warehouse | `{ACCOUNT_ID}_{BUCKET}` |

> The REST endpoint is `api.sql.cloudflarestorage.com` â€” **not** `api.cloudflare.com/.../r2/sql`.

## Quick Start

```bash
npx wrangler r2 bucket catalog enable my-bucket           # 1. enable catalog
export WRANGLER_R2_SQL_AUTH_TOKEN=<r2-token>              # 2. auth (Admin R&W + R2 SQL Read)
npx wrangler r2 sql query "$ACCOUNT_ID"_my-bucket \
  "SELECT * FROM default.my_table LIMIT 10"                # 3. query
```

## SQL Surface

R2 SQL is read-only and supports a broad analytical SQL surface (SELECT, JOINs, subqueries, CTEs, set operations, window functions, and aggregate/scalar/JSON functions over complex types). For the authoritative, current list of supported syntax, functions, and limitations, see the SQL reference and limitations docs linked above. [api.md](api.md) has query templates.

## When to Use

**Use for:** SQL analytics over Iceberg (logs, BI, fraud, ad-hoc), multi-cloud queries without egress, dashboards (query from a Worker via HTTP).

**Don't use for:** writes (use PySpark/PyIceberg) or real-time OLTP (<100 ms).

## No Workers Binding

There is no `env.R2_SQL` binding. Query from a Worker via `fetch()` to the REST endpoint with the token as a secret (see [patterns.md](patterns.md#dashboard-worker)).

## Reading Order

1. [configuration.md](configuration.md) â€” enable catalog, tokens, env setup
2. [api.md](api.md) â€” SQL syntax templates, JOIN/window examples, response format, data types
3. [patterns.md](patterns.md) â€” CLI/REST/Worker queries, use cases, pagination, performance
4. [gotchas.md](gotchas.md) â€” what works vs. not, performance, troubleshooting

## See Also

- [r2-data-catalog](../r2-data-catalog/) â€” PyIceberg/PySpark, table management
- [pipelines](../pipelines/) â€” streaming ingest into queryable tables

### .agents\skills\cloudflare\references\realtimekit\README.md
# Cloudflare RealtimeKit

Expert guidance for building real-time video and audio applications using **Cloudflare RealtimeKit** - a comprehensive SDK suite for adding customizable live video and voice to web or mobile applications.

## Overview

RealtimeKit is Cloudflare's SDK suite built on Realtime SFU, abstracting WebRTC complexity with fast integration, pre-built UI components, global performance (300+ cities), and production features (recording, transcription, chat, polls).

**Use cases**: Team meetings, webinars, social video, audio calls, interactive plugins

## Core Concepts

- **App**: Workspace grouping meetings, participants, presets, recordings. Use separate Apps for staging/production
- **Meeting**: Re-usable virtual room. Each join creates new **Session**
- **Session**: Live meeting instance. Created on first join, ends after last leave
- **Participant**: User added via REST API. Returns `authToken` for client SDK. **Do not reuse tokens**
- **Preset**: Reusable permission/UI template (permissions, meeting type, theme). Applied at participant creation
- **Peer ID** (`id`): Unique per session, changes on rejoin
- **Participant ID** (`userId`): Persistent across sessions

## Quick Start

### 1. Create App & Meeting (Backend)

```bash
# Create app
curl -X POST 'https://api.cloudflare.com/client/v4/accounts/<account_id>/realtime/kit/apps' \
  -H 'Authorization: Bearer <api_token>' \
  -d '{"name": "My RealtimeKit App"}'

# Create meeting
curl -X POST 'https://api.cloudflare.com/client/v4/accounts/<account_id>/realtime/kit/<app_id>/meetings' \
  -H 'Authorization: Bearer <api_token>' \
  -d '{"title": "Team Standup"}'

# Add participant
curl -X POST 'https://api.cloudflare.com/client/v4/accounts/<account_id>/realtime/kit/<app_id>/meetings/<meeting_id>/participants' \
  -H 'Authorization: Bearer <api_token>' \
  -d '{"name": "Alice", "preset_name": "host"}'
# Returns: { authToken }
```

### 2. Client Integration

**React**:
```tsx
import { RtkMeeting } from '@cloudflare/realtimekit-react-ui';

function App() {
  return <RtkMeeting authToken="<participant_auth_token>" onLeave={() => {}} />;
}
```

**Core SDK**:
```typescript
import RealtimeKitClient from '@cloudflare/realtimekit';

const meeting = new RealtimeKitClient({ authToken: '<token>', video: true, audio: true });
await meeting.join();
```

## Reading Order

| Task | Files |
|------|-------|
| Quick integration | README only |
| Custom UI | README â†’ patterns â†’ api |
| Backend setup | README â†’ configuration |
| Debug issues | gotchas |
| Advanced features | patterns â†’ api |

## RealtimeKit vs Realtime SFU

| Choose | When |
|--------|------|
| **RealtimeKit** | Need pre-built UI, fast integration, React/Angular/HTML |
| **Realtime SFU** | Building from scratch, custom WebRTC, full control |

RealtimeKit is built on Realtime SFU but abstracts WebRTC complexity with UI components and SDKs.

## Which Package?

Need pre-built meeting UI?
- React â†’ `@cloudflare/realtimekit-react-ui` (`<RtkMeeting>`)
- Angular â†’ `@cloudflare/realtimekit-angular-ui`
- HTML/Vanilla â†’ `@cloudflare/realtimekit-ui`

Need custom UI?
- Core SDK â†’ `@cloudflare/realtimekit` (RealtimeKitClient) - full control

Need raw WebRTC control?
- See `realtime-sfu/` reference

## In This Reference

- [Configuration](./configuration.md) - Setup, installation, wrangler config
- [API](./api.md) - Meeting object, REST API, SDK methods
- [Patterns](./patterns.md) - Common workflows, code examples
- [Gotchas](./gotchas.md) - Common issues, troubleshooting

## See Also

- [Workers](https://developers.cloudflare.com/workers/) - Backend integration
- [D1](../d1/) - Meeting metadata storage
- [R2](../r2/) - Recording storage
- [KV](../kv/) - Session management

## Reference Links

- **Official Docs**: https://developers.cloudflare.com/realtime/realtimekit/
- **API Reference**: https://developers.cloudflare.com/api/resources/realtime_kit/
- **Examples**: https://github.com/cloudflare/realtimekit-web-examples
- **Dashboard**: https://dash.cloudflare.com/?to=/:account/realtime/kit

### .agents\skills\cloudflare\references\realtime-sfu\README.md
# Cloudflare Realtime SFU Reference

Expert guidance for building real-time audio/video/data applications using Cloudflare Realtime SFU (Selective Forwarding Unit).

## Reading Order

| Task | Files | ~Tokens |
|------|-------|---------|
| New project | README â†’ configuration | ~1200 |
| Implement publish/subscribe | README â†’ api | ~1600 |
| Add PartyTracks | patterns (PartyTracks section) | ~800 |
| Build presence system | patterns (DO section) | ~800 |
| Debug connection issues | gotchas | ~700 |
| Scale to millions | patterns (Cascading section) | ~600 |
| Add simulcast | patterns (Advanced section) | ~500 |
| Configure TURN | configuration (TURN section) | ~400 |

## In This Reference

- **[configuration.md](configuration.md)** - Setup, deployment, environment variables, Wrangler config
- **[api.md](api.md)** - Sessions, tracks, endpoints, request/response patterns
- **[patterns.md](patterns.md)** - Architecture patterns, use cases, integration examples
- **[gotchas.md](gotchas.md)** - Common issues, debugging, performance, security

## Quick Start

Cloudflare Realtime SFU: WebRTC infrastructure on global network (310+ cities). Anycast routing, no regional constraints, pub/sub model.

**Core concepts:**
- **Sessions:** WebRTC PeerConnection to Cloudflare edge
- **Tracks:** Audio/video/data channels you publish or subscribe to
- **No rooms:** Build presence layer yourself via track sharing (see patterns.md)

**Mental model:** Your client establishes one WebRTC session, publishes tracks (audio/video), shares track IDs via your backend, others subscribe to your tracks using track IDs + your session ID.

## Choose Your Approach

| Approach | When to Use | Complexity |
|----------|-------------|------------|
| **PartyTracks** | Production apps with device switching, React | Low - Observable-based, handles reconnections |
| **Raw API** | Custom requirements, non-browser, learning | Medium - Full control, manual WebRTC lifecycle |
| **RealtimeKit** | End-to-end SDK with UI components | Lowest - Managed state, React hooks |

**Recommendation:** Start with PartyTracks for most production applications. See patterns.md for PartyTracks examples.

## SFU vs RealtimeKit

- **Realtime SFU:** WebRTC infrastructure (this reference). Build your own signaling, presence, UI.
- **RealtimeKit:** SDK layer on top of SFU. Includes React hooks, state management, UI components. Part of Cloudflare AI platform.

Use SFU directly when you need custom signaling or non-React framework. Use RealtimeKit for faster development with React.

## Setup

Dashboard: https://dash.cloudflare.com/?to=/:account/calls

Get `CALLS_APP_ID` and `CALLS_APP_SECRET` from dashboard, then see configuration.md for deployment.

## See Also

- [Orange Meets Demo](https://demo.orange.cloudflare.dev/)
- [Orange Source](https://github.com/cloudflare/orange)
- [Calls Examples](https://github.com/cloudflare/calls-examples)
- [API Reference](https://developers.cloudflare.com/api/resources/calls/)
- [RealtimeKit Docs](https://developers.cloudflare.com/realtime/realtimekit/)

### .agents\skills\cloudflare\references\secrets-store\README.md
# Cloudflare Secrets Store

Use Secrets Store for account-level credentials shared across Workers or supported integrations. Use [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/) when credentials belong to one Worker and do not need centralized sharing.

Fetch the relevant documentation before implementing. Current Cloudflare docs are the source of truth for binding APIs, management commands, permissions, availability, and quotas. Use the [Secrets Store documentation index](https://developers.cloudflare.com/secrets-store/llms.txt) to discover additional guidance.

## Choose the scope

- Share a secret only among services that should use the same credential and rotate together.
- Separate development, staging, and production credentials; select the intended account and environment before managing or binding a secret.
- Grant only the management permissions and consuming-service scopes needed. Permission to view metadata does not imply permission to bind or retrieve a value; fetch [access control](https://developers.cloudflare.com/secrets-store/access-control/) for the current rules.

## Read by task

| Task | Reference |
|------|-----------|
| Create secrets, configure bindings, or prepare local development | [configuration.md](./configuration.md) |
| Read a secret in a Worker or automate management | [api.md](./api.md) |
| Plan rotation, migration, encryption, or auditing | [patterns.md](./patterns.md) |
| Diagnose access, deployment, or quota failures | [gotchas.md](./gotchas.md) |

Fetch the [product overview](https://developers.cloudflare.com/secrets-store/) for current availability and supported integrations. For AI Gateway provider credentials, use [Bring your own keys](https://developers.cloudflare.com/ai-gateway/configuration/bring-your-own-keys/).

### .agents\skills\cloudflare\references\smart-placement\README.md
# Cloudflare Workers Smart Placement

Automatic workload placement optimization to minimize latency by running Workers closer to backend infrastructure rather than end users.

## Core Concept

Smart Placement automatically analyzes Worker request duration across Cloudflare's global network and intelligently routes requests to optimal data center locations. Instead of defaulting to the location closest to the end user, Smart Placement can forward requests to locations closer to backend infrastructure when this reduces overall request duration.

### When to Use

**Enable Smart Placement when:**
- Worker makes multiple round trips to backend services/databases
- Backend infrastructure is geographically concentrated
- Request duration dominated by backend latency rather than network latency from user
- Running backend logic in Workers (APIs, data aggregation, SSR with DB calls)
- Worker uses `fetch` handler (not RPC methods)

**Do NOT enable for:**
- Workers serving only static content or cached responses
- Workers without significant backend communication
- Pure edge logic (auth checks, redirects, simple transformations)
- Workers without fetch event handlers
- Workers with RPC methods or named entrypoints (only `fetch` handlers are affected)
- Pages/Assets Workers with `run_worker_first = true` (degrades asset serving)

### Decision Tree

```
Does your Worker have a fetch handler?
â”œâ”€ No â†’ Smart Placement won't work (skip)
â””â”€ Yes
   â”‚
   Does it make multiple backend calls (DB/API)?
   â”œâ”€ No â†’ Don't enable (won't help)
   â””â”€ Yes
      â”‚
      Is backend geographically concentrated?
      â”œâ”€ No (globally distributed) â†’ Probably won't help
      â””â”€ Yes or uncertain
         â”‚
         Does it serve static assets with run_worker_first=true?
         â”œâ”€ Yes â†’ Don't enable (will hurt performance)
         â””â”€ No â†’ Enable Smart Placement
            â”‚
            After 15min, check placement_status
            â”œâ”€ SUCCESS â†’ Monitor metrics
            â”œâ”€ INSUFFICIENT_INVOCATIONS â†’ Need more traffic
            â””â”€ UNSUPPORTED_APPLICATION â†’ Disable (hurting performance)
```

### Key Architecture Pattern

**Recommended:** Split full-stack applications into separate Workers:
```
User â†’ Frontend Worker (at edge, close to user)
         â†“ Service Binding
       Backend Worker (Smart Placement enabled, close to DB/API)
         â†“
       Database/Backend Service
```

This maintains fast, reactive frontends while optimizing backend latency.

## Quick Start

```jsonc
// wrangler.jsonc
{
  "placement": {
    "mode": "smart"  // or "off" to explicitly disable
  }
}
```

Deploy and wait 15 minutes for analysis. Check status via API or dashboard metrics.

**To disable:** Set `"mode": "off"` or remove `placement` field entirely (both equivalent).

## Requirements

- Wrangler 2.20.0+
- Analysis time: Up to 15 minutes after enabling
- Traffic requirements: Consistent traffic from multiple global locations
- Available on all Workers plans (Free, Paid, Enterprise)

## Placement Status Values

```typescript
type PlacementStatus = 
  | undefined  // Not yet analyzed
  | 'SUCCESS'  // Successfully optimized
  | 'INSUFFICIENT_INVOCATIONS'  // Not enough traffic
  | 'UNSUPPORTED_APPLICATION';  // Made Worker slower (reverted)
```

## CLI Commands

```bash
# Deploy with Smart Placement
wrangler deploy

# Check placement status
curl -H "Authorization: Bearer $TOKEN" \
  https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/services/$WORKER_NAME \
  | jq .result.placement_status

# Monitor
wrangler tail your-worker-name --header cf-placement
```

## Reading Order

**First time?** Start here:
1. This README - understand core concepts and when to use Smart Placement
2. [configuration.md](./configuration.md) - set up wrangler.jsonc and understand limitations
3. [patterns.md](./patterns.md) - see practical examples for your use case
4. [api.md](./api.md) - monitor and verify Smart Placement is working
5. [gotchas.md](./gotchas.md) - troubleshoot common issues

**Quick lookup:**
- "Should I enable Smart Placement?" â†’ See "When to Use" above
- "How do I configure it?" â†’ [configuration.md](./configuration.md)
- "How do I split frontend/backend?" â†’ [patterns.md](./patterns.md)
- "Why isn't it working?" â†’ [gotchas.md](./gotchas.md)

## In This Reference

- [configuration.md](./configuration.md) - wrangler.jsonc setup, mode values, validation rules
- [api.md](./api.md) - Placement Status API, cf-placement header, monitoring
- [patterns.md](./patterns.md) - Frontend/backend split, database workers, SSR patterns
- [gotchas.md](./gotchas.md) - Troubleshooting INSUFFICIENT_INVOCATIONS, performance issues

## See Also

- [workers](https://developers.cloudflare.com/workers/) - Worker runtime and fetch handlers
- [d1](../d1/) - D1 database that benefits from Smart Placement
- [durable-objects](https://developers.cloudflare.com/durable-objects/) - Durable Objects with backend logic
- [bindings](../bindings/) - Service bindings for frontend/backend split

### .agents\skills\cloudflare\references\snippets\README.md
# Cloudflare Snippets Skill Reference

## Description
Expert guidance for **Cloudflare Snippets ONLY** - a lightweight JavaScript-based edge logic platform for modifying HTTP requests and responses. Snippets run as part of the Ruleset Engine and are included at no additional cost on paid plans (Pro, Business, Enterprise).

## What Are Snippets?
Snippets are JavaScript functions executed at the edge as part of Cloudflare's Ruleset Engine. Key characteristics:
- **Execution time**: 5ms CPU limit per request
- **Size limit**: 32KB per snippet
- **Runtime**: V8 isolate (subset of Workers APIs)
- **Subrequests**: 2-5 fetch calls depending on plan
- **Cost**: Included with Pro/Business/Enterprise plans

## Snippets vs Workers Decision Matrix

| Factor | Choose Snippets If... | Choose Workers If... |
|--------|----------------------|---------------------|
| **Complexity** | Simple request/response modifications | Complex business logic, routing, middleware |
| **Execution time** | <5ms sufficient | Need >5ms or variable time |
| **Subrequests** | 2-5 fetch calls sufficient | Need >5 subrequests or complex orchestration |
| **Code size** | <32KB sufficient | Need >32KB or npm dependencies |
| **Cost** | Want zero additional cost | Can afford $5/mo + usage |
| **APIs** | Need basic fetch, headers, URL | Need KV, D1, R2, Durable Objects, cron triggers |
| **Deployment** | Need rule-based triggers | Want custom routing logic |

**Rule of thumb**: Use Snippets for modifications, Workers for applications.

## Execution Model
1. Request arrives at Cloudflare edge
2. Ruleset Engine evaluates snippet rules (filter expressions)
3. If rule matches, snippet executes within 5ms limit
4. Modified request/response continues through pipeline
5. Response returned to client

Snippets execute synchronously in the request path - performance is critical.

## Reading Order
1. **[configuration.md](configuration.md)** - Start here: setup, deployment methods (Dashboard/API/Terraform)
2. **[api.md](api.md)** - Core APIs: Request, Response, headers, `request.cf` properties
3. **[patterns.md](patterns.md)** - Real-world examples: geo-routing, A/B tests, security headers
4. **[gotchas.md](gotchas.md)** - Troubleshooting: common errors, performance tips, API limitations

## In This Reference

- **[configuration.md](configuration.md)** - Setup, deployment, configuration
- **[api.md](api.md)** - API endpoints, methods, interfaces
- **[patterns.md](patterns.md)** - Common patterns, use cases, examples
- **[gotchas.md](gotchas.md)** - Troubleshooting, best practices, limitations

## Quick Start
```javascript
// Snippet: Add security headers
export default {
  async fetch(request) {
    const response = await fetch(request);
    const newResponse = new Response(response.body, response);
    newResponse.headers.set("X-Frame-Options", "DENY");
    newResponse.headers.set("X-Content-Type-Options", "nosniff");
    return newResponse;
  }
}
```

Deploy via Dashboard (Rules â†’ Snippets) or API/Terraform. See configuration.md for details.

## See Also

- [Cloudflare Docs](https://developers.cloudflare.com/rules/snippets/)

### .agents\skills\cloudflare\references\spectrum\README.md
# Cloudflare Spectrum Skill Reference

## Overview

Cloudflare Spectrum provides security and acceleration for ANY TCP or UDP-based application. It's a global Layer 4 (L4) reverse proxy running on Cloudflare's edge nodes that routes MQTT, email, file transfer, version control, games, and more through Cloudflare to mask origins and protect from DDoS attacks.

**When to Use Spectrum**: When your protocol isn't HTTP/HTTPS (use Cloudflare proxy for HTTP). Spectrum handles everything else: SSH, gaming, databases, MQTT, SMTP, RDP, custom protocols.

## Plan Capabilities

| Capability | Pro/Business | Enterprise |
|------------|--------------|------------|
| TCP protocols | Selected ports only | All ports (1-65535) |
| UDP protocols | Selected ports only | All ports (1-65535) |
| Port ranges | âŒ | âœ… |
| Argo Smart Routing | âœ… | âœ… |
| IP Firewall | âœ… | âœ… |
| Load balancer origins | âœ… | âœ… |

## Decision Tree

**What are you trying to do?**

1. **Create/manage Spectrum app**
   - Via Dashboard â†’ See [Cloudflare Dashboard](https://dash.cloudflare.com)
   - Via API â†’ See [api.md](api.md) - REST endpoints
   - Via SDK â†’ See [api.md](api.md) - TypeScript/Python/Go examples
   - Via IaC â†’ See [configuration.md](configuration.md) - Terraform/Pulumi

2. **Protect specific protocol**
   - SSH â†’ See [patterns.md](patterns.md#1-ssh-server-protection)
   - Gaming (Minecraft, etc) â†’ See [patterns.md](patterns.md#2-game-server)
   - MQTT/IoT â†’ See [patterns.md](patterns.md#3-mqtt-broker)
   - SMTP/Email â†’ See [patterns.md](patterns.md#4-smtp-relay)
   - Database â†’ See [patterns.md](patterns.md#5-database-proxy)
   - RDP â†’ See [patterns.md](patterns.md#6-rdp-remote-desktop)

3. **Choose origin type**
   - Direct IP (single server) â†’ See [configuration.md](configuration.md#direct-ip-origin)
   - CNAME (hostname) â†’ See [configuration.md](configuration.md#cname-origin)
   - Load balancer (HA/failover) â†’ See [configuration.md](configuration.md#load-balancer-origin)

## Reading Order

1. Start with [patterns.md](patterns.md) for your specific protocol
2. Then [configuration.md](configuration.md) for your origin type
3. Check [gotchas.md](gotchas.md) before going to production
4. Use [api.md](api.md) for programmatic access

## See Also

- [Cloudflare Docs](https://developers.cloudflare.com/spectrum/)

### .agents\skills\cloudflare\references\static-assets\README.md
# Workers Static Assets

Use Workers Static Assets for new static sites, SPAs, generated sites, and applications combining assets with server logic. Inspect the framework, build output, and existing deployment configuration before changing routing.

| Task | Documentation |
|------|---------------|
| Set up and deploy a static site or application | [Get started](https://developers.cloudflare.com/workers/static-assets/get-started/) |
| Choose configuration and an optional asset binding | [Configuration and bindings](https://developers.cloudflare.com/workers/static-assets/binding/) |
| Serve a client-rendered application | [SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/) |
| Serve generated HTML and custom error pages | [SSG routing](https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/) |
| Use a full-stack framework | [Full-stack application guides](https://developers.cloudflare.com/workers/static-assets/routing/full-stack-application/) |
| Evaluate moving an existing Pages project | [Pages migration guide](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/) |

Do not choose a platform solely from the framework name. For an existing Pages project, inspect its current features and migration requirements before proposing a move.

## Reading Order

1. [configuration.md](configuration.md) â€” build output and routing configuration.
2. [api.md](api.md) â€” fetch assets and handle responses.
3. [patterns.md](patterns.md) â€” choose a routing design.
4. [gotchas.md](gotchas.md) â€” diagnose routing, caching, and deployment issues.

### .agents\skills\cloudflare\references\stream\README.md
# Cloudflare Stream

Use Stream for on-demand video upload and playback or live broadcasting. Start with the application's upload source, player, and access requirements, then read the corresponding documentation before writing code.

## Choose a Workflow

| Task | Read |
|---|---|
| Let users upload without exposing an API token | [Direct creator uploads](https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/) |
| Choose server upload, resumable upload, or import from a URL | [Upload methods and supported formats](https://developers.cloudflare.com/stream/uploading-videos/) |
| Embed playback or integrate an existing player | [Stream Player](https://developers.cloudflare.com/stream/viewing-videos/using-the-stream-player/) or [HLS/DASH players](https://developers.cloudflare.com/stream/viewing-videos/using-own-player/) |
| Restrict viewing to authorized users or embedding origins | [Secure your Stream](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/) |
| Broadcast live, replay recordings, or simulcast | [Live workflow routing](./api-live.md) |
| Check usage, costs, or upload constraints | [Analytics](https://developers.cloudflare.com/stream/getting-analytics/), [pricing](https://developers.cloudflare.com/stream/pricing/), and [upload requirements](https://developers.cloudflare.com/stream/uploading-videos/) |

## In This Reference

- [configuration.md](./configuration.md): project setup and access decisions.
- [api.md](./api.md): upload, playback, editing, and library operations.
- [api-live.md](./api-live.md): live inputs, outputs, recording, and WebRTC.
- [patterns.md](./patterns.md): application workflow decisions.
- [gotchas.md](./gotchas.md): troubleshooting routes.

### .agents\skills\cloudflare\references\tail-workers\README.md
# Cloudflare Tail Workers

Use Tail Workers when execution events need custom processing. Fetch the current documentation before implementing handlers, configuration, or integrations.

| Task | Documentation |
| --- | --- |
| Decide whether custom processing is needed | [Tail Workers](https://developers.cloudflare.com/workers/observability/logs/tail-workers/) |
| Export logs and traces to an observability destination | [Exporting OpenTelemetry Data](https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/) |
| Inspect a deployment interactively | [Real-time logs](https://developers.cloudflare.com/workers/observability/logs/real-time-logs/) |
| Implement the consumer | [Tail handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/tail/) |

Before adding a Tail Worker, check whether built-in OpenTelemetry export meets the destinationâ€™s needs. Use the Tail Workers guide for the tradeoff, then identify the custom filtering or transformation that remains necessary.

## In This Reference

- [configuration.md](./configuration.md) â€” producer, consumer, destination, and environment setup
- [api.md](./api.md) â€” event fields, execution outcomes, and redaction
- [patterns.md](./patterns.md) â€” destination and filtering decisions
- [gotchas.md](./gotchas.md) â€” connection, data, and delivery investigation

See [observability](../observability/README.md) for broader logging and tracing choices.

### .agents\skills\cloudflare\references\terraform\README.md
# Cloudflare Terraform Provider

**Expert guidance for Cloudflare Terraform Provider - infrastructure as code for Cloudflare resources.**

## Core Principles

- **Provider-first**: Use Terraform provider for ALL infrastructure - never mix with wrangler.jsonc for the same resources
- **State management**: Always use remote state (S3, Terraform Cloud, etc.) for team environments
- **Modular architecture**: Create reusable modules for common patterns (zones, workers, pages)
- **Version pinning**: Always pin provider version with `~>` for predictable upgrades
- **Secret management**: Use variables + environment vars for sensitive data - never hardcode API tokens

## Provider Version

| Version | Status | Notes |
|---------|--------|-------|
| 5.x | Current | Auto-generated from OpenAPI, breaking changes from v4 |
| 4.x | Legacy | Manual maintenance, deprecated |

**Critical:** v5 renamed many resources (`cloudflare_record` â†’ `cloudflare_dns_record`, `cloudflare_worker_*` â†’ `cloudflare_workers_*`). See [gotchas.md](./gotchas.md#v5-breaking-changes) for migration details.

## Provider Setup

### Basic Configuration

```hcl
terraform {
  required_version = ">= 1.0"
  
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.15.0"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token  # or CLOUDFLARE_API_TOKEN env var
}
```

### Authentication Methods (priority order)

1. **API Token** (RECOMMENDED): `api_token` or `CLOUDFLARE_API_TOKEN`
   - Create: Dashboard â†’ My Profile â†’ API Tokens
   - Scope to specific accounts/zones for security
   
2. **Global API Key** (LEGACY): `api_key` + `api_email` or `CLOUDFLARE_API_KEY` + `CLOUDFLARE_EMAIL`
   - Less secure, use tokens instead
   
3. **User Service Key**: `user_service_key` for Origin CA certificates



## Quick Reference: Common Commands

```bash
terraform init          # Initialize provider
terraform plan          # Plan changes
terraform apply         # Apply changes
terraform destroy       # Destroy resources
terraform import cloudflare_zone.example <zone-id>  # Import existing
terraform state list    # List resources in state
terraform output        # Show outputs
terraform fmt -recursive  # Format code
terraform validate      # Validate configuration
```

## Import Existing Resources

Use cf-terraforming to generate configs from existing Cloudflare resources:

```bash
# Install
brew install cloudflare/cloudflare/cf-terraforming

# Generate HCL from existing resources
cf-terraforming generate --resource-type cloudflare_dns_record --zone <zone-id>

# Import into Terraform state
cf-terraforming import --resource-type cloudflare_dns_record --zone <zone-id>
```

## Reading Order

1. Start with [README.md](./README.md) for provider setup and authentication
2. Review [configuration.md](./configuration.md) for resource configurations
3. Check [api.md](./api.md) for data sources and existing resource queries
4. See [patterns.md](./patterns.md) for multi-environment and CI/CD patterns
5. Read [gotchas.md](./gotchas.md) for state drift, v5 breaking changes, and troubleshooting

## In This Reference
- [configuration.md](./configuration.md) - Resources for zones, DNS, workers, KV, R2, D1, Pages, rulesets
- [api.md](./api.md) - Data sources for existing resources
- [patterns.md](./patterns.md) - Architecture patterns, multi-env setup, CI/CD integration
- [gotchas.md](./gotchas.md) - Common issues, security, best practices

## See Also
- [pulumi](../pulumi/) - Alternative IaC tool for Cloudflare
- [wrangler](https://developers.cloudflare.com/workers/wrangler/) - CLI deployment alternative
- [workers](https://developers.cloudflare.com/workers/) - Worker runtime documentation

### .agents\skills\cloudflare\references\tunnel\README.md
# Cloudflare Tunnel

Use Tunnel to connect origin services to Cloudflare. Inspect the existing tunnel, management mode, and intended audience before choosing a setup. Fetch current docs for commands, configuration, and limits.

| Task | Documentation |
| --- | --- |
| Create a remotely-managed tunnel or a temporary development tunnel | [Setup](https://developers.cloudflare.com/tunnel/setup/) |
| Maintain a tunnel managed through local files | [Create a locally-managed tunnel](https://developers.cloudflare.com/tunnel/advanced/local-management/create-local-tunnel/) |
| Publish an application and check protocol requirements | [Routing](https://developers.cloudflare.com/tunnel/routing/) |
| Choose private networking, Workers VPC, or Access integration | [Integrations](https://developers.cloudflare.com/tunnel/integrations/) |

Decide whether the goal is a public application, authenticated private access, or connectivity from a Worker. Then identify who owns configuration and how it will be deployed; multiple environments alone do not require local management.

## In This Reference

- [configuration.md](./configuration.md) â€” management mode, ingress, and origin settings
- [networking.md](./networking.md) â€” firewall, connectivity, and private-network investigation
- [api.md](./api.md) â€” programmatic setup and tunnel operations
- [patterns.md](./patterns.md) â€” deployment and availability decisions
- [gotchas.md](./gotchas.md) â€” troubleshooting and operational checks

### .agents\skills\cloudflare\references\turn\README.md
# Cloudflare TURN Service

Expert guidance for implementing Cloudflare TURN Service in WebRTC applications.

## Overview

Cloudflare TURN (Traversal Using Relays around NAT) Service is a managed relay service for WebRTC applications. TURN acts as a relay point for traffic between WebRTC clients and SFUs, particularly when direct peer-to-peer communication is obstructed by NATs or firewalls. The service runs on Cloudflare's global anycast network across 310+ cities.

## Key Characteristics

- **Anycast Architecture**: Automatically connects clients to the closest Cloudflare location
- **Global Network**: Available across Cloudflare's entire network (excluding China Network)
- **Zero Configuration**: No need to manually select regions or servers
- **Protocol Support**: STUN/TURN over UDP, TCP, and TLS
- **Free Tier**: Free when used with Cloudflare Calls SFU, otherwise $0.05/GB outbound

## In This Reference

| File | Purpose |
|------|---------|
| [api.md](./api.md) | Credentials API, TURN key management, types, constraints |
| [configuration.md](./configuration.md) | Worker setup, wrangler.jsonc, env vars, IP allowlisting |
| [patterns.md](./patterns.md) | Implementation patterns, use cases, integration examples |
| [gotchas.md](./gotchas.md) | Troubleshooting, limits, security, common mistakes |

## Reading Order

| Task | Files to Read | Est. Tokens |
|------|---------------|-------------|
| Quick start | README only | ~500 |
| Generate credentials | README â†’ api | ~1300 |
| Worker integration | README â†’ configuration â†’ patterns | ~2000 |
| Debug connection | gotchas | ~700 |
| Security review | api â†’ gotchas | ~1500 |
| Enterprise firewall | configuration | ~600 |

## Service Addresses and Ports

### STUN over UDP
- **Primary**: `stun.cloudflare.com:3478/udp`
- **Alternate**: `stun.cloudflare.com:53/udp` (blocked by browsers, not recommended)

### TURN over UDP
- **Primary**: `turn.cloudflare.com:3478/udp`
- **Alternate**: `turn.cloudflare.com:53/udp` (blocked by browsers)

### TURN over TCP
- **Primary**: `turn.cloudflare.com:3478/tcp`
- **Alternate**: `turn.cloudflare.com:80/tcp`

### TURN over TLS
- **Primary**: `turn.cloudflare.com:5349/tcp`
- **Alternate**: `turn.cloudflare.com:443/tcp`

## Quick Start

1. **Create TURN key via API**: see [api.md#create-turn-key](./api.md#create-turn-key)
2. **Generate credentials**: see [api.md#generate-temporary-credentials](./api.md#generate-temporary-credentials)
3. **Configure Worker**: see [configuration.md#cloudflare-worker-integration](./configuration.md#cloudflare-worker-integration)
4. **Implement client**: see [patterns.md#basic-turn-configuration-browser](./patterns.md#basic-turn-configuration-browser)

## When to Use TURN

- **Restrictive NATs**: Symmetric NATs that block direct connections
- **Corporate firewalls**: Environments blocking WebRTC ports
- **Mobile networks**: Carrier-grade NAT scenarios
- **Predictable connectivity**: When reliability > efficiency

## Related Cloudflare Services

- **Cloudflare Calls SFU**: Managed Selective Forwarding Unit (TURN free when used with SFU)
- **Cloudflare Stream**: Video streaming with WHIP/WHEP support
- **Cloudflare Workers**: Backend for credential generation
- **Cloudflare KV**: Credential caching
- **Cloudflare Durable Objects**: Session state management

## Additional Resources

- [Cloudflare Calls Documentation](https://developers.cloudflare.com/calls/)
- [Cloudflare TURN Service Docs](https://developers.cloudflare.com/realtime/turn/)
- [Cloudflare API Reference](https://developers.cloudflare.com/api/resources/calls/subresources/turn/)
- [Orange Meets (Open Source Example)](https://github.com/cloudflare/orange)

### .agents\skills\cloudflare\references\vectorize\README.md
# Cloudflare Vectorize

Use Vectorize when you need to control embeddings, vector indexing, and retrieval for semantic search, recommendations, or RAG. For a managed retrieval pipeline, see [AI Search](../ai-search/README.md).

Fetch current documentation before implementing. Start with the [Vectorize documentation index](https://developers.cloudflare.com/vectorize/llms.txt) to discover pages; load only those relevant to the task. Treat the docs as the source of truth for APIs, configuration, models, limits, and pricing.

## Task routing

| Task | Read |
|------|------|
| Create an index and connect a Worker | [Configuration](configuration.md) and [Introduction to Vectorize](https://developers.cloudflare.com/vectorize/get-started/intro/) |
| Insert, update, query, retrieve, or delete vectors | [API routes](api.md) |
| Generate embeddings, build RAG, or partition tenant data | [Patterns](patterns.md) |
| Diagnose missing matches, metadata, or rejected requests | [Gotchas](gotchas.md) |

## Decisions to make first

- Use a consistent embedding model and preprocessing for stored vectors and queries. Matching dimensions alone does not make different models' embeddings compatible.
- Choose dimensions from the embedding output and a distance metric appropriate to that model. Changing either requires a new index; check [index configuration and scoring semantics](https://developers.cloudflare.com/vectorize/best-practices/create-indexes/) before choosing thresholds.
- Plan filterable metadata before ingestion. Adding an index later requires re-upserting existing vectors to index that metadata; see [metadata filtering](https://developers.cloudflare.com/vectorize/reference/metadata-filtering/).
- A namespace partitions search; your application must authorize access and derive tenant scope from trusted identity. See [tenant patterns](patterns.md).
- Design for asynchronous mutation visibility rather than assuming a completed write is already searchable. See [mutation semantics](https://developers.cloudflare.com/vectorize/reference/client-api/).

### .agents\skills\cloudflare\references\waf\README.md
# Cloudflare WAF

Use this reference for managed protection, custom request policies, rate limiting, and investigation of blocked traffic. Read the relevant developer documentation before implementing; it owns schemas, expressions, ruleset IDs, phase order, and plan availability.

| Task | Start here |
|------|------------|
| Choose and enable WAF protections | [Get started](https://developers.cloudflare.com/waf/get-started/) |
| Deploy managed protection | [Managed rules deployment](https://developers.cloudflare.com/waf/managed-rules/deploy-api/) |
| Match application-specific requests | [Custom rules](https://developers.cloudflare.com/waf/custom-rules/create-api/) |
| Limit request volume | [Rate limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/create-api/) |
| Understand score-based detection | [Attack score](https://developers.cloudflare.com/waf/detections/attack-score/) |
| Diagnose blocked or unmitigated requests | [Managed rules troubleshooting](https://developers.cloudflare.com/waf/managed-rules/troubleshooting/) |

Identify the target account or zone and inspect existing rules before planning a change. Keep the requested traffic scope explicit, especially for exceptions and account-wide deployments.

## Reading Order

1. [configuration.md](configuration.md) â€” deployment method and existing configuration.
2. [api.md](api.md) â€” API workflows and expression references.
3. [patterns.md](patterns.md) â€” choose a protection or exception workflow.
4. [gotchas.md](gotchas.md) â€” diagnose ordering, scope, and false positives.

### .agents\skills\cloudflare\references\web-analytics\README.md
# Cloudflare Web Analytics

Privacy-first web analytics providing Core Web Vitals, traffic metrics, and user insights without compromising visitor privacy.

## Overview

Cloudflare Web Analytics provides:
- **Core Web Vitals** - LCP, FID, CLS, INP, TTFB monitoring
- **Page views & visits** - Traffic patterns without cookies
- **Referrers & paths** - Traffic sources and popular pages
- **Device & browser data** - User agent breakdown
- **Geographic data** - Country-level visitor distribution
- **Privacy-first** - No cookies, fingerprinting, or PII collection
- **Free** - No cost, unlimited pageviews

**Important:** Web Analytics is **dashboard-only**. No API exists for programmatic data access.

## Quick Start Decision Tree

```
Is your site proxied through Cloudflare?
â”œâ”€ YES â†’ Use automatic injection (configuration.md)
â”‚   â”œâ”€ Enable auto-injection in dashboard
â”‚   â””â”€ No code changes needed (unless Cache-Control: no-transform)
â”‚
â””â”€ NO â†’ Use manual beacon integration (integration.md)
    â”œâ”€ Add JS snippet to HTML
    â”œâ”€ Use spa: true for React/Vue/Next.js
    â””â”€ Configure CSP if needed
```

## Reading Order

1. **[configuration.md](configuration.md)** - Setup for proxied vs non-proxied sites
2. **[integration.md](integration.md)** - Framework-specific beacon integration (React, Next.js, Vue, Nuxt, etc.)
3. **[patterns.md](patterns.md)** - Common use cases (performance monitoring, GDPR consent, multi-site tracking)
4. **[gotchas.md](gotchas.md)** - Troubleshooting (SPA tracking, CSP issues, hash routing limitations)

## When to Use Each File

- **Setting up for first time?** â†’ Start with configuration.md
- **Using React/Next.js/Vue/Nuxt?** â†’ Go to integration.md for framework code
- **Need GDPR consent loading?** â†’ See patterns.md
- **Beacon not loading or no data?** â†’ Check gotchas.md
- **SPA not tracking navigation?** â†’ See integration.md for `spa: true` config

## Key Concepts

### Proxied vs Non-Proxied Sites

| Type | Description | Beacon Injection | Limit |
|------|-------------|------------------|-------|
| **Proxied** | DNS through Cloudflare (orange cloud) | Automatic or manual | Unlimited |
| **Non-proxied** | External hosting, manual beacon | Manual only | 10 sites max |

### SPA Mode

**Critical for modern frameworks:**
```json
{"token": "YOUR_TOKEN", "spa": true}
```

Without `spa: true`, client-side navigation (React Router, Vue Router, Next.js routing) will NOT be tracked. Only initial page loads will register.

### CSP Requirements

If using Content Security Policy, allow both domains:
```
script-src https://static.cloudflareinsights.com https://cloudflareinsights.com;
```

## Features

### Core Web Vitals Debugging
- **LCP (Largest Contentful Paint)** - Identifies slow-loading hero images/elements
- **FID (First Input Delay)** - Interaction responsiveness (legacy metric)
- **INP (Interaction to Next Paint)** - Modern interaction responsiveness metric
- **CLS (Cumulative Layout Shift)** - Visual stability issues
- **TTFB (Time to First Byte)** - Server response performance

Dashboard shows top 5 problematic elements with CSS selectors for debugging.

### Traffic Filters
- **Bot filtering** - Exclude automated traffic from metrics
- **Date ranges** - Custom time period analysis
- **Geographic** - Country-level filtering
- **Device type** - Desktop, mobile, tablet breakdown
- **Browser/OS** - User agent filtering

### Rules (Advanced - Plan-dependent)

Create custom tracking rules for advanced configurations:

**Sample Rate Rules:**
- Reduce data collection percentage for high-traffic sites
- Example: Track only 50% of visitors to reduce volume

**Path-Based Rules:**
- Different behavior per route
- Example: Exclude `/admin/*` or `/internal/*` from tracking

**Host-Based Rules:**
- Multi-domain configurations
- Example: Separate tracking for staging vs production subdomains

**Availability:** Rules feature depends on your Cloudflare plan. Check dashboard under Web Analytics â†’ Rules to see if available. Free plans may have limited or no access.

## Plan Limits

| Feature | Free | Notes |
|---------|------|-------|
| Proxied sites | Unlimited | DNS through Cloudflare |
| Non-proxied sites | 10 | External hosting |
| Pageviews | Unlimited | No volume limits |
| Data retention | 6 months | Rolling window |
| Rules | Plan-dependent | Check dashboard |

## Privacy & Compliance

- **No cookies** - Zero client-side storage
- **No fingerprinting** - No tracking across sites
- **No PII** - IP addresses not stored
- **GDPR-friendly** - Minimal data collection
- **CCPA-compliant** - No personal data sale

**EU opt-out:** Dashboard option to exclude EU visitor data entirely.

## Limitations

- **Dashboard-only** - No API for programmatic access
- **No real-time** - 5-10 minute data delay
- **No custom events** - Automatic pageview/navigation tracking only
- **History API only** - Hash-based routing (`#/path`) not supported
- **No session replay** - Metrics only, no user recordings
- **No form tracking** - Page navigation tracking only

## See Also

- [Cloudflare Web Analytics Docs](https://developers.cloudflare.com/analytics/web-analytics/)
- [Core Web Vitals Guide](https://web.dev/vitals/)
- [GraphQL Analytics API Reference](../graphql-api/) - Query server-side analytics (HTTP, Workers, DNS, Firewall, etc.) via GraphQL

### .agents\skills\cloudflare\references\workerd\README.md
# Workerd Runtime

V8-based JS/Wasm runtime powering Cloudflare Workers. Use as app server, dev tool, or HTTP proxy.

## âš ï¸ IMPORTANT SECURITY NOTICE
**workerd is NOT a hardened sandbox.** Do not run untrusted code. It's designed for deploying YOUR code locally/self-hosted, not multi-tenant SaaS. Cloudflare production adds security layers not present in open-source workerd.

## Decision Tree: When to Use What

**95% of users:** Use Wrangler
- Local development: `wrangler dev` (uses workerd internally)
- Deployment: `wrangler deploy` (deploys to Cloudflare)
- Types: `wrangler types` (generates TypeScript types)

**Use raw workerd directly only if:**
- Self-hosting Workers runtime in production
- Embedding runtime in C++ application
- Custom tooling/testing infrastructure
- Debugging workerd-specific behavior

**Never use workerd for:**
- Running untrusted/user-submitted code
- Multi-tenant isolation (not hardened)
- Production without additional security layers

## Key Features
- **Standards-based**: Fetch API, Web Crypto, Streams, WebSocket
- **Nanoservices**: Service bindings with local call performance
- **Capability security**: Explicit bindings prevent SSRF
- **Backwards compatible**: Version = max compat date supported

## Architecture
```
Config (workerd.capnp)
â”œâ”€â”€ Services (workers/endpoints)
â”œâ”€â”€ Sockets (HTTP/HTTPS listeners)
â””â”€â”€ Extensions (global capabilities)
```

## Quick Start
```bash
workerd serve config.capnp
workerd compile config.capnp myConfig -o binary
workerd test config.capnp
```

## Platform Support & Beta Status

| Platform | Status | Notes |
|----------|--------|-------|
| Linux (x64) | Stable | Primary platform |
| macOS (x64/ARM) | Stable | Full support |
| Windows | Beta | Use WSL2 for best results |
| Linux (ARM64) | Experimental | Limited testing |

workerd is in **active development**. Breaking changes possible. Pin versions in production.

## Core Concepts
- **Service**: Named endpoint (worker/network/disk/external)
- **Binding**: Capability-based resource access (KV/DO/R2/services)
- **Compatibility date**: Feature gate (always set!)
- **Modules**: ES modules (recommended) or service worker syntax

## Reading Order (Progressive Disclosure)

**Start here:**
1. This README (overview, decision tree)
2. [patterns.md](./patterns.md) - Common workflows, framework examples

**When you need details:**
3. [configuration.md](./configuration.md) - Config format, services, bindings
4. [api.md](./api.md) - Runtime APIs, TypeScript types
5. [gotchas.md](./gotchas.md) - Common errors, debugging

## Related References
- [workers](https://developers.cloudflare.com/workers/) - Workers runtime API documentation
- [miniflare](../miniflare/) - Testing tool built on workerd
- [wrangler](https://developers.cloudflare.com/workers/wrangler/) - CLI that uses workerd for local dev

### .agents\skills\cloudflare\references\workers-ai\README.md
# Cloudflare Workers AI

Use Workers AI for managed model inference from Workers or an external service. Fetch the relevant documentation before choosing a model or writing integration code; model availability, schemas, capabilities, limits, and prices change independently.

## Choose a model

Start with the [model catalog](https://developers.cloudflare.com/workers-ai/models/) and open the selected model's page for its exact identifier, input/output schema, context window, and supported features. Compare candidates on the user's task, language, quality requirements, latency, and [current pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/). Evaluate with representative inputs rather than treating model size as a quality or cost ranking.

For tool use, streaming, or structured output, confirm support for the selected model and integration. For embeddings, check output dimensions and compatibility with the existing index; changing the model may require re-embedding stored documents, even if dimensions match.

## Route by task

- [configuration.md](./configuration.md): choose an integration, configure bindings and types, or set up development.
- [api.md](./api.md): find inference schemas, streaming, tool calling, and structured output.
- [patterns.md](./patterns.md): choose direct generation or RAG, and find integration examples.
- [gotchas.md](./gotchas.md): diagnose binding, schema, limit, pricing, and SDK issues.

If a topic is missing, use the [Workers AI documentation index](https://developers.cloudflare.com/workers-ai/llms.txt) to find its current page.

## Related products

- [Vectorize](../vectorize/): vector storage and retrieval.
- [AI Gateway](../ai-gateway/): inference analytics, caching, and request controls.
- [Workers](https://developers.cloudflare.com/workers/): runtime and application hosting.

### .agents\skills\cloudflare\references\workers-for-platforms\README.md
# Cloudflare Workers for Platforms

Multi-tenant platform with isolated customer code execution at scale.

## Use Cases

- Multi-tenant SaaS running customer code
- AI-generated code execution in secure sandboxes
- Programmable platforms with isolated compute
- Edge functions/serverless platforms
- Website builders with static + dynamic content
- Unlimited app deployment at scale

**NOT for general Workers** - only for Workers for Platforms architecture.

## Quick Start

**One-click deploy:** [Platform Starter Kit](https://github.com/cloudflare/workers-for-platforms-example) deploys complete WfP setup with dispatch namespace, dispatch worker, and user worker example.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/workers-for-platforms-example)

**Manual setup:** See [configuration.md](./configuration.md) for namespace creation and dispatch worker configuration.

## Key Features

- Unlimited Workers per namespace (no script limits)
- Automatic tenant isolation
- Custom CPU/subrequest limits per customer
- Hostname routing (subdomains/vanity domains)
- Egress/ingress control
- Static assets support
- Tags for bulk operations

## Architecture

**4 Components:**
1. **Dispatch Namespace** - Container for unlimited customer Workers, automatic isolation (untrusted mode by default - no request.cf access, no shared cache)
2. **Dynamic Dispatch Worker** - Entry point, routes requests, enforces platform logic (auth, limits, validation)
3. **User Workers** - Customer code in isolated sandboxes, API-deployed, optional bindings (KV/D1/R2/DO)
4. **Outbound Worker** (optional) - Intercepts external fetch, controls egress, logs subrequests (blocks TCP socket connect() API)

**Request Flow:**
```
Request â†’ Dispatch Worker â†’ Determines user Worker â†’ env.DISPATCHER.get("customer") 
â†’ User Worker executes (Outbound Worker for external fetch) â†’ Response â†’ Dispatch Worker â†’ Client
```

## Decision Trees

### When to Use Workers for Platforms
```
Need to run code?
â”œâ”€ Your code only â†’ Regular Workers
â”œâ”€ Customer/AI code â†’ Workers for Platforms
â””â”€ Untrusted code in sandbox â†’ Workers for Platforms OR Sandbox API
```

### Routing Strategy Selection
```
Hostname routing needed?
â”œâ”€ Subdomains only (*.saas.com) â†’ `*.saas.com/*` route + subdomain extraction
â”œâ”€ Custom domains â†’ `*/*` wildcard + Cloudflare for SaaS + KV/metadata routing
â””â”€ Path-based (/customer/app) â†’ Any route + path parsing
```

### Isolation Mode Selection
```
Worker mode?
â”œâ”€ Running customer code â†’ Untrusted (default)
â”œâ”€ Need request.cf geolocation â†’ Trusted mode
â”œâ”€ Internal platform, controlled code â†’ Trusted mode with cache key prefixes
â””â”€ Maximum isolation â†’ Untrusted + unique resources per customer
```

## In This Reference

| File | Purpose | When to Read |
|------|---------|--------------|
| [configuration.md](./configuration.md) | Namespace setup, dispatch worker config | First-time setup, changing limits |
| [api.md](./api.md) | User worker API, dispatch API, outbound worker | Deploying workers, SDK integration |
| [patterns.md](./patterns.md) | Multi-tenancy, routing, egress control | Planning architecture, scaling |
| [gotchas.md](./gotchas.md) | Limits, isolation issues, best practices | Debugging, production prep |

## See Also
- [workers](https://developers.cloudflare.com/workers/) - Core Workers runtime documentation
- [durable-objects](https://developers.cloudflare.com/durable-objects/) - Stateful multi-tenant patterns
- [sandbox](https://developers.cloudflare.com/sandbox/) - Alternative for untrusted code execution
- [Reference Architecture: Programmable Platforms](https://developers.cloudflare.com/reference-architecture/diagrams/serverless/programmable-platforms/)
- [Reference Architecture: AI Vibe Coding Platform](https://developers.cloudflare.com/reference-architecture/diagrams/ai/ai-vibe-coding-platform/)

### .agents\skills\cloudflare\references\workers-playground\README.md
# Cloudflare Workers Playground Skill Reference

## Overview

Cloudflare Workers Playground is a browser-based sandbox for instantly experimenting with, testing, and deploying Cloudflare Workers without authentication or setup. This skill provides patterns, APIs, and best practices specifically for Workers Playground development.

**URL:** [workers.cloudflare.com/playground](https://workers.cloudflare.com/playground)

## âš ï¸ Playground Constraints

**Playground is NOT production-equivalent:**
- âœ… Real Workers runtime, instant testing, shareable URLs
- âŒ No TypeScript (JavaScript only)
- âŒ No bindings (KV, D1, R2, Durable Objects)
- âŒ No environment variables or secrets
- âŒ ES modules only (no Service Worker format)
- âš ï¸ Safari broken (use Chrome/Firefox)

**For production:** Use `wrangler` CLI. Playground is for rapid prototyping.

## Quick Start

Minimal Worker:

```javascript
export default {
  async fetch(request, env, ctx) {
    return new Response('Hello World');
  }
};
```

JSON API:

```javascript
export default {
  async fetch(request, env, ctx) {
    const data = { message: 'Hello', timestamp: Date.now() };
    return Response.json(data);
  }
};
```

Proxy with modification:

```javascript
export default {
  async fetch(request, env, ctx) {
    const response = await fetch('https://example.com');
    const modified = new Response(response.body, response);
    modified.headers.set('X-Custom-Header', 'added-by-worker');
    return modified;
  }
};
```

Import from CDN:

```javascript
import { Hono } from 'https://esm.sh/hono@3';

export default {
  async fetch(request) {
    const app = new Hono();
    app.get('/', (c) => c.text('Hello Hono!'));
    return app.fetch(request);
  }
};
```

## Reading Order

1. **[configuration.md](configuration.md)** - Start here: playground setup, constraints, deployment
2. **[api.md](api.md)** - Core APIs: Request, Response, ExecutionContext, fetch, Cache
3. **[patterns.md](patterns.md)** - Common use cases: routing, proxying, A/B testing, multi-module code
4. **[gotchas.md](gotchas.md)** - Troubleshooting: errors, browser issues, limits, best practices

## In This Reference

- **[configuration.md](configuration.md)** - Setup, deployment, configuration
- **[api.md](api.md)** - API endpoints, methods, interfaces
- **[patterns.md](patterns.md)** - Common patterns, use cases, examples
- **[gotchas.md](gotchas.md)** - Troubleshooting, best practices, limitations

## Key Features

**No Setup Required:**
- Open URL and start coding
- No CLI, no account, no config files
- Code executes in real Cloudflare Workers runtime

**Instant Preview:**
- Live preview pane with browser tab or HTTP tester
- Auto-reload on code changes
- DevTools integration (right-click â†’ Inspect)

**Share & Deploy:**
- Copy Link generates permanent shareable URL
- Deploy button publishes to production in ~30 seconds
- Get `*.workers.dev` subdomain immediately

## Common Use Cases

- **API development:** Test endpoints before wrangler setup
- **Learning Workers:** Experiment with APIs without local environment
- **Prototyping:** Quick POCs for edge logic
- **Sharing examples:** Generate shareable links for bug reports or demos
- **Framework testing:** Import from CDN (Hono, itty-router, etc.)

## Limitations vs Production

| Feature | Playground | Production (wrangler) |
|---------|------------|----------------------|
| Language | JavaScript only | JS + TypeScript |
| Bindings | None | KV, D1, R2, DO, AI, etc. |
| Environment vars | None | Full support |
| Module format | ES only | ES + Service Worker |
| CPU time | 10ms (Free plan) | 10ms Free / 30s default, 5min max Paid |
| Custom domains | No | Yes |
| Analytics | No | Yes |

## See Also

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Workers Examples](https://developers.cloudflare.com/workers/examples/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- [Workers API Reference](https://developers.cloudflare.com/workers/runtime-apis/)

### .agents\skills\cloudflare\references\workers-vpc\README.md
# Workers VPC Connectivity

Connect Cloudflare Workers to private networks and internal infrastructure using TCP Sockets.

## Overview

Workers VPC connectivity enables outbound TCP connections from Workers to private resources in AWS, Azure, GCP, on-premises datacenters, or any private network. This is achieved through the **TCP Sockets API** (`cloudflare:sockets`), which provides low-level network access for custom protocols and services.

**Key capabilities:**
- Direct TCP connections to private IPs and hostnames
- TLS/StartTLS support for encrypted connections
- Integration with Cloudflare Tunnel for secure private network access
- Full control over wire protocols (database protocols, SSH, MQTT, custom TCP)

**Note:** This reference documents the TCP Sockets API. For the newer Workers VPC Services product (HTTP-only service bindings with built-in SSRF protection), refer to separate documentation when available. VPC Services is currently in beta (2025+).

## Quick Decision: Which Technology?

Need private network connectivity from Workers?

| Requirement | Use | Why |
|------------|-----|-----|
| HTTP/HTTPS APIs in private network | VPC Services (beta, separate docs) | SSRF-safe, declarative bindings |
| PostgreSQL/MySQL databases | [Hyperdrive](../hyperdrive/) | Connection pooling, caching, optimized |
| Custom TCP protocols (SSH, MQTT, proprietary) | **TCP Sockets (this doc)** | Full protocol control |
| Simple HTTP with lowest latency | TCP Sockets + [Smart Placement](../smart-placement/) | Manual optimization |
| Expose on-prem to internet (inbound) | [Cloudflare Tunnel](../tunnel/) | Not Worker-specific |

## When to Use TCP Sockets

**Use TCP Sockets when you need:**
- âœ… Direct control over wire protocols (e.g., Postgres wire protocol, SSH, Redis RESP)
- âœ… Non-HTTP protocols (MQTT, SMTP, custom binary protocols)
- âœ… StartTLS or custom TLS negotiation
- âœ… Streaming binary data over TCP

**Don't use TCP Sockets when:**
- âŒ You just need HTTP/HTTPS (use `fetch()` or VPC Services)
- âŒ You need PostgreSQL/MySQL (use Hyperdrive for pooling)
- âŒ You need WebSocket (use native Workers WebSocket)

## Quick Start

```typescript
import { connect } from 'cloudflare:sockets';

export default {
  async fetch(req: Request): Promise<Response> {
    // Connect to private service
    const socket = connect(
      { hostname: "db.internal.company.net", port: 5432 },
      { secureTransport: "on" }
    );

    try {
      await socket.opened; // Wait for connection
      
      const writer = socket.writable.getWriter();
      await writer.write(new TextEncoder().encode("QUERY\r\n"));
      await writer.close();

      const reader = socket.readable.getReader();
      const { value } = await reader.read();
      
      return new Response(value);
    } finally {
      await socket.close();
    }
  }
};
```

## Architecture Pattern: Workers + Tunnel

Most private network connectivity combines TCP Sockets with Cloudflare Tunnel:

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”     â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”     â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”     â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Worker  â”‚â”€â”€â”€â”€â–¶â”‚ TCP Socket  â”‚â”€â”€â”€â”€â–¶â”‚   Tunnel     â”‚â”€â”€â”€â”€â–¶â”‚   Private   â”‚
â”‚         â”‚     â”‚ (this API)  â”‚     â”‚ (cloudflared)â”‚     â”‚   Network   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜     â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜     â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜     â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

1. Worker opens TCP socket to Tunnel hostname
2. Tunnel endpoint routes to private IP
3. Response flows back through Tunnel to Worker

See [configuration.md](./configuration.md) for Tunnel setup details.

## Reading Order

1. **Start here (README.md)** - Overview and decision guide
2. **[api.md](./api.md)** - Socket interface, types, methods
3. **[configuration.md](./configuration.md)** - Wrangler setup, Tunnel integration
4. **[patterns.md](./patterns.md)** - Real-world examples (databases, protocols, error handling)
5. **[gotchas.md](./gotchas.md)** - Limits, blocked ports, common errors

## Key Limits

| Limit | Value |
|-------|-------|
| Max concurrent sockets per request | 6 |
| Blocked destinations | Cloudflare IPs, localhost, port 25 |
| Scope requirement | Must create in handler (not global) |

See [gotchas.md](./gotchas.md) for complete limits and troubleshooting.

## Best Practices

1. **Always close sockets** - Use try/finally blocks
2. **Validate destinations** - Prevent SSRF by allowlisting hosts
3. **Use Hyperdrive for databases** - Better performance than raw TCP
4. **Prefer fetch() for HTTP** - Only use TCP when necessary
5. **Combine with Smart Placement** - Reduce latency to private networks

## Related Technologies

- **[Hyperdrive](../hyperdrive/)** - PostgreSQL/MySQL with connection pooling
- **[Cloudflare Tunnel](../tunnel/)** - Secure private network access
- **[Smart Placement](../smart-placement/)** - Auto-locate Workers near backends
- **VPC Services (beta)** - HTTP-only service bindings with SSRF protection (separate docs)

## Reference

- [TCP Sockets API Documentation](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/)
- [Connect to databases guide](https://developers.cloudflare.com/workers/tutorials/postgres/)
- [Cloudflare Tunnel setup](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)

### .agents\skills\cloudflare\references\workflows\README.md
# Cloudflare Workflows

Use Workflows for durable, multi-step jobs that must retry, wait, and resume without losing completed work. An instance is one execution; steps define persistence and retry boundaries.

Fetch the relevant current documentation before implementing. API shapes, configuration, testing helpers, limits, and examples belong in the docs rather than in this reference.

- **Start a project:** [Build your first Workflow](https://developers.cloudflare.com/workflows/get-started/guide/) covers scaffolding, configuration, deployment, and a first instance.
- **Design durable execution:** [Rules of Workflows](https://developers.cloudflare.com/workflows/build/rules-of-workflows/) covers step boundaries, replay, state, and idempotency.
- **Implement or manage an instance:** [Workers API](https://developers.cloudflare.com/workflows/build/workers-api/) covers steps, instance operations, parameters, and return types.
- **Check capacity and cost:** fetch [limits](https://developers.cloudflare.com/workflows/reference/limits/) and [pricing](https://developers.cloudflare.com/workflows/reference/pricing/) for the target plan.

## In This Reference

- [configuration.md](./configuration.md) â€” setup, bindings, retry configuration, and local development
- [api.md](./api.md) â€” steps, instance lifecycle, events, CLI, and REST operations
- [patterns.md](./patterns.md) â€” design decisions, examples, orchestration, and tests
- [gotchas.md](./gotchas.md) â€” failures, timeouts, replay, and capacity investigation

## See Also

- [Durable Objects](https://developers.cloudflare.com/durable-objects/) â€” stateful coordination
- [Queues](../queues/README.md) â€” asynchronous message delivery
- [Workers](https://developers.cloudflare.com/workers/) â€” application entry points that trigger instances

### .agents\skills\cloudflare\references\zaraz\README.md
# Cloudflare Zaraz

Expert guidance for Cloudflare Zaraz - server-side tag manager for loading third-party tools at the edge.

## What is Zaraz?

Zaraz offloads third-party scripts (analytics, ads, chat, marketing) to Cloudflare's edge, improving site speed, privacy, and security. Zero client-side performance impact.

**Core Concepts:**
- **Server-side execution** - Scripts run on Cloudflare, not user's browser
- **Single HTTP request** - All tools loaded via one endpoint
- **Privacy-first** - Control data sent to third parties
- **No client-side JS overhead** - Minimal browser impact

## Quick Start

1. Navigate to domain > Zaraz in Cloudflare dashboard
2. Click "Start setup"
3. Add tools (Google Analytics, Facebook Pixel, etc.)
4. Configure triggers (when tools fire)
5. Add tracking code to your site:

```javascript
// Track page view
zaraz.track('page_view');

// Track custom event
zaraz.track('button_click', { button_id: 'cta' });

// Set user properties
zaraz.set('userId', 'user_123');
```

## When to Use Zaraz

**Use Zaraz when:**
- Adding multiple third-party tools (analytics, ads, marketing)
- Site performance is critical (no client-side JS overhead)
- Privacy compliance required (GDPR, CCPA)
- Non-technical teams need to manage tools

**Use Workers directly when:**
- Building custom server-side tracking logic
- Need full control over data processing
- Integrating with complex backend systems
- Zaraz's tool library doesn't meet needs

## In This Reference

| File | Purpose | When to Read |
|------|---------|--------------|
| [api.md](./api.md) | Web API, zaraz object, consent methods | Implementing tracking calls |
| [configuration.md](./configuration.md) | Dashboard setup, triggers, tools | Initial setup, adding tools |
| [patterns.md](./patterns.md) | SPA, e-commerce, Worker integration | Best practices, common scenarios |
| [gotchas.md](./gotchas.md) | Troubleshooting, limits, pitfalls | Debugging issues |

## Reading Order by Task

| Task | Files to Read |
|------|---------------|
| Add analytics to site | README â†’ configuration.md |
| Track custom events | README â†’ api.md |
| Debug tracking issues | gotchas.md |
| SPA tracking | api.md â†’ patterns.md (SPA section) |
| E-commerce tracking | api.md#ecommerce â†’ patterns.md#ecommerce |
| Worker integration | patterns.md#worker-integration |
| GDPR compliance | api.md#consent â†’ configuration.md#consent |

## Decision Tree

```
What do you need?

â”œâ”€ Track events in browser â†’ api.md
â”‚   â”œâ”€ Page views, clicks â†’ zaraz.track()
â”‚   â”œâ”€ User properties â†’ zaraz.set()
â”‚   â””â”€ E-commerce â†’ zaraz.ecommerce()
â”‚
â”œâ”€ Configure Zaraz â†’ configuration.md
â”‚   â”œâ”€ Add GA4/Facebook â†’ tools setup
â”‚   â”œâ”€ When tools fire â†’ triggers
â”‚   â””â”€ GDPR consent â†’ consent purposes
â”‚
â”œâ”€ Integrate with Workers â†’ patterns.md#worker-integration
â”‚   â”œâ”€ Enrich context â†’ Context Enrichers
â”‚   â””â”€ Inject tracking â†’ HTML rewriting
â”‚
â””â”€ Debug issues â†’ gotchas.md
    â”œâ”€ Events not firing â†’ troubleshooting
    â”œâ”€ Consent issues â†’ consent debugging
    â””â”€ Performance â†’ debugging tools
```

## Key Features

- **100+ Pre-built Tools** - GA4, Facebook, Google Ads, TikTok, etc.
- **Zero Client Impact** - Runs at Cloudflare's edge, not browser
- **Privacy Controls** - Consent management, data filtering
- **Custom Tools** - Build Managed Components for proprietary systems
- **Worker Integration** - Enrich context, compute dynamic values
- **Debug Mode** - Real-time event inspection

## Reference

- [Zaraz Docs](https://developers.cloudflare.com/zaraz/)
- [Web API](https://developers.cloudflare.com/zaraz/web-api/)
- [Managed Components](https://developers.cloudflare.com/zaraz/advanced/load-custom-managed-component/)

---

This skill focuses exclusively on Zaraz. For Workers development, see `cloudflare-workers` skill.

### AGENTS.md
# Artisan Marketplace â€” Agent Operating Contract

## 1. Project Purpose

Build a production-grade, cross-device, offline-first marketplace for marginalized artisans.

The first validated product journey is:

artisan captures photo + voice
â†’ saves draft offline
â†’ syncs when connected
â†’ uploads media
â†’ AI-assisted catalog draft
â†’ artisan corrects/confirms
â†’ publishes
â†’ buyer searches/discovers
â†’ buyer sends inquiry

Do not expand the product surface before this vertical slice is understood and working.

---

## 1A. Rule Precedence

When instructions overlap, resolve them in this order:

1. Safety, security, privacy, and data-loss prevention requirements
2. Explicit user requirements for the current task
3. This `AGENTS.md`
4. Approved project specifications, ADRs, and contracts
5. Task-specific skill instructions
6. Generic examples, recipes, templates, and defaults inside skills

Generic skill examples are reference material, not project architecture.

Never import example technologies, database patterns, authentication models, APIs, or UI architecture merely because a skill demonstrates them.

When two applicable instructions genuinely conflict:
- stop
- identify the conflict
- preserve the higher-priority constraint
- ask for clarification when the conflict cannot be resolved safely

---

## 2. Current Phase

PHASE: Engineering foundation

The repository is intentionally starting clean.

Before substantial product implementation:
1. establish product/spec documents
2. establish architecture decisions
3. establish data/state contracts
4. establish failure and permission behavior
5. then implement the smallest verified slice

Do not jump directly into building many screens.

---

## 3. Engineering Principles

### Think before coding
State assumptions.
Detect ambiguity.
Identify the smallest safe change.
Define verification before implementation.

### Simplicity first
Prefer:
- existing project code
- standard library
- existing dependency
- native platform capability
- smallest necessary implementation

Do not introduce abstractions without a demonstrated need.

Minimal does NOT mean removing:
- security
- validation
- accessibility
- data-loss protection
- failure handling
- authorization
- observability required to operate the feature

### Surgical changes
Change only what the task requires.

Do not perform unrelated refactors, renames, dependency upgrades, formatting sweeps, or architecture rewrites.

### Goal-driven execution
Every implementation task must have:
- observable goal
- acceptance criteria
- verification
- known risks

### Incremental implementation
Prefer thin, independently verifiable slices.

Large multi-system changes must be decomposed before implementation.

---

## 4. Skill Routing

Do NOT invoke every installed skill for every task.

Use skills according to the task.

Typical new feature flow:

context-engineering
â†’ spec-driven-development
â†’ planning-and-task-breakdown
â†’ incremental-implementation
â†’ test-driven-development
â†’ code-review-and-quality

Security is a cross-cutting constraint from the beginning of every task involving:
- authentication
- authorization
- user input
- uploads/media
- external integrations
- AI output
- personal data
- secrets
- persistence
- privileged operations

Use security-and-hardening during planning/design and again during implementation/review for applicable tasks. It is not a final-stage-only activity.

Use source-driven-development when implementation depends on framework/library/provider behavior.

Use doubt-driven-development when:
- requirements are ambiguous
- architecture has meaningful tradeoffs
- security/data-loss risk is high
- an irreversible operation is proposed

Use frontend-ui-engineering for product UI.

For animation/motion work use the Emil skills only when motion is relevant:
- animate-expo
- animation-vocabulary
- find-animation-opportunities
- improve-animations
- review-animations
- emil-design-eng

Motion must communicate state or interaction. Do not add animation merely for decoration.

---

## 5. Product Architecture Invariants

### Offline first
The client must remain useful under:
- weak network
- no network
- interrupted uploads
- retries
- duplicate operations
- permission denial
- app restarts
- low-end devices

### Sources of truth

Local device:
- unsynced drafts
- pending operations

PostgreSQL:
- canonical product/catalog/user/inquiry/approval state

### apps\api\src\modules\ai\README.md
// ai module boundary.
// Domain implementation will be added incrementally.
// Do not access another module's internals directly.

### apps\api\src\modules\audit\README.md
// audit module boundary.
// Domain implementation will be added incrementally.
// Do not access another module's internals directly.

### apps\api\src\modules\catalog\README.md
// catalog module boundary.
// Domain implementation will be added incrementally.
// Do not access another module's internals directly.

### apps\api\src\modules\discovery\README.md
// discovery module boundary.
// Domain implementation will be added incrementally.
// Do not access another module's internals directly.

### apps\api\src\modules\identity\README.md
// identity module boundary.
// Domain implementation will be added incrementally.
// Do not access another module's internals directly.

### apps\api\src\modules\inquiry\README.md
// inquiry module boundary.
// Domain implementation will be added incrementally.
// Do not access another module's internals directly.

### apps\api\src\modules\media\README.md
// media module boundary.
// Domain implementation will be added incrementally.
// Do not access another module's internals directly.

### apps\api\src\modules\review\README.md
# review module

Review decisions, risk/manual-review state, moderation transitions.

## What this module owns

The artisan's review surface for one of their products, and the single rule
that gates approval: **a product may be approved only when nothing is
outstanding in its review.**

Concretely:

- `GET /catalog/products/:id/review` — canonical values, every undecided
  valid AI proposal with its provenance, confidence, risk, staleness and the
  value it would replace, plus the ordered list of what blocks approval.
- `POST /catalog/products/:id/review/approve` — approval, refused and
  explained while anything is outstanding.

## What this module deliberately cannot do

It holds no product store and no proposal store, so it cannot write either.
Reading a suggestion and naming it as a blocker is the whole of its authority
over AI output. Applying a suggestion is the AI module's decision API, and
writing the product is the Catalog module's `approve`/`publish` operations.

That is the ADR-002 boundary expressed as a type rather than as a
convention: the Review module can see a proposal and can refuse to let a
product past it, and cannot make it canonical.

## Dependencies

`Catalog ← Review` and `AI → Review`, joined only in `composition.ts`.
Neither dependency knows the other exists:

- Catalog cannot depend on AI, because the rule that approval requires an
  empty review queue is only knowable with AI's proposals, and making
  publication wait on an AI read would let an AI outage block manual product
  creation. ADR-002 requires the opposite.
- AI cannot depend on Review, because the AI module generates proposals and
  has no authority over whether a product is cleared for publication.

`getSuggestionsPort` resolves an unconfigured AI environment to "no
suggestions" rather than failing, so an AI outage never becomes a publication
outage. Anything other than that specific refusal still propagates: an
approval must not proceed on a review surface that cannot see AI at all.

## Known gap

The readiness check, the suggestion read, and the approve write are not one
atomic step, so a proposal written in that window would not be seen. Closing
it needs a single guard spanning `catalog_products.state` and `ai_proposals` —
either of which makes one module's SQL read the other's tables or share its
lock discipline. That is a change to the module-boundary contract and is
recorded in `docs/agent/m5-review-publish-task.md` rather than taken here.

What bounds it today: the AI module refuses to *enqueue* for a product
outside its working states, and `APPROVED` is deliberately not one of them,
so the only remaining interleaving is a job enqueued before the approval and
still running when it happened; and approval and publication are separate
explicit operations, so an affected product stays `APPROVED` rather than
buyer-visible until a second, deliberate publish.

Moderation is **not** implemented here. `AGENTS.md` §10 requires mandatory
moderation for prohibited claims, policy-sensitive content, and fraud
indicators. This slice is the artisan reviewing their own product; the
moderation role is a later slice.

### apps\api\src\modules\sync\README.md
// sync module boundary.
// Domain implementation will be added incrementally.
// Do not access another module's internals directly.

### apps\api\tmp\wrangler-dry-run\README.md
This folder contains the built output assets for the worker "artisan-marketplace-api" generated at 2026-09-28T15:55:35.048Z.

### apps\mobile\README.md
# Welcome to your Expo app ðŸ‘‹

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

### CONTEXT.md
# Domain Context

## Project

A production-grade, cross-device, offline-first market-linkage and smart-cataloging mobile application for marginalized artisans.

The product connects artisan-created products with buyers while reducing the burden of catalog creation through assisted capture, voice, image analysis, structured metadata generation, correction, publishing, search, discovery, and inquiry.

## Core User Journey

The first validated vertical slice is:

artisan captures photo + voice
→ saves draft offline
→ synchronizes when connected
→ uploads media
→ receives an AI-assisted catalog draft
→ artisan corrects the draft
→ publishes
→ buyer searches/discovers
→ buyer sends an inquiry

This journey is the current product-development anchor. Do not expand the screen inventory merely because additional ideas are available.

## Primary Actors

### Artisan

Creates and manages product information, captures media and voice, reviews AI-generated metadata, corrects information, resolves required actions, and publishes products.

### Buyer

Searches and discovers published products and can initiate an inquiry with the artisan.

### Reviewer / Moderator

Handles cases requiring human intervention because of safety, policy, fraud, prohibited claims, potential intellectual-property issues, or other elevated-risk conditions.

### System / AI Pipeline

Transports synchronization and asynchronous work, processes media and AI proposals, validates results, records state transitions, and exposes actionable progress or failure states.

## Core Domain Concepts

### Product

The canonical catalog entity representing an artisan's product.

AI-generated values are proposals. They never become canonical merely because an AI job succeeded.

### Product Draft

An artisan-owned working representation that can exist locally before synchronization and may contain incomplete or not-yet-confirmed information.

### Catalog Version

An immutable published representation of product information. Published changes create a new catalog version rather than silently mutating historical published state.

### Media

Product-associated photos, audio, and other captured assets.

Media has an upload lifecycle independent from catalog-state transitions.

### AI Proposal

A machine-generated suggestion for one or more product fields.

Each proposal must be distinguishable from artisan-confirmed information and must carry sufficient provenance to understand where it came from.

### Inquiry

A buyer-originated request connected to a published product.

### Sync Operation

A durable operation representing a local change that still needs to reach the server.

### AI Job

An asynchronous unit of AI processing with its own lifecycle, retry behavior, and failure state.

### Event

A versioned fact describing a state change or domain occurrence.

Events support asynchronous processing, observability, and downstream consumers. They are not the canonical source of product truth.

### Outbox Entry

A durable database record created transactionally with canonical state changes and later dispatched to the asynchronous queue.

### Review Decision

A human decision required when automated processing is insufficient or risk thresholds require human approval.

## Product States

Canonical product state and AI-job state are separate.

Product states:

- LOCAL_DRAFT
- PENDING_SYNC
- SYNCED
- REVIEW_REQUIRED
- APPROVED
- PUBLISHED
- ARCHIVED
- CONFLICT
- ACTION_REQUIRED

AI job states:

- QUEUED
- RUNNING
- RETRYING
- PARTIAL_RESULT
- SUCCEEDED
- FAILED
- DEAD_LETTERED

These states are user-visible through understandable progress language such as:

- Saved on device
- Waiting for connection
- Uploading
- Processing
- Needs your review
- Published
- Action needed

## AI Trust Model

AI is an untrusted proposal generator.

The AI layer may:

- generate structured catalog proposals
- transcribe voice
- analyze images
- generate embeddings
- assist semantic matching

The AI layer may not directly mutate canonical product tables.

Every AI result must pass:

1. schema validation
2. semantic/business validation
3. normalization
4. quality/risk assessment
5. retry or partial-result handling when necessary
6. human review where required

Confidence is routing evidence, not approval.

An AI provider failure must never prevent a valid product from being created or manually published when the rest of the required product workflow is complete.

## Provenance

Important generated or derived field values should retain provenance describing:

- value
- source
- source type
- generating system/provider
- model/version where applicable
- confidence where applicable
- confirmation actor
- confirmation timestamp

AI must never silently overwrite artisan-confirmed information.

## Review and Risk

Normal product creation allows artisan review and correction.

Elevated-risk cases may require manual intervention, including:


### infra\database\README.md
# PostgreSQL application role and RLS activation

Row-level security is defined by
`infra/migrations/010_row_level_security.sql`, but a policy only has an
effect for a connection whose role is subject to it. The local development
database currently connects as `artisan_marketplace`, which owns the tables
and has `SUPERUSER` and `BYPASSRLS`. Policies are inert for that role. That
is a deliberate transitional state, not the enforcement target.

## Roles

| Role | Attributes | Purpose |
| --- | --- | --- |
| `artisan_marketplace` | table owner; local dev is `SUPERUSER`/`BYPASSRLS` | migrations, trusted maintenance, local development |
| `artisan_marketplace_app` | `NOLOGIN`, `NOSUPERUSER`, `NOBYPASSRLS` | privilege group created by `app-role.sql`; no credential |
| deployment login role | `LOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`, not a table owner | the API's connection identity; member of `artisan_marketplace_app` |

The NOLOGIN group exists so grants can be reviewed and tested without
creating a password in this repository. The login role is environment
configuration and must be created from a secret manager, never committed.

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
   role afterwards.

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

### infra\migrations\001_catalog\README.md
# Catalog persistence notes

## Canonical table

`catalog_products` is the server-side canonical product record.

## Ownership

`owner_id` identifies the actor/resource owner. Final authorization and RLS policies are not implemented by this migration yet.

## State

The database constraint mirrors the shared Catalog state contract.

## Version

`version` is reserved for optimistic concurrency / sync conflict detection.

## Deliberately not included yet

- RLS policies
- foreign keys to Identity
- catalog versions/history table
- media relationships
- AI proposal tables
- review tables
- outbox
- embeddings

### infra\migrations\002_media\README.md
# Media Attachment Migration

Adds the durable server-side metadata boundary for catalog media.

Ownership:
- `product_id` establishes the catalog relationship.
- `owner_id` records the owning artisan identity.
- `kind`, `content_type`, and `size_bytes` describe the media metadata.
- `state` follows the media lifecycle state machine.
- `idempotency_key` makes retries deduplicable per product.
- `object_key` remains nullable until object storage is introduced.

Not included yet:
- authentication/RLS
- R2 upload authorization
- upload completion verification
- media processing
- queue workers
- deletion/purge jobs

### README.md
# Artisan Marketplace

Offline-first market-linkage and smart-cataloging platform for artisans.

## Workspace

- pps/api — backend modular monolith
- pps/mobile — React Native + Expo client
- packages/contracts — shared boundary contracts
- packages/config — shared configuration primitives
- packages/utils — deterministic shared utilities
- docs — specifications, architecture, and ADRs
- infra — migrations and infrastructure scripts


## 8. Tool versions

Node: v24.15.0
pnpm: 11.9.0
OpenCode: opencode v2.0.32

## 9. Safety notes

This report excludes common generated directories and known secret/config filenames.
It does not inspect secret values, execute tests, contact services, or change application source.
Inventory may omit ignored files and inaccessible files.
