import type { RequestContext } from './request-context.js';
import type { SessionBindingEnv } from '../auth/session.js';
import type { PostgresConnectionValue } from '../persistence/postgres-connection.js';

export type ApiEnv = {
  Bindings: {
    APP_ENV?: string;
    DEV_OWNER_ID?: string;
    HYPERDRIVE?: PostgresConnectionValue;
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
