/**
 * Identity module public interface.
 *
 * Everything session/credential specific that other code may touch lives
 * behind this file: business modules keep calling `requireActor`, which
 * delegates here, and no business module parses credentials or session
 * details (ADR-006).
 */
export { IdentityService } from './application/identity-service.js';
export type {
  Clock,
  EstablishSessionInput,
} from './application/identity-service.js';
export type { SessionStore } from './application/session-store.js';
export { InMemorySessionStore } from './infrastructure/in-memory-session-store.js';
export { PostgresSessionStore, createCredentialHasherSync } from './infrastructure/postgres-session-store.js';
export {
  allowsInMemorySessionStore,
  getIdentityService,
  createIdentityService,
  hasSessionStoreConfigured,
} from './composition.js';
export type { IdentityEnv } from './composition.js';
export {
  ACCESS_TOKEN_LIFETIME_MS,
  REFRESH_TOKEN_LIFETIME_MS,
} from './domain/session.js';
export type {
  IssuedSession,
  LogoutOutcome,
  RefreshOutcome,
  RefreshRejectionReason,
  SessionRejectionReason,
  SessionRecord,
  SessionVerification,
} from './domain/session.js';
export type { Role } from './domain/roles.js';
export { authRoutes } from './http.js';
