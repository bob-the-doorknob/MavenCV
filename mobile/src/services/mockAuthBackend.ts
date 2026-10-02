import { IdentityError, type AuthBackend, type IdpSession } from './identityTypes';

/**
 * An in-memory Firebase Auth for mock mode and tests. It models exactly the
 * behaviour the account flow depends on:
 * - anonymous users created on demand, one per "install";
 * - linking Google to the current user keeps its UID;
 * - a Google account can belong to one user only
 *   (FEDERATED_USER_ID_ALREADY_LINKED for any other);
 * - deleting a user revokes every token it ever had.
 *
 * Google ID tokens are `mock-google:<sub>:<email>`, as the mock credential
 * provider issues them.
 */

interface MockUser {
  uid: string;
  googleSub?: string;
  email?: string;
  deleted: boolean;
}

export const mockGoogleIdToken = (sub: string, email: string): string => `mock-google:${sub}:${email}`;

const parseGoogleToken = (token: string): { sub: string; email: string } => {
  const [scheme, sub, email] = token.split(':');
  if (scheme !== 'mock-google' || !sub || !email) throw new IdentityError('INVALID_IDP_RESPONSE');
  return { sub, email };
};

export class MockAuthBackend implements AuthBackend {
  private readonly users = new Map<string, MockUser>();
  private readonly tokens = new Map<string, string>();
  private current: IdpSession | null = null;
  private counter = 0;

  private issue(user: MockUser): IdpSession {
    this.counter += 1;
    const idToken = `mock-id:${user.uid}:${this.counter}`;
    this.tokens.set(idToken, user.uid);
    return {
      uid: user.uid,
      idToken,
      refreshToken: `mock-refresh:${user.uid}:${this.counter}`,
      expiresAt: Date.now() + 3_600_000,
      ...(user.email ? { email: user.email } : {}),
    };
  }

  private liveUser(uid: string): MockUser {
    const user = this.users.get(uid);
    if (!user || user.deleted) throw new IdentityError('USER_DISABLED');
    return user;
  }

  public async currentIdToken(): Promise<string> {
    if (this.current && !this.users.get(this.current.uid)?.deleted) return this.current.idToken;
    this.counter += 1;
    const user: MockUser = { uid: `anon-${this.counter}`, deleted: false };
    this.users.set(user.uid, user);
    this.current = this.issue(user);
    return this.current.idToken;
  }

  public async signInWithGoogle(googleIdToken: string, linkToIdToken?: string): Promise<IdpSession> {
    const { sub, email } = parseGoogleToken(googleIdToken);
    const owner = [...this.users.values()].find((user) => user.googleSub === sub && !user.deleted);

    if (linkToIdToken) {
      const uid = this.uidForToken(linkToIdToken);
      if (!uid) throw new IdentityError('UNKNOWN', 'INVALID_ID_TOKEN');
      if (owner && owner.uid !== uid) throw new IdentityError('FEDERATED_USER_ID_ALREADY_LINKED');
      const user = this.liveUser(uid);
      user.googleSub = sub;
      user.email = email;
      return this.issue(user);
    }

    if (owner) return this.issue(owner);
    this.counter += 1;
    const created: MockUser = { uid: `google-${this.counter}`, googleSub: sub, email, deleted: false };
    this.users.set(created.uid, created);
    return this.issue(created);
  }

  public async adoptSession(session: IdpSession): Promise<void> {
    this.current = session;
  }

  public async clearSession(): Promise<void> {
    this.current = null;
  }

  /** Which user a token belongs to, or null if unknown or revoked. */
  public uidForToken(idToken: string): string | null {
    const uid = this.tokens.get(idToken);
    if (!uid || this.users.get(uid)?.deleted) return null;
    return uid;
  }

  public currentUid(): string | null {
    return this.current ? this.uidForToken(this.current.idToken) : null;
  }

  /** Server-side account deletion: every token of this user stops working. */
  public deleteUser(uid: string): void {
    const user = this.users.get(uid);
    if (user) user.deleted = true;
  }

  public isDeleted(uid: string): boolean {
    return this.users.get(uid)?.deleted ?? false;
  }

  public reset(): void {
    this.users.clear();
    this.tokens.clear();
    this.current = null;
    this.counter = 0;
  }
}

/** The instance mock mode uses. Memory only, like the mock sync server. */
export const mockAuthBackend = new MockAuthBackend();
