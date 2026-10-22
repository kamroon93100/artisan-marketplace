import { Hono } from 'hono';
import { AppError } from '../../shared/errors/app-error.js';
import type { Context } from 'hono';
import type { ApiEnv } from '../../shared/context/api-env.js';
import { requireActor } from '../../shared/auth/session.js';
import { getDiscoveryService } from './composition.js';
import { parseDiscoveryQuery } from './domain/discovery-query.js';
import { DiscoveryQueryError } from './domain/discovery-query.js';

export const discoveryRoutes = new Hono<ApiEnv>();

/**
 * Discovery requires an authenticated actor, like every other route here.
 *
 * The reason is the rate limiter, not the data. Published catalog data is
 * public by construction â€” publishing is the act that makes it visible â€” so
 * authentication buys no confidentiality. What it buys is a *subject*:
 * `rateLimitMiddleware` keys its budget on the actor, and an unauthenticated
 * discovery surface would collapse every anonymous caller into one shared
 * budget, so one caller could exhaust discovery for everyone.
 *
 * Relaxing this needs a real per-subject key that is not an actor identity,
 * which the identity seam does not currently provide. It is recorded as a
 * bounded gap rather than treated as settled here.
 *
 * The actor is resolved before any handler runs, and no discovery route
 * takes it: a read over published snapshots is not a permission decision,
 * so nothing downstream can be widened by a client that asserts an identity.
 */
discoveryRoutes.use('*', async (c, next) => {
  const context = c.get('requestContext');

  const actor = await requireActor(
    c.env,
    c.req.header('authorization'),
  );

  c.set('requestContext', {
    ...context,
    actor,
  });

  await next();
});

/**
 * Reads a matched route parameter.
 *
 * A route that matched always has the parameter, but the guard means a future
 * route shape cannot quietly forward `undefined` into a service as a product
 * identity, which would otherwise be reported as "no such product" and read
 * as a correct answer.
 */
function routeProductId(c: Context<ApiEnv>): string {
  const productId = c.req.param('productId');

  if (!productId) {
    throw new Error(
      'Discovery route matched without a product id.',
    );
  }

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(productId)) {
    throw new AppError(
      'VALIDATION_FAILED',
      'productId must be a valid UUID.',
      { field: 'productId' },
    );
  }

  return productId;
}

/**
 * The page of buyer-visible published listings.
 *
 * Every parameter is untrusted and is validated before any business logic
 * runs, so a malformed page size or search term is reported as invalid input
 * with a message that names the parameter at fault â€” the boundary
 * validation ADR-009 requires, done before the catalog is asked anything.
 */
discoveryRoutes.get('/products', async (c) => {
  try {
    const query = parseDiscoveryQuery({
      search: c.req.query('search'),
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
    });

    return c.json(
      await getDiscoveryService(c.env).search(query),
    );
  } catch (error) {
    if (error instanceof DiscoveryQueryError) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: error.message,
            details: { field: error.field },
          },
        },
        400,
      );
    }

    throw error;
  }
});

/**
 * One buyer-visible published listing.
 *
 * Reads an immutable published version, never the working draft. A product
 * that has not been published, or that has been archived, is reported as
 * `404` with the same message as a product that does not exist, so this
 * route cannot be used to discover which product ids exist unpublished.
 */
discoveryRoutes.get(
  '/products/:productId',
  async (c) => {
    const product = await getDiscoveryService(
      c.env,
    ).getPublishedProduct(routeProductId(c));

    return c.json({ product });
  },
);
