import type { RequestContext } from './request-context.js';
import type { SessionBindingEnv } from '../auth/session.js';

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
    S3_ENDPOINT?: string;
    S3_REGION?: string;
    S3_ACCESS_KEY_ID?: string;
    S3_SECRET_ACCESS_KEY?: string;
    S3_BUCKET?: string;
  } & SessionBindingEnv;
  Variables: {
    requestContext: RequestContext;
  };
};
