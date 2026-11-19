import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ApiEnv } from '../../shared/context/api-env.js';
import { requireActor } from '../../shared/auth/session.js';
import {
  enforceRateLimit,
  resolveOperationRateLimiters,
  buildOperationKey,
} from '../../shared/ratelimit/index.js';
import { getReviewService } from './composition.js';

export const reviewRoutes = new Hono<ApiEnv>();

/**
 * No review route may be reached anonymously.
 *
 * The review surface is the product's values plus the suggestions that could
 * replace them, so an unauthenticated read is a disclosure of an artisan's
 * unlisted work, and approval is a durable state change. The actor is
 * resolved before any handler runs and the caller never names their own
 * identity in the body, exactly as the catalog and AI routes behave.
 */
reviewRoutes.use('*', async (c, next) => {
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
 * Reads a matched route parameter. The rate-limit wrapper erases Hono's route
 * typing, so parameters come through one checked helper and a route that
 * matched without one fails loudly rather than forwarding `undefined` into
 * a service as a product id.
 */
function routeId(c: Context<ApiEnv>): string {
  const id = c.req.param('id');

  if (!id) {
    throw new Error(
      'Review route matched without an id.',
    );
  }

  return id;
}

reviewRoutes.get(
  '/products/:id/review',
  async (c) => {
    return c.json(
      await getReviewService(c.env, actorId(c)).getReview(
        routeId(c),
        actorId(c),
      ),
    );
  },
);

/**
 * Approval takes no body.
 *
 * There is nothing to supply: the suggestion decisions have already been
 * applied through the AI decision route, and what this operation records is
 * the artisan's act of clearing the product for publication. A body here
 * would be either redundant or a way to smuggle a value past the decision
 * route, so it is absent by design.
 *
 * The response is 200 whether the state changed or not. Approval is
 * state-idempotent, so `deduplicated` — not the status code — is what tells
 * a client whether this call was the one that established it, and a client
 * retrying after a dropped response must be able to tell that its
 * intention was carried out.
 *
 * Both routes are mounted under the same `/catalog` prefix as the catalog
 * routes, because they are paths into a catalog product. The Review module
 * stays separately composed and separately mounted: a shared URL prefix is
 * not a module dependency, and the prefix says where the product lives, not
 * who owns the rule about it.
 */
reviewRoutes.post(
  '/products/:id/review/approve',
  async (c) => {
    const limiters = resolveOperationRateLimiters(c.env);
    await enforceRateLimit(
      c,
      limiters['review.product.approve'],
      buildOperationKey('review.product.approve', actorId(c)),
      'review approval',
    );
    const result = await getReviewService(
      c.env,
      actorId(c),
    ).approve(routeId(c), actorId(c));

    return c.json({
      product: result.product,
      deduplicated: result.deduplicated,
    });
  },
);
