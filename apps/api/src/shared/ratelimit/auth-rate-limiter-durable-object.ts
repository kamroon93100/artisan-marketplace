import { DurableObject } from 'cloudflare:workers';

import {
  ensureRateLimitSchema,
  type RateLimitSqlStorage,
  type RateLimitSqlValue,
} from './sqlite-rate-limit-store.js';
import { handleRateLimitObjectRequest } from './rate-limiter-operation.js';

/**
 * SQLite-backed Durable Object for one rate-limit subject.
 *
 * The Cloudflare runtime wrapper is deliberately thin: request validation and
 * the decision live in `rate-limiter-operation.ts`, which Node can test
 * without importing `cloudflare:workers`. Every decision and its writes run
 * inside one synchronous storage transaction.
 */
export class AuthRateLimiterDurableObject extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ensureRateLimitSchema(this.storage());
  }

  async fetch(request: Request): Promise<Response> {
    try {
      return await handleRateLimitObjectRequest(
        request,
        this.storage(),
        (closure) => this.ctx.storage.transactionSync(closure),
      );
    } catch (error) {
      // The rate-limit key is never available here: the object id is a hash,
      // and the operation only returns the result. Record the failure class
      // without exposing a subject or request value.
      console.error(
        '[ratelimit] durable object operation failed',
        JSON.stringify({
          name: error instanceof Error ? error.name : typeof error,
        }),
      );

      return new Response('Rate limit operation failed.', {
        status: 500,
      });
    }
  }

  private storage(): RateLimitSqlStorage {
    return {
      exec: <T extends Record<string, RateLimitSqlValue>>(
        query: string,
        ...bindings: RateLimitSqlValue[]
      ) => this.ctx.storage.sql.exec<T>(query, ...bindings),
    };
  }
}
