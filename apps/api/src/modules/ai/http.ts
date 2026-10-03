import { Hono } from 'hono';
import type { Context } from 'hono';
import { MEDIA_KINDS, AI_PROPOSAL_DECISIONS } from '@artisan-marketplace/contracts';
import type {
  AiJobMediaReference,
  AiProposalDecision,
} from '@artisan-marketplace/contracts';
import type { ApiEnv } from '../../shared/context/api-env.js';
import { requireActor } from '../../shared/auth/session.js';
import {
  aiEnqueueLimiter,
  aiRunLimiter,
  rateLimitMiddleware,
} from '../../shared/ratelimit/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { getAiServices } from './composition.js';
import type { ProposalDecisionInput } from './application/ai-review-service.js';

export const aiRoutes = new Hono<ApiEnv>();

/**
 * No AI route may be reached anonymously. Enqueueing creates durable work
 * against a product and decisions move values into that product, so the
 * actor is resolved before any handler runs and the caller never names
 * their own identity in the body, exactly as the catalog routes behave.
 */
aiRoutes.use('*', async (c, next) => {
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
 * Reads a matched route parameter. The rate-limit wrapper erases Hono's
 * route typing, so parameters are read through one checked helper and a
 * route that matched without one fails loudly rather than forwarding
 * `undefined` into a service.
 */
function routeId(
  c: Context<ApiEnv>,
  name: 'id' | 'jobId',
): string {
  const id = c.req.param(name);

  if (!id) {
    throw new Error(
      `AI route matched without a ${name}.`,
    );
  }

  return id;
}

/**
 * Media references are the only caller-supplied part of an AI job input.
 * They are validated at the boundary so a body cannot smuggle a malformed
 * reference into durable storage: each entry must name a known media kind
 * and a non-empty id, duplicates are allowed to be rejected rather than
 * stored.
 */
function readMediaReferences(
  value: unknown,
): AiJobMediaReference[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new AppError(
      'VALIDATION_FAILED',
      'media must be a non-empty list of media references.',
    );
  }

  const seen = new Set<string>();

  return value.map((entry, index) => {
    const reference = entry as Record<string, unknown>;

    if (
      typeof reference !== 'object' ||
      reference === null
    ) {
      throw new AppError(
        'VALIDATION_FAILED',
        `media[${index}] must be an object.`,
      );
    }

    const mediaId = reference.mediaId;

    if (
      typeof mediaId !== 'string' ||
      !mediaId.trim()
    ) {
      throw new AppError(
        'VALIDATION_FAILED',
        `media[${index}].mediaId is required.`,
      );
    }

    const kind = reference.kind;

    if (
      typeof kind !== 'string' ||
      !(MEDIA_KINDS as readonly string[]).includes(kind)
    ) {
      throw new AppError(
        'VALIDATION_FAILED',
        `media[${index}].kind is not a supported media kind.`,
      );
    }

    if (seen.has(mediaId)) {
      throw new AppError(
        'VALIDATION_FAILED',
        `media[${index}] references ${mediaId} more than once.`,
      );
    }

    seen.add(mediaId);

    return {
      mediaId,
      kind: kind as AiJobMediaReference['kind'],
    };
  });
}

function readTranscription(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError(
      'VALIDATION_FAILED',
      'transcription must be non-blank text.',
    );
  }

  return value;
}

const DECIDABLE = AI_PROPOSAL_DECISIONS.filter(
  (decision) => decision !== 'PENDING',
) as readonly Exclude<AiProposalDecision, 'PENDING'>[];

/**
 * Decisions are the one place values cross into the product, so the
 * boundary is stricter than the generic schema would be: a proposal id, a
 * single non-PENDING decision, a value that is required only for EDITED
 * and disallowed otherwise (an artisan who accepts a proposal is taking
 * the model's value, not supplying their own beside it).
 */
function readDecisions(body: {
  decisions?: unknown;
}): ProposalDecisionInput[] {
  const raw = body.decisions;

  if (!Array.isArray(raw) || raw.length === 0) {
    throw new AppError(
      'VALIDATION_FAILED',
      'At least one decision is required.',
    );
  }

  const seen = new Set<string>();

  return raw.map((entry, index) => {
    const decision = entry as Record<string, unknown>;

    if (
      typeof decision !== 'object' ||
      decision === null
    ) {
      throw new AppError(
        'VALIDATION_FAILED',
        `decisions[${index}] must be an object.`,
      );
    }

    const proposalId = decision.proposalId;

    if (
      typeof proposalId !== 'string' ||
      !proposalId.trim()
    ) {
      throw new AppError(
        'VALIDATION_FAILED',
        `decisions[${index}].proposalId is required.`,
      );
    }

    if (seen.has(proposalId)) {
      throw new AppError(
        'VALIDATION_FAILED',
        `decisions[${index}] decides ${proposalId} more than once.`,
      );
    }

    seen.add(proposalId);

    const state = decision.decision;

    if (
      typeof state !== 'string' ||
      !(DECIDABLE as readonly string[]).includes(state)
    ) {
      throw new AppError(
        'VALIDATION_FAILED',
        `decisions[${index}].decision must be one of ${DECIDABLE.join(', ')}.`,
      );
    }

    const value = decision.value;
    const hasValue = value !== undefined && value !== null;

    if (state === 'EDITED' && !hasValue) {
      throw new AppError(
        'VALIDATION_FAILED',
        `decisions[${index}].value is required for an EDITED decision.`,
      );
    }

    if (state !== 'EDITED' && hasValue) {
      throw new AppError(
        'VALIDATION_FAILED',
        `decisions[${index}].value is only accepted for an EDITED decision.`,
      );
    }

    return {
      proposalId,
      decision: state as Exclude<AiProposalDecision, 'PENDING'>,
      ...(state === 'EDITED'
        ? { value: readDecisionValue(value, index) }
        : {}),
    };
  });
}

/**
 * The artisan's value for an EDITED decision: a string or a list of
 * strings, since that is the entire shape of the four proposal fields.
 * Anything else is refused at the boundary rather than discovered at
 * normalize time.
 */
function readDecisionValue(
  value: unknown,
  index: number,
): string | readonly string[] {
  if (typeof value === 'string') {
    return value;
  }

  if (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === 'string')
  ) {
    return value;
  }

  throw new AppError(
    'VALIDATION_FAILED',
    `decisions[${index}].value must be text or a list of text.`,
  );
}

aiRoutes.post(
  '/products/:id/ai-jobs',
  rateLimitMiddleware(aiEnqueueLimiter, 'AI job enqueue'),
  async (c) => {
    const body = await c.req.json<{
      media?: unknown;
      transcription?: unknown;
    }>();

    const idempotencyKey =
      c.req.header('idempotency-key');

    if (!idempotencyKey) {
      throw new AppError(
        'VALIDATION_FAILED',
        'Idempotency-Key is required to enqueue an AI job.',
      );
    }

    const media = readMediaReferences(body.media);

    const result = await getAiServices(
      c.env,
    ).pipeline.enqueue({
      productId: routeId(c, 'id'),
      actorId: actorId(c),
      idempotencyKey,
      media,
      ...(body.transcription !== undefined
        ? {
            transcription:
              readTranscription(body.transcription),
          }
        : {}),
      correlationId:
        c.get('requestContext').correlationId,
    });

    return c.json(
      {
        job: result.job,
        deduplicated: !result.created,
      },
      result.created ? 201 : 200,
    );
  },
);

aiRoutes.get('/products/:id/ai-jobs', async (c) => {
  const jobs = await getAiServices(c.env).pipeline.listJobs(
    routeId(c, 'id'),
    actorId(c),
  );

  return c.json({ jobs });
});

aiRoutes.get('/ai-jobs/:jobId', async (c) => {
  const result = await getAiServices(c.env).pipeline.getJob(
    routeId(c, 'jobId'),
    actorId(c),
  );

  return c.json({
    job: result.job,
    proposals: result.proposals,
  });
});

aiRoutes.get(
  '/ai-jobs/:jobId/history',
  async (c) => {
    const proposals = await getAiServices(
      c.env,
    ).pipeline.listProposalHistory(
      routeId(c, 'jobId'),
      actorId(c),
    );

    return c.json({ proposals });
  },
);

aiRoutes.post(
  '/ai-jobs/:jobId/run',
  rateLimitMiddleware(aiRunLimiter, 'AI job run'),
  async (c) => {
    const result = await getAiServices(
      c.env,
    ).pipeline.run(
      routeId(c, 'jobId'),
      actorId(c),
      c.get('requestContext').correlationId,
    );

    return c.json({
      job: result.job,
      proposals: result.proposals,
    });
  },
);

aiRoutes.post('/ai-jobs/:jobId/decisions', async (c) => {
  const body = await c.req.json<{ decisions?: unknown }>();

  const result = await getAiServices(
    c.env,
  ).review.applyDecisions(
    await requireProductIdOfDecisions(c),
    actorId(c),
    readDecisions(body),
  );

  return c.json({
    product: result.product,
    proposals: result.proposals,
    staleFields: result.staleFields,
    applied: result.applied,
  });
});

/**
 * The product is not named in the body: every decision belongs to one
 * job, and the job's product is the authoritative answer. The job is read
 * through the pipeline's ownership check, so the product identity a
 * decision targets can never be asserted by the caller.
 */
async function requireProductIdOfDecisions(
  c: Context<ApiEnv>,
): Promise<string> {
  const jobId = routeId(c, 'jobId');

  const job = await getAiServices(
    c.env,
  ).pipeline.requireOwnedJob(jobId, actorId(c));

  return job.productId;
}