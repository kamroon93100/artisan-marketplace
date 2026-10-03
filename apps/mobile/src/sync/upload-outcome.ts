/**
 * Upload outcome classification.
 *
 * The native file upload resolves for any completed HTTP response,
 * including non-2xx. Deciding what a status code means is therefore a
 * correctness and security decision, not a detail: a refused write that
 * is mistaken for success would mark media as uploaded when nothing was
 * ever stored, and an error message that embeds the presigned URL would
 * leak a temporary credential into logs.
 *
 * This module is deliberately free of native imports so it can be
 * verified without a device.
 */
export type UploadOutcome =
  | { ok: true }
  | {
      ok: false;
      code: string;
      message: string;
      retryable: boolean;
    };

export function classifyUploadOutcome(
  status: number,
): UploadOutcome {
  if (status >= 200 && status < 300) {
    return { ok: true };
  }

  // A refused authorization means the short-lived URL is no longer
  // usable. It is recoverable, because the next attempt obtains a fresh
  // authorization before writing bytes again.
  if (status === 401 || status === 403) {
    return {
      ok: false,
      code: 'UPLOAD_AUTHORIZATION_REJECTED',
      message:
        'The upload authorization was rejected or has expired. A new authorization is required.',
      retryable: true,
    };
  }

  const transient =
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500;

  return {
    ok: false,
    code: 'UPLOAD_REJECTED',
    message: `Object storage refused the media upload with HTTP ${status}.`,
    retryable: transient,
  };
}
