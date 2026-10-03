/**
 * Buyer-facing published-catalog discovery transport.
 *
 * Corresponds to the server endpoints:
 *   GET /discovery/products
 *   GET /discovery/products/:productId
 *
 * The types below mirror the shapes defined in
 * packages/contracts/src/discovery/discovery.ts — the mobile app does not
 * import from the contracts package (per the pattern in review-contract.ts),
 * so each surface declares its own copy of the types it needs.
 */

import { getApiBaseUrl } from '../config/api';

/**
 * Default number of results when the screen does not ask for a size.
 *
 * Mirrors packages/contracts/src/discovery/discovery.ts
 * DISCOVERY_PAGE_SIZE_DEFAULT.
 */
export const DISCOVERY_PAGE_SIZE_DEFAULT = 20;

/**
 * Hard ceiling on a requested page size.
 *
 * The server refuses a larger request rather than clamping it, so a client
 * that sends more than this is guaranteed a 400 rather than a page. The
 * screens use the default, and this is exported so a caller that does size
 * the page has one place to bound itself against.
 *
 * Mirrors packages/contracts/src/discovery/discovery.ts
 * DISCOVERY_PAGE_SIZE_MAX.
 */
export const DISCOVERY_PAGE_SIZE_MAX = 50;

/**
 * Longest accepted search text, in characters.
 *
 * Mirrors packages/contracts/src/discovery/discovery.ts
 * DISCOVERY_SEARCH_MAX_LENGTH.
 */
export const DISCOVERY_SEARCH_MAX_LENGTH = 120;

/**
 * Search parameters for the discovery product list endpoint.
 *
 * Mirrors packages/contracts/src/discovery/discovery.ts SearchPublishedProductsRequest.
 */
export type SearchPublishedProductsRequest = {
  search?: string;
  limit?: number;
  offset?: number;
};

/**
 * One buyer-visible published listing.
 *
 * Mirrors packages/contracts/src/discovery/discovery.ts DiscoveryPublishedProductResponse.
 */
export type DiscoveryPublishedProductResponse = {
  productId: string;
  versionNumber: number;
  title: string;
  description: string;
  category: string | null;
  materials: readonly string[];
  publishedAt: string;
};

/**
 * A bounded page of published listings.
 *
 * Mirrors packages/contracts/src/discovery/discovery.ts SearchPublishedProductsResponse.
 */
export type SearchPublishedProductsResponse = {
  products: readonly DiscoveryPublishedProductResponse[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

/**
 * A single published listing.
 *
 * Mirrors packages/contracts/src/discovery/discovery.ts GetPublishedProductResponse.
 */
export type GetPublishedProductResponse = {
  product: DiscoveryPublishedProductResponse;
};

/**
 * The two reads the discovery screens make.
 *
 * Declared here rather than taken from the contracts package, for the same
 * reason the types above are: the mobile app depends on its own copy of the
 * surface, and the screens accept an injected client so a test can drive them
 * without a network.
 */
export type DiscoveryTransport = {
  searchProducts(
    request: SearchPublishedProductsRequest,
  ): Promise<SearchPublishedProductsResponse>;
  getProduct(
    productId: string,
  ): Promise<GetPublishedProductResponse>;
};

/**
 * Errors thrown when the discovery endpoint returns an unexpected response.
 */
export class DiscoveryTransportError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'DiscoveryTransportError';
  }
}

/**
 * Whether a failed discovery request is worth retrying.
 *
 * Only transport and server-side faults are retryable. A refusal that is the
 * server's considered answer — an invalid page size, a product that is not
 * published — cannot become a success by being asked again, so retrying it
 * would produce a spinner that never resolves into anything useful.
 */
function isRetryableStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null
  );
}

function invalid(what: string): DiscoveryTransportError {
  /**
   * Not retryable. A response the client cannot read is not a temporary
   * fault, and retrying it would hide a contract mismatch behind a spinner
   * that never resolves into anything useful.
   */
  return new DiscoveryTransportError(
    `The API returned a response the app cannot read: ${what}.`,
    'INVALID_SERVER_RESPONSE',
    false,
  );
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
 * The has-more flag is read strictly rather than derived.
 *
 * Defaulting a missing flag to `false` would tell the screen "no more
 * results" on a page the server never finished describing, and the buyer
 * would stop paging rather than be wrong about it.
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

/**
 * One published listing, read strictly.
 *
 * A malformed entry is rejected rather than skipped: filtering it out would
 * render a page with fewer listings than the server sent, and the missing
 * one is precisely a listing the buyer should have been shown. `category`
 * is the one nullable field, and it is accepted as either text or null —
 * anything else is a contract mismatch rather than an absent category.
 */
function readProduct(
  value: unknown,
): DiscoveryPublishedProductResponse {
  if (!isRecord(value)) {
    throw invalid('a published product is not an object');
  }

  const category = value.category;

  if (category !== null && typeof category !== 'string') {
    throw invalid(
      'a product category is neither text nor absent',
    );
  }

  return {
    productId: readText(value.productId, 'a product id'),
    versionNumber: readNumber(
      value.versionNumber,
      'a version number',
    ),
    title: readText(value.title, 'a product title'),
    description: readText(
      value.description,
      'a product description',
    ),
    category,
    materials: readList(
      value.materials,
      (entry) => readText(entry, 'a material'),
      'the product materials',
    ),
    publishedAt: readText(
      value.publishedAt,
      'a publish time',
    ),
  };
}

export class HttpDiscoveryTransport
  implements DiscoveryTransport
{
  async searchProducts(
    request: SearchPublishedProductsRequest,
  ): Promise<SearchPublishedProductsResponse> {
    /**
     * Only the parameters actually present are sent, so "search for
     * nothing" and "no search" stay the same request shape the server
     * documents, and an absent offset reaches the server as absent rather
     * than as the string "undefined".
     */
    const query: string[] = [];

    if (request.search !== undefined) {
      query.push(
        `search=${encodeURIComponent(request.search)}`,
      );
    }

    if (request.limit !== undefined) {
      query.push(`limit=${String(request.limit)}`);
    }

    if (request.offset !== undefined) {
      query.push(`offset=${String(request.offset)}`);
    }

    const body = await this.send(
      `/discovery/products${
        query.length > 0 ? `?${query.join('&')}` : ''
      }`,
    );

    if (!isRecord(body)) {
      throw invalid(
        'the discovery response is not an object',
      );
    }

    return {
      products: readList(
        body.products,
        readProduct,
        'the products',
      ),
      total: readNumber(
        body.total,
        'the total result count',
      ),
      limit: readNumber(body.limit, 'the page limit'),
      offset: readNumber(body.offset, 'the page offset'),
      hasMore: readBoolean(
        body.hasMore,
        'the has-more flag',
      ),
    };
  }

  async getProduct(
    productId: string,
  ): Promise<GetPublishedProductResponse> {
    /**
     * Refused on the client rather than sent. An empty id would reach the
     * collection route instead of the item route, and the answer that comes
     * back would be about the wrong resource — reported, correctly, as "no
     * such product", which is not what was asked.
     */
    if (productId.trim() === '') {
      throw new DiscoveryTransportError(
        'A product id is required to open a listing.',
        'INVALID_REQUEST',
        false,
      );
    }

    const body = await this.send(
      `/discovery/products/${encodeURIComponent(productId)}`,
    );

    if (!isRecord(body)) {
      throw invalid(
        'the published product response is not an object',
      );
    }

    return { product: readProduct(body.product) };
  }

  /**
   * One request, one place that turns a response into either a value or a
   * classified failure. Read-only and headerless: discovery takes no
   * credentials, because a read over published snapshots is not a
   * permission decision.
   */
  private async send(
    path: string,
  ): Promise<unknown> {
    let response: Response;

    try {
      response = await fetch(`${getApiBaseUrl()}${path}`, {
        method: 'GET',
      });
    } catch (error) {
      throw new DiscoveryTransportError(
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

    return Promise.reject(
      new DiscoveryTransportError(
        typeof message === 'string'
          ? message
          : 'The request failed.',
        typeof code === 'string'
          ? code
          : `HTTP_${response.status}`,
        isRetryableStatus(response.status),
      ),
    );
  }
}

/**
 * The client the discovery screens use when nothing is injected.
 *
 * One instance for the lifetime of the module, created here rather than by
 * the screen. It matters that this is a single object: a screen that
 * constructed its own client during render would produce a different
 * `HttpDiscoveryTransport` on every render, which makes the callback that
 * loads the page change identity every render, which re-runs the effect that
 * calls it, which sets state, which renders again. The loop never ends and
 * the buyer sees a spinner instead of the catalog. The class is stateless
 * and the base URL is read per request, so a shared instance has nothing to
 * share unsafely and nothing to be stale about.
 */
export const defaultDiscoveryTransport: DiscoveryTransport =
  new HttpDiscoveryTransport();

/**
 * The client a screen should use.
 *
 * The only two ways to obtain one, so the unstable third — constructing one
 * per render — has no call site to hide in.
 */
export function resolveDiscoveryTransport(
  injected?: DiscoveryTransport,
): DiscoveryTransport {
  return injected ?? defaultDiscoveryTransport;
}
