import type { RequestContext } from './request-context.js';
import type { SessionBindingEnv } from '../auth/session.js';
import type { Ai, Queue } from '@cloudflare/workers-types';

/**
 * The Worker's request environment.
 *
 * `HYPERDRIVE` arrives through `SessionBindingEnv` (it is part of the
 * session/identity contract there), so it is deliberately not declared a
 * second time here: one declaration cannot drift from the other.
 */
export type ApiEnv = {
  Bindings: {
    APP_ENV?: string;
    DEV_OWNER_ID?: string;
    /**
     * Local-only opt-in for process-local authentication state. It must be
     * exactly `true`, and only takes effect when the application and build
     * modes also explicitly identify a local development or test run.
     * It must never appear in tracked Wrangler deployment configuration.
     */
    LOCAL_IN_MEMORY_AUTH_ENABLED?: string;
    S3_ENDPOINT?: string;
    S3_REGION?: string;
    S3_ACCESS_KEY_ID?: string;
    S3_SECRET_ACCESS_KEY?: string;
    S3_BUCKET?: string;
    /**
     * Production rate-limit namespace. Optional because local development and
     * unit tests do not need a Durable Object binding; production resolution
     * must fail closed when it is absent.
     */
    AUTH_RATE_LIMITER?: DurableObjectNamespace;
    /**
     * Cloudflare Workers AI binding for AI model inference.
     * Provides access to models like @cf/meta/llama-3.1-8b-instruct-fast.
     */
    AI?: Ai;
    AI_PROVIDER?: 'workers-ai' | 'openai';
    AI_PROVIDER_MODEL?: string;
    AI_PROVIDER_VERSION?: string;
    OPENAI_API_KEY?: string;
    /**
     * Cloudflare Queue binding for AI job dispatch.
     * Used by the outbox dispatcher to publish events to the queue.
     */
    AI_JOB_QUEUE?: Queue;
  } & SessionBindingEnv;
  Variables: {
    requestContext: RequestContext;
  };
};

/**
 * Cloudflare Queue binding type. Uses the native Queue interface from workers-types.
 * The Queue type is re-exported for consumers that need to reference it.
 */
export type { Queue };