import { Hono } from 'hono';
import { AppError } from './shared/index.js';
import type { ApiEnv } from './shared/context/api-env.js';
import { catalogRoutes } from './modules/catalog/http.js';
import { mediaRoutes } from './modules/media/http.js';
import { aiRoutes } from './modules/ai/http.js';
import { reviewRoutes } from './modules/review/http.js';
import { discoveryRoutes } from './modules/discovery/http.js';
import { inquiryRoutes } from './modules/inquiry/http.js';
import { authRoutes } from './modules/identity/index.js';

const app = new Hono<ApiEnv>();

app.use('*', async (c, next) => {
  const requestId =
    c.req.header('x-request-id') ??
    crypto.randomUUID();

  const correlationId =
    c.req.header('x-correlation-id') ??
    requestId;

  c.set('requestContext', {
    requestId,
    correlationId,
    actor: {
      actorId: 'anonymous',
      roles: [],
      authenticated: false,
    },
  });

  await next();

  c.header('x-request-id', requestId);
  c.header('x-correlation-id', correlationId);
});

app.onError((error, c) => {
  if (error instanceof AppError) {
    return c.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'FORBIDDEN'
          ? 403
          : error.code === 'UNAUTHENTICATED'
            ? 401
            : error.code === 'VALIDATION_FAILED'
              ? 400
              : error.code === 'CONFLICT'
                ? 409
                : error.code === 'RATE_LIMITED'
                  ? 429
                  : error.code === 'DEPENDENCY_FAILED' ||
                      error.code === 'TRANSIENT_FAILURE'
                    ? 503
                    : 500,
    );
  }

  console.error(error);

  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message:
          'An unexpected error occurred.',
      },
    },
    500,
  );
});

/**
 * Route mounts. Modules are composed and mounted independently; the shared
 * `/catalog` prefix is the URL space a product's paths live in, not a
 * dependency between the modules serving them.
 *
 * Discovery and Inquiry are mounted on their own prefixes because they are
 * the buyer-facing half of the catalog rather than paths into a product's
 * working record. Buyers arrive at `/discovery` and `/inquiries` and have no
 * `/catalog` surface of their own; the catalog routes stay the artisan's.
 * 
 * Auth routes are mounted at `/` because they are at `/v1/auth/*`.
 */
app.route('/', authRoutes);
app.route('/catalog', catalogRoutes);
app.route('/catalog', mediaRoutes);
app.route('/catalog', aiRoutes);
app.route('/catalog', reviewRoutes);
app.route('/discovery', discoveryRoutes);
app.route('/', inquiryRoutes);

app.get('/health', (c) => {
  const context = c.get('requestContext');

  return c.json({
    ok: true,
    service: 'artisan-marketplace-api',
    environment:
      c.env.APP_ENV ?? 'development',
    requestId: context.requestId,
    correlationId: context.correlationId,
  });
});

export default app;
