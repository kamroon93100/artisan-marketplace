export type {
  RateLimitResult,
  RateLimiter,
} from './rate-limiter.js';
export { InMemorySlidingWindowRateLimiter } from './in-memory-rate-limiter.js';
export { rateLimitMiddleware } from './rate-limit-middleware.js';

/**
 * Shared singleton rate-limiters for the current local-dev stage.
 *
 * In production these would be replaced by Cloudflare Rate Limiting
 * or another shared implementation.  The import sites below are the
 * only swap points needed.
 */

import { InMemorySlidingWindowRateLimiter } from './in-memory-rate-limiter.js';

/** Product creation: 30 requests per 60-second window per key. */
export const productCreateLimiter =
  new InMemorySlidingWindowRateLimiter(30, 60_000);

/**
 * Product publication: 10 requests per 60-second window per key.
 *
 * Publication is budgeted separately from draft creation. It is the
 * operation that makes a product buyer-visible and allocates a catalog
 * version, so it gets its own quota rather than sharing one that a client
 * exhausting on draft creation could also exhaust against publishing.
 */
export const productPublishLimiter =
  new InMemorySlidingWindowRateLimiter(10, 60_000);

/** Upload-authorization: 60 requests per 60-second window per key. */
export const uploadAuthLimiter =
  new InMemorySlidingWindowRateLimiter(60, 60_000);

/**
 * AI job enqueue: 10 requests per 60-second window per key.
 *
 * Enqueueing is cheap, but each job is durable work that stays until it
 * is run and reviewed, so the budget is kept small enough that one
 * client cannot bury the review queue.
 */
export const aiEnqueueLimiter =
  new InMemorySlidingWindowRateLimiter(10, 60_000);

/**
 * AI job execution: 10 requests per 60-second window per key.
 *
 * `run` is the worker seam in this slice and it is the operation that
 * spends provider budget and moves a job out of `QUEUED`, so it is
 * budgeted separately from enqueue.
 */
export const aiRunLimiter =
  new InMemorySlidingWindowRateLimiter(10, 60_000);

/**
 * Review approval: 10 requests per 60-second window per key.
 *
 * Approval is budgeted with publication rather than with reads, because it
 * is the step immediately before it: it establishes the state that makes a
 * product publishable. An approval flood is a publication flood one step
 * early, so it gets the same kind of separate quota instead of sharing one
 * that a client refreshing the review screen could exhaust.
 */
export const productApproveLimiter =
  new InMemorySlidingWindowRateLimiter(10, 60_000);

/**
 * Inquiry creation: 10 requests per 60-second window per key.
 *
 * Budgeted on writes only. Reading a buyer's own inquiry list and reading
 * one of their own inquiries are the operations a buyer performs while
 * deciding, and a budget on them would make that browsing fail in a way
 * the buyer cannot act on. Inquiry reads are also the cheaper abuse
 * surface: they are scoped to the authenticated buyer, so there is nothing
 * to enumerate.
 */
export const inquiryCreateLimiter =
  new InMemorySlidingWindowRateLimiter(10, 60_000);