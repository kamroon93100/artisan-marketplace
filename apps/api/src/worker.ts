/**
 * Worker entry.
 *
 * The app in `./index.ts` is shared with the Node test suite; this file is
 * the Worker-only shell around it. It exists for one reason: Cloudflare
 * Workers forbid runtime WebAssembly code generation, so the Argon2
 * binaries must be precompiled at build time. Wrangler does that for the
 * `.wasm` files it bundles — these imports yield ready
 * `WebAssembly.Module`s — and this entry instantiates them per hash by
 * registering them before the first request is served.
 *
 * The static import lives here, and not in the app, because the app's
 * modules are also loaded by Node, which cannot statically import a
 * `.wasm` module the way a Worker does. Node reaches the same binaries
 * through `argon2-modules.ts` instead.
 */

import app from './index.js';
import argon2Wasm from './modules/identity/infrastructure/argon2.wasm';
import blake2bWasm from './modules/identity/infrastructure/blake2b.wasm';
import { registerPrecompiledArgon2Modules } from './modules/identity/infrastructure/argon2-modules.js';

registerPrecompiledArgon2Modules({
  argon2: argon2Wasm,
  blake2b: blake2bWasm,
});

export { AuthRateLimiterDurableObject } from './shared/ratelimit/auth-rate-limiter-durable-object.js';

import type { ApiEnv } from './shared/context/api-env.js';
import type { MessageBatch, Message, ExecutionContext } from '@cloudflare/workers-types';
import { validateQueueMessage } from './modules/ai/application/queue-message-validation.js';

/**
 * Queue message payload format (from outbox event payload).
 * Contains everything the consumer needs to re-hydrate actor context and run the job.
 */
export interface AiJobQueueMessage {
  jobId: string;
  productId: string;
  ownerId: string;
  correlationId: string;
  causationId: string | null;
  idempotencyKey: string | null;
  attempt: number;
  maxAttempts: number;
  payloadVersion: number;
}

/**
 * Scheduled controller type for cron triggers.
 */
interface ScheduledController {
  cron: string;
  scheduledTime: number;
}

/**
 * Queue consumer handler for AI job processing.
 * This is invoked by Cloudflare Queues when messages arrive on ai-job-queue.
 */
export async function queue(
  batch: MessageBatch<AiJobQueueMessage>,
  env: ApiEnv['Bindings'],
  _ctx: ExecutionContext,
): Promise<void> {
  const { getAiServices } = await import('./modules/ai/composition.js');

  for (const message of batch.messages) {
    let payload: AiJobQueueMessage;

    try {
      // Validate message schema
      payload = validateQueueMessage(message.body);
    } catch (error) {
      // Invalid message - explicitly retry so the queue's retry/DLQ policy handles it.
      // Using message.retry() instead of continue/ack ensures:
      // - Invalid messages are retried per queue config (max_retries, dead_letter_queue)
      // - Valid messages in the same batch can still be processed
      // - Logs remain useful without exposing sensitive payload data
      console.error(`Invalid AI job queue message ${message.id}:`, error);
      message.retry();
      continue;
    }

    try {
      // Get AI services with the job owner's actor ID to set RLS context
      // The ownerId from the payload is the artisan who owns the job
      const { pipeline } = getAiServices(env as ApiEnv['Bindings'], payload.ownerId);

      // Run the job - the pipeline will restore actor context via the
      // repository which uses the actorId for RLS
      await pipeline.run(payload.jobId, payload.ownerId, payload.correlationId);

      // Cloudflare Queues auto-acknowledges on successful return
      // If we throw, the message will be retried per queue config
    } catch (error) {
      // Check if the job is in a RETRYING state and the attempt count matches
      // This helps avoid infinite retries for jobs that have exceeded maxAttempts
      console.error(`AI job ${payload.jobId} failed on attempt ${payload.attempt}/${payload.maxAttempts}:`, error);

      // If we've exceeded max attempts, we could acknowledge to send to DLQ
      // but we'll let the queue's max_retries and dead_letter_queue handle it
      throw error;
    }
  }
}

/**
 * Scheduled handler for the outbox dispatcher.
 * This runs periodically to claim pending outbox events and publish them to the queue.
 * Configure a cron trigger in wrangler.jsonc to invoke this handler.
 */
export async function scheduled(
  _controller: ScheduledController,
  env: ApiEnv['Bindings'],
  _ctx: ExecutionContext,
): Promise<void> {
  const { getAiServices } = await import('./modules/ai/composition.js');

  const services = getAiServices(env as ApiEnv['Bindings']);

  if (services.dispatcher) {
    try {
      const dispatched = await services.dispatcher();
      console.log(`Outbox dispatcher processed ${dispatched} events`);
    } catch (error) {
      console.error('Outbox dispatcher failed:', error);
      // Don't throw - let the scheduler continue
    }
  }
}

/**
 * Cloudflare Module Worker entry-point.
 *
 * A Module Worker's default export must be an object with the handlers:
 * - fetch: HTTP request handler (the Hono app)
 * - queue: Queue consumer handler
 * - scheduled: Cron trigger handler
 *
 * The named exports are also available for testing but the runtime
 * reads the default export.
 */
export default {
  fetch: app.fetch,
  queue,
  scheduled,
};