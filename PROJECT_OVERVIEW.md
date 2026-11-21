# Artisan Marketplace - Project Overview

An offline-first marketplace for artisans. An artisan captures a product (photo, voice description) on a phone, it syncs to a cloud backend, AI proposes catalog details, the artisan reviews and publishes, and buyers discover products and send inquiries.

## Tech stack
| Layer | Technology |
|---|---|
| Mobile app | Expo SDK 57, React Native 0.86.3, React 19.2.3, Expo Router, TypeScript |
| Local storage | expo-sqlite (drafts, media intents, sync queue) |
| API | Cloudflare Worker (wrangler), TypeScript |
| Database | PostgreSQL 16 via Hyperdrive, row-level security |
| Object storage | RustFS (S3-compatible) with presigned uploads |
| Rate limiting | Durable Objects |
| AI pipeline | Queue + outbox; Workers AI and OpenAI providers in code |
| Tooling | pnpm workspaces (apps/mobile, apps/api, packages/*) |

## How it works
- **Auth:** register / login / refresh / logout endpoints, sessions and refresh grants in Postgres, rate limited. Every local record is owned by the signed-in account.
- **Offline-first:** drafts, media and sync operations are saved in SQLite first, then synced. Records with no owner are never shown to any account.
- **Upload:** the phone gets a presigned URL and uploads the file straight to object storage; the server verifies it.
- **Backend modules:** identity, catalog, media, ai, review, discovery, inquiry.
- **Security:** per-account data isolation (local and database RLS), rate limiting, secrets kept out of git.

## What is verified
- Automated: typecheck, lint (0 errors), Worker dry-run and about 70 test suites pass (`pnpm run verify:mobile`).
- On the Android emulator: register and login, create a draft with a photo, draft survives an app restart, a second account cannot see the first account's draft, photo uploads to storage and the server marks it VERIFIED, "Review this product" appears for the synced product.

## Not verified / still to do
- AI proposals (the AI binding is unavailable in local mode); review, approve and publish from the phone.
- Buyer discovery and inquiry flows on the phone.
- Voice recording.
- Web support (not working; Android is the supported platform).
- Small fixes: the Review button needs the draft screen reopened to appear; a "Simulate sync failure" dev button is visible; a duplicate media row was seen during one upload.
- Not production ready: local dev setup only, no deployment done.

## Run locally (Windows)
1. Start Docker containers: artisan-marketplace-postgres (port 55432) and artisan-marketplace-storage (ports 9000/9001). Create the bucket `artisan-marketplace-media` in storage once.
2. Copy apps/api/.dev.vars.example to apps/api/.dev.vars and fill in values.
3. From apps/api, set CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE and run: wrangler dev --local --port 8787 --ip 0.0.0.0
4. From apps/mobile, create .env.local with EXPO_PUBLIC_API_URL=http://10.0.2.2:8787 and run: npx expo start --android
5. With an emulator running: adb reverse tcp:8081 tcp:8081 and adb reverse tcp:9000 tcp:9000
6. Register accounts in the app to try it.

See docs/ for architecture, sync contract, RLS contract and the demo guide.
## Verified journey (Android emulator, 21 Nov 2026)
Register/login, photo capture and upload to storage, AI proposals, review, approve, publish, buyer search, product detail and inquiry all worked end to end.

## Demo shortcuts / still to do
- The AI job run and the LOCAL_DRAFT -> PENDING_SYNC -> SYNCED transitions were triggered through the API by script; the app does not do this yet.
- AI output is a deterministic fixture in development mode, not a real model.
- Voice recording and web support are untested/unsupported.
- Verified: inquiries are stored under the signed-in buyer (an earlier odd result was a test-script account-switch issue, not an app bug).
