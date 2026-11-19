import { PRODUCT_STATES } from '@artisan-marketplace/contracts';
import type { ProductState } from './index.js';
import { getCatalogService } from './composition.js';

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ApiEnv } from '../../shared/context/api-env.js';
import { requireActor } from '../../shared/auth/session.js';
import {
  enforceRateLimit,
  resolveOperationRateLimiters,
  buildOperationKey,
  type OperationScope,
} from '../../shared/ratelimit/index.js';

export const catalogRoutes = new Hono<ApiEnv>();

/**
 * Catalog routes require an authenticated actor. The actor identity is
 * derived from the session (or the local development seam) and is never
 * trusted from the request body.
 */
catalogRoutes.use('*', async (c, next) => {
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

function actorId(c: Context<ApiEnv>): string {
  return c.get('requestContext').actor.actorId;
}

/**
 * Reads the product id from a matched route.
 *
 * The rate-limit wrapper erases Hono's route-parameter typing, so the
 * parameter is read through one checked helper rather than asserted away
 * at each call site. A route that matched always has the parameter; the
 * guard exists so a future route shape cannot quietly forward
 * `undefined` into a service as a product identity.
 */
function productId(c: Context<ApiEnv>): string {
  const id = c.req.param('id');

  if (!id) {
    throw new Error(
      'Catalog route matched without a product id.',
    );
  }

  return id;
}

function isProductState(
  value: unknown,
): value is ProductState {
  return PRODUCT_STATES.includes(value as ProductState);
}

catalogRoutes.post(
  '/products',
  async (c) => {
    const limiters = resolveOperationRateLimiters(c.env);
    await enforceRateLimit(
      c,
      limiters['catalog.product.create'],
      buildOperationKey('catalog.product.create', actorId(c)),
      'product creation',
    );
    const body = await c.req.json<{
      title?: string;
      description?: string;
      category?: string;
      materials?: string[];
    }>();

    const result =
      await getCatalogService(c.env, actorId(c)).createDraft({
        ownerId: actorId(c),
        title: body.title,
        description: body.description,
        category: body.category,
        materials: body.materials,
        idempotencyKey:
          c.req.header('idempotency-key') ?? undefined,
      });

    return c.json(
      {
        product: result.product,
        deduplicated: !result.created,
      },
      result.created ? 201 : 200,
    );
  },
);

/**
 * The artisan's own product record.
 *
 * Publication is what makes a product readable by buyers; until then it is
 * private working state. The read is therefore ownership-scoped here rather
 * than reusing the module's internal unscoped lookup, which would let any
 * authenticated actor read another artisan's draft by guessing its id.
 */
catalogRoutes.get('/products/:id', async (c) => {
  try {
    const product =
      await getCatalogService(c.env, actorId(c)).getOwnedById(
        productId(c),
        actorId(c),
      );

    return c.json({ product });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        'Catalog product was not found.'
    ) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: error.message,
          },
        },
        404,
      );
    }

    throw error;
  }
});

/**
 * A partial edit of the product's own fields.
 *
 * Only the supplied fields are written, which is what makes a repeated
 * delivery converge: the request carries absolute values, so replaying
 * it produces the same record rather than applying an increment twice.
 */
catalogRoutes.patch('/products/:id', async (c) => {
  const body = await c.req.json<{
    title?: string;
    description?: string;
    category?: string;
    materials?: string[];
  }>();

  const product =
    await getCatalogService(c.env, actorId(c)).update(
      productId(c),
      actorId(c),
      {
        title: body.title,
        description: body.description,
        category: body.category,
        materials: body.materials,
      },
    );

  return c.json({ product });
});

/**
 * The published history of a product, newest version first.
 *
 * Versions are immutable, so this is an audit trail rather than a
 * mutable collection: it exists so a change to an already published
 * product is visible as a new version instead of a rewrite.
 */
catalogRoutes.get(
  '/products/:id/versions',
  async (c) => {
    const versions =
      await getCatalogService(c.env, actorId(c)).listVersions(
        productId(c),
        actorId(c),
      );

    return c.json({ versions });
  },
);

/**
 * Publication is its own operation rather than a value of the generic
 * transition body. It checks the preconditions, allocates the next
 * immutable catalog version, and records who authorized it, so allowing
 * PUBLISHED through the generic route would publish with none of that.
 */
catalogRoutes.post(
  '/products/:id/publish',
  async (c) => {
    const limiters = resolveOperationRateLimiters(c.env);
    await enforceRateLimit(
      c,
      limiters['catalog.product.publish'],
      buildOperationKey('catalog.product.publish', actorId(c)),
      'product publication',
    );
    const result =
      await getCatalogService(c.env, actorId(c)).publish(
        productId(c),
        actorId(c),
        c.req.header('idempotency-key') ?? '',
      );

    return c.json(
      {
        product: result.product,
        version: result.version,
        deduplicated: !result.created,
      },
      result.created ? 201 : 200,
    );
  },
);

/**
 * A generic state assignment.
 *
 * `APPROVED` and `PUBLISHED` are refused here. Each is the outcome of a
 * named operation that checks preconditions and records who authorized
 * them, and ADR-002 reserves both for authorized business workflows. The
 * refusal is repeated at the service, which is the boundary that has to
 * hold for every caller rather than only for HTTP ones; repeating it here
 * is the boundary validation ADR-009 requires before business logic runs.
 */
catalogRoutes.post(
  '/products/:id/transition',
  async (c) => {
    const body =
      await c.req.json<{ state?: ProductState }>();

    if (!body.state) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'state is required.',
          },
        },
        400,
      );
    }

    /**
     * The state is validated at the boundary, before any business logic
     * runs, so an unknown value is reported as invalid input instead of
     * as a transition conflict against a state the client invented.
     */
    if (!isProductState(body.state)) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: `Unsupported product state: ${String(body.state)}.`,
          },
        },
        400,
      );
    }

    if (
      body.state === 'APPROVED' ||
      body.state === 'PUBLISHED'
    ) {
      return c.json(
        {
          error: {
            code: 'CONFLICT',
            message:
              body.state === 'APPROVED'
                ? 'Approve a product with POST /catalog/products/{id}/review/approve so the outstanding AI suggestions are checked first.'
                : 'Publish a product with POST /catalog/products/{id}/publish so its preconditions are checked and a catalog version is recorded.',
          },
        },
        409,
      );
    }

    try {
      const product =
        await getCatalogService(c.env, actorId(c)).transition(
          productId(c),
          body.state,
          actorId(c),
        );

      return c.json({ product });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith(
          'Invalid catalog state transition:',
        )
      ) {
        return c.json(
          {
            error: {
              code: 'CONFLICT',
              message: error.message,
            },
          },
          409,
        );
      }

      throw error;
    }
  },
);
