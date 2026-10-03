import { Hono } from 'hono';
import type { Context } from 'hono';
import { MEDIA_KINDS } from '@artisan-marketplace/contracts';
import type { ApiEnv } from '../../shared/context/api-env.js';
import { requireActor } from '../../shared/auth/session.js';
import {
  uploadAuthLimiter,
  rateLimitMiddleware,
} from '../../shared/ratelimit/index.js';
import { getMediaService } from './composition.js';

export const mediaRoutes = new Hono<ApiEnv>();

/**
 * No media route may be reached anonymously.
 *
 * A presigned upload authorization is a temporary write credential and
 * a completion call is a claim about a stored object, so the actor is
 * resolved before any handler runs. The actor is then carried into the
 * service, which owns the media ownership decision: authentication says
 * who is calling, authorization says whether they may.
 */
mediaRoutes.use('*', async (c, next) => {
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

mediaRoutes.post(
  '/products/:id/media',
  async (c) => {
    const body =
      await c.req.json<{
        kind?: string;
        contentType?: string;
        sizeBytes?: number;
      }>();

    const idempotencyKey =
      c.req.header('idempotency-key');

    if (
      !body.kind ||
      !body.contentType ||
      body.sizeBytes === undefined ||
      !idempotencyKey
    ) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message:
              'kind, contentType, sizeBytes and Idempotency-Key are required.',
          },
        },
        400,
      );
    }

    if (
      !MEDIA_KINDS.includes(
        body.kind as (typeof MEDIA_KINDS)[number],
      )
    ) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message:
              `Unsupported media kind: ${body.kind}.`,
          },
        },
        400,
      );
    }

    const result =
      await getMediaService(c.env).requestAttachment({
        productId: c.req.param('id'),
        kind:
          body.kind as (typeof MEDIA_KINDS)[number],
        contentType: body.contentType,
        sizeBytes: body.sizeBytes,
        idempotencyKey,
        actorId: actorId(c),
      });

    return c.json(
      {
        attachment: result.attachment,
        deduplicated: !result.created,
      },
      result.created ? 201 : 200,
    );
  },
);

function readRequestedTtl(
  value: string | undefined,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

mediaRoutes.post(
  '/media/:id/upload-authorization',
  rateLimitMiddleware(uploadAuthLimiter, 'upload authorization'),
  async (c) => {
    const result =
      await getMediaService(
        c.env,
      ).authorizeUpload(
        c.req.param('id')!,
        actorId(c),
        readRequestedTtl(
          c.req.query('expiresInSeconds'),
        ),
      );

    return c.json({
      attachment: result.attachment,
      objectKey: result.upload.objectKey,
      upload: result.upload,
    });
  },
);

mediaRoutes.post(
  '/media/:id/upload-start',
  rateLimitMiddleware(uploadAuthLimiter, 'upload start'),
  async (c) => {
    const result =
      await getMediaService(
        c.env,
      ).startUpload(
        c.req.param('id')!,
        actorId(c),
        readRequestedTtl(
          c.req.query('expiresInSeconds'),
        ),
      );

    return c.json({
      attachment: result.attachment,
      objectKey: result.upload.objectKey,
      upload: result.upload,
    });
  },
);

mediaRoutes.post(
  '/media/:id/upload-completion',
  async (c) => {
    const result =
      await getMediaService(
        c.env,
      ).completeUpload(
        c.req.param('id'),
        actorId(c),
      );

    return c.json({
      attachment: result.attachment,
      verified: result.verification.verified,
      verification: result.verification,
    });
  },
);
