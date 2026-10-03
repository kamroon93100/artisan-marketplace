/**
 * Server-authoritative roles (M8 Gate A, Q7 — Choice A).
 *
 * Roles are assigned and stored server-side by the Identity module and
 * returned in `ActorContext`. A client can never assert a role: there is
 * no client role-assignment endpoint, and no request field, header, or
 * query parameter is ever read to build this list.
 *
 * `BUYER` and `ARTISAN` are the M8 minimum. `REVIEWER` and `SYSTEM` are
 * named in the auth contract but have no assignment path in this slice,
 * so they are deliberately not constructible here yet.
 */
export type Role = 'BUYER' | 'ARTISAN';

const ALLOWED_ROLES: readonly Role[] = ['BUYER', 'ARTISAN'];

export function isRole(value: string): value is Role {
  return (ALLOWED_ROLES as readonly string[]).includes(value);
}
