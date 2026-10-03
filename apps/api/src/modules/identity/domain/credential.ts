/**
 * Opaque credential minting for the approved M8 Gate A mechanism
 * (A2 — server-issued opaque sessions).
 *
 * A credential is 32 cryptographically random bytes (256 bits) encoded as
 * unpadded base64url: 43 characters from `[A-Za-z0-9_-]`. It carries no
 * structure, no claims, and no signature. The client stores and echoes it
 * verbatim and never parses it; only the server ever derives meaning from
 * it, by matching it against server-side session state.
 *
 * Credentials are never written to logs, error messages, audit records, or
 * test output. They exist only in the session store and in the response
 * that issues them to the caller.
 */
const CREDENTIAL_BYTES = 32;

const BASE64URL_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Unpadded base64url encoder.
 *
 * Implemented directly instead of via `btoa` so the same code runs in the
 * Workers runtime and in Node test runs without a Buffer dependency, and
 * so padding can never leak back in.
 */
function encodeBase64Url(bytes: Uint8Array): string {
  let encoded = '';

  for (let index = 0; index < bytes.length; index += 3) {
    const high = bytes[index] as number;
    const middle = bytes[index + 1];
    const low = bytes[index + 2];

    encoded += BASE64URL_ALPHABET[high >>> 2] as string;
    encoded += BASE64URL_ALPHABET[
      ((high & 0x03) << 4) | ((middle ?? 0) >>> 4)
    ] as string;

    if (middle === undefined) {
      break;
    }

    encoded += BASE64URL_ALPHABET[
      ((middle & 0x0f) << 2) | ((low ?? 0) >>> 6)
    ] as string;

    if (low === undefined) {
      break;
    }

    encoded += BASE64URL_ALPHABET[low & 0x3f] as string;
  }

  return encoded;
}

/**
 * Mints a fresh opaque credential.
 *
 * `crypto.getRandomValues` is the platform CSPRNG in both Cloudflare
 * Workers and Node, so no cryptography dependency is introduced.
 */
export function mintCredential(): string {
  const bytes = new Uint8Array(CREDENTIAL_BYTES);

  crypto.getRandomValues(bytes);

  return encodeBase64Url(bytes);
}
