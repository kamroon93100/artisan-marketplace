/**
 * Buyer inquiries against published catalog state.
 *
 * Corresponds to the server endpoints:
 *   POST /inquiries                 (requires Idempotency-Key)
 *   GET  /inquiries                 (the authenticated buyer's own)
 *   GET  /inquiries/:inquiryId      (one of the buyer's own)
 *
 * The types below mirror packages/contracts/src/inquiry/inquiry.ts, declared
 * here rather than imported: this client talks to an untrusted boundary and
 * validates every response before use, and importing the server's types
 * would make those checks look redundant.
 *
 * Three properties of the server contract this transport exists to honour:
 *
 * 1. The buyer identity is never sent. It is derived from the authenticated
 *    actor, so a body naming a buyer is either ignored or refused — either
 *    way this client does not send one.
 * 2. Creation requires an `Idempotency-Key`. The offline-first client retries
 *    a send whose response was lost, and without the key a retry would ask
 *    the artisan to read the same question twice. The key is generated per
 *    composition attempt and held stable across that attempt's retries, so a
 *    retry converges on the inquiry the first request created.
 * 3. `deduplicated` is the honest signal that a retry converged: the response
 *    is 200 rather than 201, and the app says "already sent" rather than
 *    "sent" for something it cannot prove it sent.
 */

import { getApiBaseUrl } from '../config/api';
import { authorizationHeaders } from './authorization';

/** Longest accepted buyer message, in characters. */
export const INQUIRY_MESSAGE_MAX_LENGTH = 2000;

/** Default number of inquiries returned when the client does not ask. */
export const INQUIRY_PAGE_SIZE_DEFAULT = 20;

export const INQUIRY_STATUSES = ['NEW'] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

/**
 * A buyer's inquiry.
 *
 * `catalogVersion` is the published version that was current when the
 * inquiry was created, recorded rather than derived so the reference stays
 * meaningful after the artisan edits the product.
 */
export type Inquiry = {
  id: string;
  buyerId: string;
  productId: string;
  catalogVersion: number;
  message: string;
  status: InquiryStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreateInquiryRequest = {
  productId: string;
  message: string;
  /** Stable across retries of one composition attempt. */
  idempotencyKey: string;
};

export type CreateInquiryResult = {
  inquiry: Inquiry;
  /** True when this response is a retry converging on an earlier inquiry. */
  deduplicated: boolean;
};

export type ListInquiriesResult = {
  inquiries: readonly Inquiry[];
  total: number;
  hasMore: boolean;
};

export type InquiryTransport = {
  create(request: CreateInquiryRequest): Promise<CreateInquiryResult>;
  listOwn(options?: { limit?: number; offset?: number }): Promise<ListInquiriesResult>;
  getOwn(inquiryId: string): Promise<Inquiry>;
};

/** Errors surfaced for a refused or unreadable inquiry operation. */
export class InquiryTransportError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'InquiryTransportError';
  }
}

/**
 * A message the client can refuse before spending a request.
 *
 * The server's rule is the one that counts and its answer is a 400 naming
 * the field; this check exists so the composer can tell the buyer as they
 * type rather than after a round-trip.
 */
export function validateInquiryMessage(message: string): string | null {
  const trimmed = message.trim();

  if (trimmed.length === 0) {
    return 'Write your question before sending it.';
  }

  if (trimmed.length > INQUIRY_MESSAGE_MAX_LENGTH) {
    return `Your message is too long. Keep it under ${INQUIRY_MESSAGE_MAX_LENGTH} characters.`;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function unreadable(what: string): InquiryTransportError {
  return new InquiryTransportError(
    `The API returned a response the app cannot read: ${what}.`,
    'INVALID_SERVER_RESPONSE',
    false,
  );
}

function readString(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw unreadable(what);
  }
  return value;
}

function readNumber(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw unreadable(what);
  }
  return value;
}

/**
 * Parses one inquiry.
 *
 * A field the app depends on that is missing is a failure rather than a
 * partially-shown inquiry: the history would list something the buyer cannot
 * open.
 */
export function parseInquiry(value: unknown): Inquiry {
  if (!isRecord(value)) {
    throw unreadable('the inquiry');
  }

  const status = value.status;
  if (typeof status !== 'string' || !INQUIRY_STATUSES.includes(status as InquiryStatus)) {
    // A status this client does not know is refused rather than guessed at:
    // the inbox would show the wrong thing confidently.
    throw unreadable(`the inquiry status (${String(status)})`);
  }

  return {
    id: readString(value.id, 'the inquiry id'),
    buyerId: readString(value.buyerId, 'the inquiry buyer'),
    productId: readString(value.productId, 'the inquiry product'),
    catalogVersion: readNumber(value.catalogVersion, 'the inquiry catalog version'),
    message: readString(value.message, 'the inquiry message'),
    status: status as InquiryStatus,
    createdAt: readString(value.createdAt, 'the inquiry creation time'),
    updatedAt: readString(value.updatedAt, 'the inquiry update time'),
  };
}

function parseInquiryPage(value: unknown): ListInquiriesResult {
  if (!isRecord(value) || !Array.isArray(value.inquiries)) {
    throw unreadable('the inquiry list');
  }

  const inquiries = value.inquiries.map((entry) => parseInquiry(entry));

  return {
    inquiries,
    total: typeof value.total === 'number' ? value.total : inquiries.length,
    hasMore: value.hasMore === true,
  };
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/**
 * Reads an API error body without echoing anything the server said about the
 * credentials. The message is the server's own wording, which is the only
 * explanation the buyer gets for a refusal.
 */
function readApiError(body: unknown): { code: string; message: string } | null {
  if (!isRecord(body) || !isRecord(body.error)) {
    return null;
  }

  return {
    code: typeof body.error.code === 'string' ? body.error.code : 'UNKNOWN',
    message: typeof body.error.message === 'string' ? body.error.message : '',
  };
}

export class HttpInquiryTransport implements InquiryTransport {
  constructor(
    private readonly fetchImpl?: typeof fetch,
    private readonly baseUrl: string = getApiBaseUrl(),
  ) {}

  private get fetchFn(): typeof fetch {
    return this.fetchImpl ?? globalThis.fetch;
  }

  private async send(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<{ status: number; parsed: unknown }> {
    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers: {
        ...(await authorizationHeaders()),
        ...headers,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const text = await response.text();
    let parsed: unknown = null;

    try {
      parsed = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    return { status: response.status, parsed };
  }

  async create(request: CreateInquiryRequest): Promise<CreateInquiryResult> {
    const messageProblem = validateInquiryMessage(request.message);
    if (messageProblem !== null) {
      throw new InquiryTransportError(messageProblem, 'INVALID_MESSAGE', false);
    }

    if (!request.idempotencyKey?.trim()) {
      throw new InquiryTransportError(
        'This message could not be sent safely, because it has no retry key.',
        'MISSING_IDEMPOTENCY_KEY',
        false,
      );
    }

    const { status, parsed } = await this.send('POST', '/inquiries', {
      productId: request.productId,
      message: request.message,
    }, {
      // Sent on every attempt for this composition so a retry converges.
      'idempotency-key': request.idempotencyKey,
    });

    if (status === 201 || status === 200) {
      if (!isRecord(parsed) || !isRecord(parsed.inquiry)) {
        throw unreadable('the response body has no inquiry');
      }

      return {
        inquiry: parseInquiry(parsed.inquiry),
        deduplicated: status === 200,
      };
    }

    const apiError = readApiError(parsed);

    if (apiError?.code === 'VALIDATION_FAILED' && apiError.message) {
      throw new InquiryTransportError(apiError.message, 'INVALID_MESSAGE', false);
    }

    if (apiError?.code === 'RATE_LIMITED') {
      throw new InquiryTransportError(
        'You are sending messages a little too quickly. Try again in a moment.',
        'RATE_LIMITED',
        true,
      );
    }

    if (apiError?.code === 'UNAUTHENTICATED') {
      // Only reachable if the session lapsed between the composer opening and
      // the send; the session seam renews, so this is a genuine expiry.
      throw new InquiryTransportError(
        'Your session has expired. Sign in again to send your question.',
        'SESSION_EXPIRED',
        false,
      );
    }

    if (isRetryableStatus(status)) {
      throw new InquiryTransportError(
        'Your question could not be sent right now. Try again.',
        'UNAVAILABLE',
        true,
      );
    }

    throw new InquiryTransportError(
      'Your question could not be sent.',
      'SEND_FAILED',
      false,
    );
  }

  async listOwn(options?: { limit?: number; offset?: number }): Promise<ListInquiriesResult> {
    const query = new URLSearchParams();

    // A bounded page is the client's responsibility: a caller that forgets a
    // size gets the default rather than an unbounded response the server
    // would have to truncate on its own.
    query.set('limit', String(options?.limit ?? INQUIRY_PAGE_SIZE_DEFAULT));

    if (options?.offset !== undefined) {
      query.set('offset', String(options.offset));
    }

    const { status, parsed } = await this.send('GET', `/inquiries?${query.toString()}`);

    if (status === 200) {
      return parseInquiryPage(parsed);
    }

    if (isRetryableStatus(status)) {
      throw new InquiryTransportError(
        'Your questions could not be loaded right now. Try again.',
        'UNAVAILABLE',
        true,
      );
    }

    throw new InquiryTransportError(
      'Your questions could not be loaded.',
      'LOAD_FAILED',
      false,
    );
  }

  async getOwn(inquiryId: string): Promise<Inquiry> {
    if (!inquiryId?.trim()) {
      throw new InquiryTransportError(
        'That question could not be found.',
        'INQUIRY_UNKNOWN',
        false,
      );
    }

    const { status, parsed } = await this.send(
      'GET',
      `/inquiries/${encodeURIComponent(inquiryId)}`,
    );

    if (status === 200) {
      if (!isRecord(parsed) || !isRecord(parsed.inquiry)) {
        throw unreadable('the response body has no inquiry');
      }

      return parseInquiry(parsed.inquiry);
    }

    // Another buyer's inquiry is reported exactly as one that does not exist,
    // so 404 here means "not yours to read" just as it means "gone".
    if (status === 404) {
      throw new InquiryTransportError(
        'That question could not be found.',
        'INQUIRY_UNKNOWN',
        false,
      );
    }

    if (isRetryableStatus(status)) {
      throw new InquiryTransportError(
        'That question could not be loaded right now. Try again.',
        'UNAVAILABLE',
        true,
      );
    }

    throw new InquiryTransportError(
      'That question could not be loaded.',
      'LOAD_FAILED',
      false,
    );
  }
}
