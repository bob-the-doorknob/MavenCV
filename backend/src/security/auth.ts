export interface AuthenticatedUser { uid: string }

export interface FirebaseTokenVerifier {
  verifyIdToken(token: string, checkRevoked: boolean): Promise<{
    uid: string;
    email_verified?: boolean;
    firebase?: { sign_in_provider?: string };
  }>;
}

export type RequestAuthenticator = (authorization: string | undefined) => Promise<AuthenticatedUser>;

export class AuthenticationError extends Error {
  public override readonly name = 'AuthenticationError';
}

const productionVerifier = async (): Promise<FirebaseTokenVerifier> => {
  const [{ getApps, getApp, initializeApp }, { getAuth }] = await Promise.all([
    import('firebase-admin/app'), import('firebase-admin/auth'),
  ]);
  const app = getApps().length === 0 ? initializeApp() : getApp();
  return getAuth(app);
};

export const authenticateAuthorization = async (
  authorization: string | undefined,
  verifier?: FirebaseTokenVerifier,
): Promise<AuthenticatedUser> => {
  const token = /^Bearer\s+(\S+)$/iu.exec(authorization ?? '')?.[1];
  if (!token) throw new AuthenticationError('Authentication is required');
  try {
    const account = await (verifier ?? await productionVerifier()).verifyIdToken(token, true);
    if (!account.uid || account.email_verified !== true || account.firebase?.sign_in_provider === 'anonymous') {
      throw new AuthenticationError('Authentication is required');
    }
    return { uid: account.uid };
  } catch {
    throw new AuthenticationError('Authentication is required');
  }
};
