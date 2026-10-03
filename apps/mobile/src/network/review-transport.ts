import { getApiBaseUrl } from '../config/api';
import {
  AI_PROPOSAL_FIELDS,
  AI_RISK_LEVELS,
  AI_RISK_REASONS,
  PRODUCT_STATES,
  REVIEW_BLOCKING_REASONS,
  ReviewTransportError,
  type AiProposalField,
  type AiRiskLevel,
  type AiRiskReason,
  type CatalogProductResponse,
  type ClientApproval,
  type ClientDecidedProduct,
  type ClientProductReview,
  type ClientProposalDecisionInput,
  type ClientProposalDecisionResult,
  type ClientReviewBlocking,
  type ClientReviewSuggestion,
  type ProductState,
  type ReviewTransport,
} from './review-contract';

/**
 * Whether a failed review request is worth retrying.
 *
 * A refusal that is the server's considered answer — the product is not
 * ready, the caller is not its owner — must not be retried, because
 * retrying cannot make it become ready. Only transport faults and server-side
 * faults are retryable. Getting this backwards produces a screen that
 * retries forever against an answer that will never change.
 */
function isRetryableStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null
  );
}

function invalid(
  what: string,
): ReviewTransportError {
  /**
   * Not retryable. A response the client cannot read is not a temporary
   * fault, and retrying it would hide a contract mismatch behind a spinner
   * that never resolves into anything useful.
   */
  return new ReviewTransportError(
    `The API returned a response the app cannot read: ${what}.`,
    'INVALID_SERVER_RESPONSE',
    false,
  );
}

function readEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  what: string,
): T {
  if (
    typeof value !== 'string' ||
    !(allowed as readonly string[]).includes(value)
  ) {
    throw invalid(`${what} is not one of ${allowed.join(', ')}`);
  }

  return value as T;
}

function readText(value: unknown, what: string): string {
  if (typeof value !== 'string') {
    throw invalid(`${what} is not text`);
  }

  return value;
}

function readNumber(value: unknown, what: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    throw invalid(`${what} is not a number`);
  }

  return value;
}

/**
 * A field the client must not guess at.
 *
 * A list is read strictly rather than defaulted to `[]`, because an empty
 * list renders as "no risk reasons", which reads to an artisan as an
 * all-clear. A value the client cannot read has to fail the response rather
 * than quietly become a favourable one. The same reasoning applies to the
 * staleness flag: defaulting it to `false` would report a suggestion as
 * current when the server said nothing at all.
 */
function readBoolean(value: unknown, what: string): boolean {
  if (typeof value !== 'boolean') {
    throw invalid(`${what} is not true or false`);
  }

  return value;
}

function readList<T>(
  value: unknown,
  readEntry: (entry: unknown) => T,
  what: string,
): readonly T[] {
  if (!Array.isArray(value)) {
    throw invalid(`${what} is not a list`);
  }

  return value.map((entry) => readEntry(entry));
}

function readProduct(
  value: unknown,
): CatalogProductResponse {
  if (!isRecord(value)) {
    throw invalid('the product is not an object');
  }

  const state = readEnum<ProductState>(
    value.state,
    PRODUCT_STATES,
    'the product state',
  );

  if (!Array.isArray(value.materials)) {
    throw invalid('the product materials are not a list');
  }

  return {
    id: readText(value.id, 'the product id'),
    ownerId: readText(value.ownerId, 'the product owner'),
    title:
      typeof value.title === 'string' ? value.title : null,
    description:
      typeof value.description === 'string'
        ? value.description
        : null,
    category:
      typeof value.category === 'string'
        ? value.category
        : null,
    materials: value.materials.map((entry) =>
      readText(entry, 'a material'),
    ),
    state,
    createdAt: readText(
      value.createdAt,
      'the product creation time',
    ),
    updatedAt: readText(
      value.updatedAt,
      'the product update time',
    ),
    publishedVersion:
      typeof value.publishedVersion === 'number'
        ? value.publishedVersion
        : null,
  };
}

function readSuggestion(
  value: unknown,
): ClientReviewSuggestion {
  if (!isRecord(value)) {
    throw invalid('a suggestion is not an object');
  }

  const proposed = value.proposedValue;
  const current = value.currentValue;

  return {
    proposalId: readText(
      value.proposalId,
      'a suggestion id',
    ),
    jobId: readText(value.jobId, 'a suggestion job id'),
    attempt: readNumber(value.attempt, 'a suggestion attempt'),
    field: readEnum<AiProposalField>(
      value.field,
      AI_PROPOSAL_FIELDS,
      'a suggestion field',
    ),
    proposedValue: readSuggestionValue(
      proposed,
      'a suggested value',
    ),
    currentValue:
      current === null || current === undefined
        ? null
        : readSuggestionValue(
            current,
            'a current value',
          ),
    confidence:
      typeof value.confidence === 'number' &&
      Number.isFinite(value.confidence)
        ? value.confidence
        : null,
    /**
     * `NONE` is included deliberately. Excluding it would reject the most
     * common response the server sends and fail the whole review load over a
     * field the screen mostly does not display.
     */
    riskLevel: readEnum<AiRiskLevel>(
      value.riskLevel,
      AI_RISK_LEVELS,
      'a risk level',
    ),
    riskReasons: readList(
      value.riskReasons,
      (entry) =>
        readEnum<AiRiskReason>(
          entry,
          AI_RISK_REASONS,
          'a risk reason',
        ),
      'a suggestion risk reason',
    ),
    stale: readBoolean(
      value.stale,
      'a suggestion staleness flag',
    ),
    provider: readText(
      value.provider,
      'a suggestion provider',
    ),
    model: readText(value.model, 'a suggestion model'),
    modelVersion:
      typeof value.modelVersion === 'string'
        ? value.modelVersion
        : null,
    promptVersion: readText(
      value.promptVersion,
      'a prompt version',
    ),
    schemaVersion: readText(
      value.schemaVersion,
      'a schema version',
    ),
    pipelineVersion: readText(
      value.pipelineVersion,
      'a pipeline version',
    ),
  };
}

function readSuggestionValue(
  value: unknown,
  what: string,
): string | readonly string[] {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) =>
      readText(entry, `${what} entry`),
    );
  }

  throw invalid(`${what} is text or a list of text`);
}

/**
 * The product as the decision route reports it.
 *
 * Read as a projection rather than as a catalog response, because it is a
 * different shape: this route answers with the product's fields after the
 * write, and the fields it does not send are not read as absent. `materials`
 * is read strictly for the same reason `riskReasons` is — a list read as
 * missing would render as "no materials" on a product that has them.
 */
function readDecidedProduct(
  value: unknown,
): ClientDecidedProduct {
  if (!isRecord(value)) {
    throw invalid('the decided product is not an object');
  }

  return {
    id: readText(value.id, 'the decided product id'),
    ownerId: readText(
      value.ownerId,
      'the decided product owner',
    ),
    state: readEnum<ProductState>(
      value.state,
      PRODUCT_STATES,
      'the decided product state',
    ),
    title:
      typeof value.title === 'string' ? value.title : null,
    description:
      typeof value.description === 'string'
        ? value.description
        : null,
    category:
      typeof value.category === 'string'
        ? value.category
        : null,
    materials: readList(
      value.materials,
      (entry) => readText(entry, 'a material'),
      'the decided product materials',
    ),
  };
}

function readFieldList(
  value: unknown,
  what: string,
): readonly AiProposalField[] {
  return readList(
    value,
    (entry) =>
      readEnum<AiProposalField>(
        entry,
        AI_PROPOSAL_FIELDS,
        what,
      ),
    what,
  );
}

function readBlocking(
  value: unknown,
): ClientReviewBlocking {
  if (!isRecord(value)) {
    throw invalid('a blocking reason is not an object');
  }

  return {
    reason: readEnum(
      value.reason,
      REVIEW_BLOCKING_REASONS,
      'a blocking reason',
    ),
    ...(value.field === undefined
      ? {}
      : {
          field: readEnum(
            value.field,
            AI_PROPOSAL_FIELDS,
            'a blocking field',
          ),
        }),
    message: readText(
      value.message,
      'a blocking message',
    ),
  };
}

export class HttpReviewTransport
  implements ReviewTransport
{
  async getReview(
    remoteProductId: string,
  ): Promise<ClientProductReview> {
    const body = await this.send(
      `/catalog/products/${remoteProductId}/review`,
      'GET',
    );

    if (!isRecord(body)) {
      throw invalid('the review response is not an object');
    }

    return {
      product: readProduct(body.product),
      suggestions: readList(
        body.suggestions,
        readSuggestion,
        'the suggestions',
      ),
      blocking: readList(
        body.blocking,
        readBlocking,
        'the blocking reasons',
      ),
      /**
       * Treated as absent when it is not a boolean rather than trusted. The
       * screen derives the same thing from the blocking list, so a missing
       * flag cannot enable a button the server would refuse.
       */
      readyForApproval:
        typeof body.readyForApproval === 'boolean' &&
        body.readyForApproval,
    };
  }

  /**
   * Records one artisan decision through the AI module's decision route.
   *
   * The route is the existing one, and it is the only route by which an
   * AI-derived value can reach a product, so it is reused rather than
   * re-modelled here. The client sends a one-element batch because it decides
   * one suggestion at a time and the server is the one that knows two
   * accepted proposals for the same field are a contradiction.
   *
   * A `value` is sent only with an `EDITED` decision. Sending one beside an
   * `ACCEPTED` is refused at the server's boundary, and the absence is the
   * meaningful part: accepting means taking the model's value, not supplying
   * a different one beside it.
   */
  async decideProposal(
    jobId: string,
    decision: ClientProposalDecisionInput,
  ): Promise<ClientProposalDecisionResult> {
    const body = await this.send(
      `/catalog/ai-jobs/${jobId}/decisions`,
      'POST',
      { 'content-type': 'application/json' },
      {
        decisions: [
          {
            proposalId: decision.proposalId,
            decision: decision.decision,
            ...(decision.decision === 'EDITED'
              ? { value: decision.value }
              : {}),
          },
        ],
      },
    );

    if (!isRecord(body)) {
      throw invalid('the decision response is not an object');
    }

    const result: ClientProposalDecisionResult = {
      product: readDecidedProduct(body.product),
      applied: readFieldList(
        body.applied,
        'the applied fields',
      ),
      staleFields: readFieldList(
        body.staleFields,
        'the stale fields',
      ),
    };

    /**
     * The response has to agree with the decision that was made.
     *
     * A rejected suggestion that the server reports as having written
     * something would mean the artisan's "leave this alone" changed their
     * product, which is the one outcome this screen exists to make
     * impossible. The inverse — an accepted or edited value the server does
     * not list as written — would mean the screen reported a change that did
     * not happen. Both are read as a contract mismatch rather than
     * reconciled, because the client cannot tell which side is wrong and
     * guessing in either direction misreports an artisan's own decision.
     *
     * The check is about the decision as a whole rather than about one field,
     * because the response names the fields it wrote and the client does not
     * claim to know which field a proposal id refers to. It is enough for the
     * only two things the client asserts: a rejection writes nothing, and a
     * decision that carries a value writes something.
     */
    const wroteNothing = result.applied.length === 0;

    if (wroteNothing !== (decision.decision === 'REJECTED')) {
      throw invalid(
        `a ${decision.decision} decision was answered with ${
          wroteNothing ? 'no change' : 'a change'
        }`,
      );
    }

    return result;
  }

  async approve(
    remoteProductId: string,
  ): Promise<ClientApproval> {
    const body = await this.send(
      `/catalog/products/${remoteProductId}/review/approve`,
      'POST',
    );

    if (!isRecord(body)) {
      throw invalid('the approval response is not an object');
    }

    return {
      product: readProduct(body.product),
      deduplicated:
        body.deduplicated === true,
    };
  }

  async publish(
    remoteProductId: string,
    idempotencyKey: string,
  ): Promise<{
    product: CatalogProductResponse;
    versionNumber: number;
  }> {
    const body = await this.send(
      `/catalog/products/${remoteProductId}/publish`,
      'POST',
      { 'idempotency-key': idempotencyKey },
    );

    if (!isRecord(body)) {
      throw invalid('the publish response is not an object');
    }

    if (!isRecord(body.version)) {
      throw invalid('the published version is not an object');
    }

    return {
      product: readProduct(body.product),
      versionNumber: readNumber(
        body.version.versionNumber,
        'the version number',
      ),
    };
  }

  /**
   * One request, one place that turns a response into either a value or a
   * classified failure.
   *
   * The blocking list is lifted out of a refusal so the screen can show what
   * the server said was wrong. A 409 that only reported "not ready" would
   * leave the artisan to guess, and guessing here means approving anyway.
   */
  private async send(
    path: string,
    method: string,
    headers: Record<string, string> = {},
    requestBody?: unknown,
  ): Promise<unknown> {
    let response: Response;

    try {
      response = await fetch(`${getApiBaseUrl()}${path}`, {
        method,
        headers,
        ...(requestBody === undefined
          ? {}
          : { body: JSON.stringify(requestBody) }),
      });
    } catch (error) {
      throw new ReviewTransportError(
        error instanceof Error
          ? error.message
          : 'Network request failed.',
        'NETWORK_ERROR',
        true,
      );
    }

    let body: unknown = null;

    try {
      body = await response.json();
    } catch {
      // The status code remains authoritative when the body is unreadable.
    }

    if (response.ok) {
      return body;
    }

    const payload = isRecord(body) ? body : undefined;
    const error = isRecord(payload?.error)
      ? payload.error
      : undefined;

    const code = error?.code ?? `HTTP_${response.status}`;
    const message =
      error?.message ??
      `The request failed with HTTP ${response.status}.`;

    const details = isRecord(error?.details)
      ? error.details
      : undefined;

    return Promise.reject(
      new ReviewTransportError(
        typeof message === 'string'
          ? message
          : 'The request failed.',
        typeof code === 'string'
          ? code
          : `HTTP_${response.status}`,
        isRetryableStatus(response.status),
        Array.isArray(details?.blocking)
          ? details.blocking.map(readBlocking)
          : [],
      ),
    );
  }
}

/**
 * The client the review screen uses when nothing is injected.
 *
 * One instance for the lifetime of the module, created here rather than by
 * the screen. It matters that this is a single object: a screen that
 * constructed its own client during render would produce a different
 * `HttpReviewTransport` on every render, which makes the callback that loads
 * the review change identity every render, which re-runs the effect that
 * calls it, which sets state, which renders again. The loop never ends and
 * the artisan sees a spinner instead of their product. The class is stateless
 * and the base URL is read per request, so a shared instance has nothing to
 * share unsafely and nothing to be stale about.
 */
export const defaultReviewTransport: ReviewTransport =
  new HttpReviewTransport();

/**
 * The client a screen should use.
 *
 * The only two ways to obtain one, so the unstable third — constructing one
 * per render — has no call site to hide in.
 */
export function resolveReviewTransport(
  injected?: ReviewTransport,
): ReviewTransport {
  return injected ?? defaultReviewTransport;
}
