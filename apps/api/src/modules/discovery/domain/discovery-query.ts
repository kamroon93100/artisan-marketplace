import {
  DISCOVERY_PAGE_SIZE_DEFAULT,
  DISCOVERY_PAGE_SIZE_MAX,
  DISCOVERY_SEARCH_MAX_LENGTH,
} from '@artisan-marketplace/contracts';

/**
 * A validated buyer search.
 *
 * `search` is absent rather than an empty string when the buyer typed
 * nothing, so "no search" and "a search for nothing" are the same request
 * and cannot produce two different behaviours downstream. That is the same
 * shape the catalog's own search query uses, so passing one to the other is
 * a hand-off rather than a translation.
 */
export type DiscoveryQuery = {
  search?: string;
  limit: number;
  offset: number;
};

/**
 * The raw, untrusted shape a query arrives as.
 *
 * Everything here is optional and everything is `unknown`: this is what
 * arrives from a URL query string, and nothing about it can be assumed.
 */
export type DiscoveryQueryInput = {
  search?: unknown;
  limit?: unknown;
  offset?: unknown;
};

/**
 * A rejected search parameter, naming the parameter at fault.
 *
 * A plain domain error rather than a transport error, so the same rule
 * applies whichever caller arrives — the HTTP boundary, or a future mobile
 * or internal caller — and the HTTP layer decides how to report it.
 */
export class DiscoveryQueryError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'DiscoveryQueryError';
  }
}

/**
 * Reads a page size or an offset, or refuses it.
 *
 * These are parsed from strings, so `?limit=10` and `?limit=abc` both
 * arrive as text. Only a whole number inside the allowed range is accepted:
 *
 * - a fractional or non-numeric value is refused rather than rounded or
 *   defaulted, because a client that asked for 2.5 products and received 2
 *   has been given something other than what it asked for, silently;
 * - a negative offset is refused because it has no meaning, and allowing
 *   it would let a page be addressed from the other end of the catalog;
 * - a limit above the ceiling is refused rather than clamped. Clamping
 *   would answer a different question than the client asked without saying
 *   so; the response reports the limit that was actually applied, so a
 *   refusal is the honest outcome.
 */
function readBoundedInteger(
  raw: unknown,
  field: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number {
  if (raw === undefined) {
    return defaultValue;
  }

  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new DiscoveryQueryError(
      field,
      `${field} must be a whole number.`,
    );
  }

  const parsed = Number(raw);

  if (!Number.isInteger(parsed)) {
    throw new DiscoveryQueryError(
      field,
      `${field} must be a whole number.`,
    );
  }

  if (parsed < minimum) {
    throw new DiscoveryQueryError(
      field,
      minimum === 0
        ? `${field} must not be negative.`
        : `${field} must be at least ${minimum}.`,
    );
  }

  if (parsed > maximum) {
    throw new DiscoveryQueryError(
      field,
      maximum === Number.MAX_SAFE_INTEGER
        ? `${field} is too large.`
        : `${field} must be at most ${maximum}.`,
    );
  }

  return parsed;
}

/**
 * Validates an untrusted search into the one shape the catalog accepts.
 *
 * The search text is trimmed and lowercased here, so the case-insensitivity
 * of the search is decided once in one place rather than being repeated as
 * a `lower()` in a query string that a later edit could forget.
 *
 * An empty or whitespace-only search is treated as no search at all. That
 * is not a lenient reading of the input; it is the same request a buyer
 * makes when they have cleared the search box, and treating it as a literal
 * search for whitespace would return an empty catalog for a field that
 * looks filled in.
 */
export function parseDiscoveryQuery(
  input: DiscoveryQueryInput,
): DiscoveryQuery {
  const search = readSearch(input.search);

  return {
    ...(search === undefined ? {} : { search }),
    limit: readBoundedInteger(
      input.limit,
      'limit',
      DISCOVERY_PAGE_SIZE_DEFAULT,
      1,
      DISCOVERY_PAGE_SIZE_MAX,
    ),
    offset: readBoundedInteger(
      input.offset,
      'offset',
      0,
      0,
      Number.MAX_SAFE_INTEGER,
    ),
  };
}

function readSearch(raw: unknown): string | undefined {
  if (raw === undefined) {
    return undefined;
  }

  if (typeof raw !== 'string') {
    throw new DiscoveryQueryError(
      'search',
      'search must be a single text value.',
    );
  }

  const trimmed = raw.trim().toLowerCase();

  if (trimmed.length === 0) {
    return undefined;
  }

  if (trimmed.length > DISCOVERY_SEARCH_MAX_LENGTH) {
    throw new DiscoveryQueryError(
      'search',
      `search must be at most ${DISCOVERY_SEARCH_MAX_LENGTH} characters.`,
    );
  }

  return trimmed;
}
