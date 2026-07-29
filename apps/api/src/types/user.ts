/**
 * Domain types for authentication.
 *
 * This is a local implementation so the app has a working login before a
 * Supabase project exists. It deliberately mirrors what Supabase Auth
 * returns (a user with an id and email, plus a session carrying a token),
 * so swapping to Supabase later is a change of implementation rather than
 * a change of shape.
 */

/** What a user supplies when registering or signing in. */
export interface Credentials {
  email: string;
  password: string;
}

/** A user as the API returns it. Never includes the password or its hash. */
export interface PublicUser {
  id: string;
  email: string;
  createdAt: string;
}

/**
 * The stored record. `passwordHash` and `salt` never leave the server —
 * routes return PublicUser instead.
 */
export interface StoredUser extends PublicUser {
  passwordHash: string;
  salt: string;
}

/** What a successful register/login returns: the user plus a session token. */
export interface AuthSession {
  user: PublicUser;
  /** Bearer token the client sends on subsequent requests. */
  token: string;
}
