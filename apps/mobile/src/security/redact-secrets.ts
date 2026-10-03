/**
 * Redaction of untrusted text before it is persisted or shown.
 *
 * Error text reaches the client from several untrusted places: a
 * native upload rejection, an HTTP response body, an error thrown by a
 * dependency. Any of those may embed a presigned URL, and a presigned
 * URL is a temporary write credential.
 *
 * These helpers are deliberately conservative: when in doubt, text that
 * looks like a credential is removed rather than shortened, because a
 * truncated signature is still a usable prefix of a credential.
 */

/**
 * Query parameters and fragments that carry authorization. Even a
 * partial value is removed, since a shortened signature may still be
 * accepted by some object stores.
 */
const SENSITIVE_QUERY_KEYS = [
  'signature',
  'x-amz-signature',
  'x-amz-credential',
  'x-amz-security-token',
  'awsaccesskeyid',
  'token',
  'access_token',
  'auth',
  'authorization',
  'password',
  'secret',
  // Azure SAS fields. These authorize a request in combination, so
  // each one individually is treated as sensitive.
  'sas',
  'se',
  'sp',
  'sv',
  'st',
  'sr',
  'skoid',
  'sktid',
  'skt',
  'ske',
  'sks',
  'skv',
  'sig',
  'key',
  'apikey',
  'api_key',
];

function isSensitiveKey(
  key: string,
): boolean {
  const normalized = key.toLowerCase();

  return SENSITIVE_QUERY_KEYS.some(
    (sensitive) => normalized === sensitive,
  );
}

/**
 * Removes presigned-URL query parameters and bare credential-looking
 * tokens from arbitrary text.
 *
 * Applied at the boundary where untrusted text becomes a durable
 * record, so nothing sensitive is written to the device database, sent
 * to the server, or displayed to the artisan.
 */
export function redactSecrets(
  text: string,
): string {
  let result = text;

  // Absolute URLs: keep the origin, drop the entire query.
  result = result.replace(
    /[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi,
    (url) => {
      const queryIndex = url.indexOf('?');

      if (queryIndex === -1) {
        return url;
      }

      // Only the parameters that authorize are removed. Non-sensitive
      // parameters such as a content type stay readable.
      const query = url.slice(queryIndex + 1);
      const kept = query
        .split('&')
        .filter((pair) => {
          const key = pair.split('=')[0] ?? '';

          return !isSensitiveKey(
            decodeURIComponent(key),
          );
        });

      if (kept.length === query.split('&').length) {
        return url;
      }

      return `${url.slice(0, queryIndex)}?${kept.join('&')}${
        kept.length > 0 ? '' : '[redacted]'
      }`;
    },
  );

  // Bare `key=value` pairs, which is how native and HTTP libraries
  // often format a rejected URL.
  result = result.replace(
    /\b([A-Za-z0-9_-]+)=([^\s&;"']+)/g,
    (match, key: string) =>
      isSensitiveKey(key) ? `${key}=[redacted]` : match,
  );

  // Any remaining credential fragment that was not part of a URL.
  // `X-Amz-Date` is excluded deliberately: it is part of the signature
  // calculation, not the signature itself, and removing it would make
  // an otherwise useful failure undiagnosable.
  result = result.replace(
    /\b(?:X-Amz-(?!Date\b)[A-Za-z-]+|Signature|Sig|SAS|Token)=[^\s&;"']+/gi,
    (match) => `${match.split('=')[0]}=[redacted]`,
  );

  return result;
}

/**
 * A bounded, redacted description of an upload failure that is safe to
 * persist and to show the artisan.
 *
 * The length bound keeps a large native error body from filling a
 * database column or overflowing a screen.
 */
export function safeFailureMessage(
  error: unknown,
  fallback: string,
  maxLength = 500,
): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : fallback;

  const redacted = redactSecrets(raw).trim();

  const message =
    redacted.length > 0 ? redacted : fallback;

  return message.length > maxLength
    ? `${message.slice(0, maxLength - 1)}…`
    : message;
}
