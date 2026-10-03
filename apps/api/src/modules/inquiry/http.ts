import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ApiEnv } from '../../shared/context/api-env.js';
import { requireActor } from '../../shared/auth/session.js';
import {
  inquiryCreateLimiter,
  rateLimitMiddleware,
} from '../../shared/ratelimit/index.js';
import { getInquiryService } from './composition.js';
import { InquiryValidationError } from './domain/inquiry.js';

export const inquiryRoutes = new Hono<ApiEnv>();

/**
 * No inquiry route may be reached anonymously.
 *
 * An inquiry is a buyer's own record of an intention to buy, and the list
 * and read routes disclose it to whoever asks. The actor is resolved before
 * any handler runs, exactly as the catalog, media, AI, and review routes do,
 * and the caller never names their own identity in the body: the buyer is
 * the authenticated actor or it is nobody.
 */
inquiryRoutes.use('*', async (c, next) => {
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

function routeInquiryId(c: Context<ApiEnv>): string {
  const inquiryId = c.req.param('inquiryId');

  if (!inquiryId) {
    throw new Error(
      'Inquiry route matched without an inquiry id.',
    );
  }

  return inquiryId;
}

/**
 * Reports a rejected field as a validation failure.
 *
 * Domain rules are reused rather than restated at the boundary, so the two
 * cannot disagree about what a valid inquiry is. The message names the field
 * and what would be accepted, because a validation failure that only says
 * "invalid" leaves a client with nothing to act on.
 */
function toValidationResponse(
  error: InquiryValidationError,
): Response {
  return Response.json(
    {
      error: {
        code: 'VALIDATION_FAILED',
        message: error.message,
        details: { field: error.field },
      },
    },
    { status: 400 },
  );
}

/**
 * The buyer's own inquiries, newest first.
 *
 * Deliberately not rate-limited. Reading one's own list is what a buyer does
 * while deciding, and a budget on it would make browsing an inquiry history
 * fail in a way the buyer cannot act on; the abuse a read budget would guard
 * against is enumeration, and the ownership scoping is what prevents that.
 * Budgets belong on the operations that cost something durable, which is why
 * they are on creation.
 */
inquiryRoutes.get('/inquiries', async (c) => {
  try {
    return c.json(
      await getInquiryService(c.env).listOwn(actorId(c), {
        limit: c.req.query('limit'),
        offset: c.req.query('offset'),
      }),
    );
  } catch (error) {
    if (error instanceof InquiryValidationError) {
      return toValidationResponse(error);
    }

    throw error;
  }
});

/**
 * One of the buyer's own inquiries.
 *
 * Another buyer's inquiry is reported exactly as one that does not exist. A
 * `403` would confirm that the id belongs to someone, which is a disclosure
 * about another buyer's activity that this route has no reason to make.
 */
inquiryRoutes.get('/inquiries/:inquiryId', async (c) => {
  return c.json({
    inquiry: await getInquiryService(
      c.env,
    ).getOwn(routeInquiryId(c), actorId(c)),
  });
});

/**
 * Creates an inquiry against a published product.
 *
 * Rate-limited, because this is the only inquiry operation that writes. The
 * budget is keyed per actor and per path, so one buyer exhausting it cannot
 * affect another, and the retry that a dropped response provokes is still a
 * request against the same budget — accepted as the cost of bounding
 * writes, and noted rather than hidden.
 *
 * `Idempotency-Key` is required and is validated before the body is even
 * read: creation without it is not creation without deduplication, it is
 * creation that cannot be safely retried by an offline client.
 */
inquiryRoutes.post(
  '/inquiries',
  rateLimitMiddleware(inquiryCreateLimiter, 'inquiry creation'),
  async (c) => {
    const idempotencyKey = c.req.header('idempotency-key');

    if (!idempotencyKey?.trim()) {
      return Response.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message:
              'Idempotency-Key is required to create an inquiry.',
            details: { field: 'Idempotency-Key' },
          },
        },
        { status: 400 },
      );
    }

    let body: { productId?: unknown; message?: unknown };

    try {
      body = await c.req.json<{
        productId?: unknown;
        message?: unknown;
      }>();
    } catch {
      return Response.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'A JSON body is required.',
          },
        },
        { status: 400 },
      );
    }

    try {
      const result = await getInquiryService(
        c.env,
      ).create({
        productId: body.productId,
        message: body.message,
        idempotencyKey,
        buyerId: actorId(c),
      });

      return c.json(
        {
          inquiry: result.inquiry,
          deduplicated: !result.created,
        },
        result.created ? 201 : 200,
      );
    } catch (error) {
      if (error instanceof InquiryValidationError) {
        return toValidationResponse(error);
      }

      throw error;
    }
  },
);
