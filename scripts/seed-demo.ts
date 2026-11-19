#!/usr/bin/env npx tsx
/**
 * Demo data seed script for Artisan Marketplace MVP.
 *
 * Creates a repeatable local demonstration dataset containing:
 * - One artisan account
 * - One buyer account
 * - Several realistic artisan products
 * - At least one approved and published product
 * - At least one product proposal awaiting review
 * - Example buyer inquiries
 *
 * Usage:
 *   $env:CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE = 'postgresql://artisan_marketplace:artisan_marketplace_dev@localhost:55432/artisan_marketplace_dev'
 *   npx tsx scripts/seed-demo.ts
 *
 * The script is idempotent - running it multiple times creates new UUIDs but
 * uses deterministic titles/descriptions so you can identify demo data.
 */

import { randomUUID } from "node:crypto";
import { CatalogService } from "../apps/api/src/modules/catalog/application/catalog-service.ts";
import { PostgresCatalogRepository } from "../apps/api/src/modules/catalog/infrastructure/postgres-catalog-repository.ts";
import { AiPipelineService } from "../apps/api/src/modules/ai/application/ai-pipeline-service.ts";
import { PostgresAiRepository } from "../apps/api/src/modules/ai/infrastructure/postgres-ai-repository.ts";
import { CatalogServiceCatalogProductPort } from "../apps/api/src/modules/ai/infrastructure/catalog-service-port.ts";
import { DeterministicCatalogAiProvider } from "../apps/api/src/modules/ai/infrastructure/deterministic-catalog-ai-provider.ts";
import { DiscoveryService } from "../apps/api/src/modules/discovery/application/discovery-service.ts";
import { CatalogServicePublishedCatalogReadPort } from "../apps/api/src/modules/discovery/infrastructure/catalog-published-port.ts";
import { InquiryService } from "../apps/api/src/modules/inquiry/application/inquiry-service.ts";
import { PostgresInquiryRepository } from "../apps/api/src/modules/inquiry/infrastructure/postgres-inquiry-repository.ts";
import { CatalogServicePublishedProductPort } from "../apps/api/src/modules/inquiry/infrastructure/catalog-published-port.ts";
import { PostgresDatabase } from "../apps/api/src/shared/persistence/postgres-database.ts";

const connectionString = process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE;

if (!connectionString) {
  throw new Error(
    "CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE must be set. " +
    "Use the value from your local Docker stack: " +
    "postgresql://artisan_marketplace:artisan_marketplace_dev@localhost:55432/artisan_marketplace_dev"
  );
}

function freshRigs(actorId: string) {
  const database = PostgresDatabase.forActor(connectionString!, actorId);
  const catalogRepository = new PostgresCatalogRepository(database);
  const catalogService = new CatalogService(catalogRepository);
  const catalogPort = new CatalogServiceCatalogProductPort(catalogService);

  return {
    database,
    catalogService,
    aiRepository: new PostgresAiRepository(database),
    pipeline: new AiPipelineService(
      new PostgresAiRepository(database),
      new DeterministicCatalogAiProvider(),
      catalogPort,
    ),
    discovery: new DiscoveryService(
      new CatalogServicePublishedCatalogReadPort(catalogService),
    ),
    inquiry: new InquiryService(
      new PostgresInquiryRepository(database),
      new CatalogServicePublishedProductPort(catalogService),
    ),
  };
}

async function publishFixture(
  catalog: CatalogService,
  ownerId: string,
  input: { title: string; description: string; category?: string; materials?: string[] },
  idempotencySuffix: string
): Promise<string> {
  const product = (
    await catalog.createDraft({
      ownerId,
      title: input.title,
      description: input.description,
      ...(input.category === undefined ? {} : { category: input.category }),
      ...(input.materials === undefined ? {} : { materials: input.materials }),
      idempotencyKey: `demo-draft-${idempotencySuffix}-${randomUUID()}`,
    })
  ).product;

  for (const state of ["PENDING_SYNC", "SYNCED", "REVIEW_REQUIRED"] as const) {
    await catalog.transition(product.id, state, ownerId);
  }

  await catalog.approve(product.id, ownerId);
  await catalog.publish(
    product.id,
    ownerId,
    `demo-publish-${idempotencySuffix}-${randomUUID()}`,
  );

  return product.id;
}

async function main(): Promise<void> {
  console.log("=== ARTISAN MARKETPLACE DEMO DATA SEED ===\n");

  // ------------------------------------------------------------------------
  // DEMO ACCOUNTS
  // ------------------------------------------------------------------------
  const artisanId = randomUUID();
  const buyerId = randomUUID();
  const otherBuyerId = randomUUID();

  console.log("Demo Accounts:");
  console.log(`  Artisan:  ${artisanId}`);
  console.log(`  Buyer:    ${buyerId}`);
  console.log(`  Buyer #2: ${otherBuyerId}\n`);

  const artisanRig = freshRigs(artisanId);
  const buyerRig = freshRigs(buyerId);
  const otherBuyerRig = freshRigs(otherBuyerId);

  // ------------------------------------------------------------------------
  // PUBLISHED PRODUCTS (visible to buyers)
  // ------------------------------------------------------------------------
  console.log("Creating published products...\n");

  // Product 1: Bamboo Basket (will have AI proposals awaiting review)
  const bambooBasketId = await publishFixture(
    artisanRig.catalogService,
    artisanId,
    {
      title: "Bamboo Storage Basket",
      description: "Handwoven bamboo basket for bread and grain storage. Tight weave keeps contents fresh.",
      category: "basketry",
      materials: ["bamboo", "natural dye"],
    },
    "bamboo-basket"
  );
  console.log(`  ✓ Published: "Bamboo Storage Basket" (${bambooBasketId})`);

  // Product 2: Ceramic Mug Set (fully published, no pending proposals)
  const ceramicMugsId = await publishFixture(
    artisanRig.catalogService,
    artisanId,
    {
      title: "Ceramic Mug Set (4pc)",
      description: "Set of four wheel-thrown ceramic mugs. Each mug holds 350ml. Microwave and dishwasher safe.",
      category: "pottery",
      materials: ["stoneware clay", "food-safe glaze"],
    },
    "ceramic-mugs"
  );
  console.log(`  ✓ Published: "Ceramic Mug Set (4pc)" (${ceramicMugsId})`);

  // Product 3: Woven Wall Hanging (published)
  const wallHangingId = await publishFixture(
    artisanRig.catalogService,
    artisanId,
    {
      title: "Macramé Wall Hanging",
      description: "Large macramé wall hanging with geometric pattern. Natural cotton cord on wooden dowel.",
      category: "textiles",
      materials: ["cotton cord", "wooden dowel"],
    },
    "wall-hanging"
  );
  console.log(`  ✓ Published: "Macramé Wall Hanging" (${wallHangingId})`);

  // ------------------------------------------------------------------------
  // PRODUCT WITH AI PROPOSALS AWAITING REVIEW
  // ------------------------------------------------------------------------
  console.log("\nCreating product with AI proposals awaiting review...\n");

  // Create a draft product that has been synced but needs AI proposals reviewed
  const draftProduct = (
    await artisanRig.catalogService.createDraft({
      ownerId: artisanId,
      title: "Hand-carved Wooden Spoon Set",
      description: "Set of three wooden spoons carved from olive wood. Each has a unique grain pattern.",
      category: "woodworking",
      materials: ["olive wood", "food-safe mineral oil"],
      idempotencyKey: `demo-draft-spoons-${randomUUID()}`,
    })
  ).product;

  for (const state of ["PENDING_SYNC", "SYNCED", "REVIEW_REQUIRED"] as const) {
    await artisanRig.catalogService.transition(draftProduct.id, state, artisanId);
  }

  console.log(`  ✓ Draft ready for AI: "Hand-carved Wooden Spoon Set" (${draftProduct.id})`);

  // Enqueue AI job
  const { job } = await artisanRig.pipeline.enqueue({
    productId: draftProduct.id,
    actorId: artisanId,
    idempotencyKey: `demo-ai-job-${randomUUID()}`,
    transcription: "These spoons are carved from single pieces of olive wood. The set includes a stirring spoon, a tasting spoon, and a serving spoon.",
    correlationId: `demo-corr-${randomUUID()}`,
  });

  console.log(`  ✓ AI job enqueued: ${job.id}`);

  // Run AI pipeline to generate proposals
  await artisanRig.pipeline.run(job.id, artisanId, `demo-corr-${randomUUID()}`);

  console.log(`  ✓ AI proposals generated and awaiting review`);

  // Verify proposals exist
  const proposals = await artisanRig.aiRepository.listProposals(job.id);
  console.log(`  ✓ ${proposals.length} proposals created:`);
  for (const p of proposals) {
    console.log(`    - ${p.field}: "${p.value}" (${p.decision})`);
  }

  // ------------------------------------------------------------------------
  // BUYER INQUIRIES
  // ------------------------------------------------------------------------
  console.log("\nCreating buyer inquiries...\n");

  // Inquiry 1: Buyer asks about Bamboo Basket
  const inquiry1 = await buyerRig.inquiry.create({
    productId: bambooBasketId,
    message: "Is this basket still available, and what is the smallest size you make?",
    idempotencyKey: `demo-inquiry-1-${randomUUID()}`,
    buyerId,
  });
  console.log(`  ✓ Inquiry from buyer: "${inquiry1.inquiry.message}"`);

  // Inquiry 2: Other buyer asks about Ceramic Mugs
  const inquiry2 = await otherBuyerRig.inquiry.create({
    productId: ceramicMugsId,
    message: "Do these mugs come in different colors? I'm looking for a set in earth tones.",
    idempotencyKey: `demo-inquiry-2-${randomUUID()}`,
    buyerId: otherBuyerId,
  });
  console.log(`  ✓ Inquiry from buyer #2: "${inquiry2.inquiry.message}"`);

  // Inquiry 3: Buyer asks about Wall Hanging
  const inquiry3 = await buyerRig.inquiry.create({
    productId: wallHangingId,
    message: "What are the exact dimensions? I need to know if it will fit above my sofa.",
    idempotencyKey: `demo-inquiry-3-${randomUUID()}`,
    buyerId,
  });
  console.log(`  ✓ Inquiry from buyer: "${inquiry3.inquiry.message}"`);

  // ------------------------------------------------------------------------
  // ADDITIONAL DRAFT PRODUCTS (not published)
  // ------------------------------------------------------------------------
  console.log("\nCreating additional draft products (not visible to buyers)...\n");

  const draftProducts = [
    {
      title: "Leather Journal Cover",
      description: "Hand-stitched leather cover for standard A5 notebook. Ages beautifully.",
      category: "leatherwork",
      materials: ["vegetable-tanned leather", "linen thread"],
    },
    {
      title: "Silver Pendant Necklace",
      description: "Sterling silver pendant with hammered texture. Comes on 18\" chain.",
      category: "jewelry",
      materials: ["sterling silver"],
    },
    {
      title: "Beeswax Candle Set",
      description: "Set of three pure beeswax candles. Naturally honey-scented, no additives.",
      category: "candles",
      materials: ["pure beeswax", "cotton wick"],
    },
  ];

  for (const input of draftProducts) {
    const product = (
      await artisanRig.catalogService.createDraft({
        ownerId: artisanId,
        title: input.title,
        description: input.description,
        category: input.category,
        materials: input.materials,
        idempotencyKey: `demo-draft-${input.title.toLowerCase().replace(/\s+/g, '-')}-${randomUUID()}`,
      })
    ).product;

    // Keep as LOCAL_DRAFT (not synced)
    console.log(`  ✓ Draft: "${input.title}" (${product.id})`);
  }

  // ------------------------------------------------------------------------
  // SUMMARY
  // ------------------------------------------------------------------------
  console.log("\n=== DEMO DATA SEED COMPLETE ===\n");
  console.log("Summary:");
  console.log(`  Artisan ID:  ${artisanId}`);
  console.log(`  Buyer ID:    ${buyerId}`);
  console.log(`  Buyer #2 ID: ${otherBuyerId}\n`);
  console.log("Published Products (buyer-visible):");
  console.log(`  1. Bamboo Storage Basket - ${bambooBasketId}`);
  console.log(`  2. Ceramic Mug Set (4pc) - ${ceramicMugsId}`);
  console.log(`  3. Macramé Wall Hanging - ${wallHangingId}\n`);
  console.log("Product with AI Proposals Awaiting Review:");
  console.log(`  - Hand-carved Wooden Spoon Set - ${draftProduct.id} (job: ${job.id})\n`);
  console.log("Buyer Inquiries:");
  console.log(`  1. Bamboo Basket - "${inquiry1.inquiry.message}"`);
  console.log(`  2. Ceramic Mugs - "${inquiry2.inquiry.message}"`);
  console.log(`  3. Wall Hanging - "${inquiry3.inquiry.message}"\n`);
  console.log("Draft Products (artisan-only):");
  console.log(`  - Leather Journal Cover`);
  console.log(`  - Silver Pendant Necklace`);
  console.log(`  - Beeswax Candle Set\n`);
  console.log("To run the demo:");
  console.log("  1. Start API: cd apps/api && npx wrangler dev");
  console.log("  2. Start Mobile: cd apps/mobile && npx expo start");
  console.log("  3. Login as artisan (use artisanId as test credential)");
  console.log("  4. Review AI proposals on the spoon set");
  console.log("  5. Login as buyer (use buyerId)");
  console.log("  6. Search and inquire on published products");
}

main().catch((error) => {
  console.error("\n❌ SEED FAILED:", error);
  process.exitCode = 1;
});