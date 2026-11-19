import { getCatalogService } from '../catalog/composition.js';
import type { DatabaseBindingEnv } from '../catalog/composition.js';
import { DiscoveryService } from './application/discovery-service.js';
import { CatalogServicePublishedCatalogReadPort } from './infrastructure/catalog-published-port.js';

export type DiscoveryBindingEnv = DatabaseBindingEnv;

/**
 * Builds the discovery service.
 *
 * Discovery depends on Catalog and on nothing else. This is the only place
 * the two are joined, so the direction `Catalog → Discovery` in
 * `docs/architecture/module-boundaries.md` is visible in the wiring rather
 * than implied by it: the catalog service is constructed here and injected,
 * and the catalog module has no reference back.
 *
 * The in-memory fallback is the catalog's own, reached through the same
 * `getCatalogService` every other module uses. Discovery does not keep a
 * second copy of it, because a discovery surface backed by storage the rest
 * of the API does not use would show buyers a catalog the catalog module
 * itself cannot see.
 *
 * A deployment with neither PostgreSQL nor the development seam refuses the
 * request rather than answering from volatile storage. That refusal comes
 * from the catalog module and is not re-decided here: discovery cannot
 * report a catalog it has no way to read.
 */
export function getDiscoveryService(
  env: DiscoveryBindingEnv,
  actorId?: string,
): DiscoveryService {
  return new DiscoveryService(
    new CatalogServicePublishedCatalogReadPort(
      getCatalogService(env, actorId),
    ),
  );
}
