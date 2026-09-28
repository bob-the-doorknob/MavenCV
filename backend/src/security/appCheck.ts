export class AppCheckError extends Error {
  constructor() { super('App verification is required.'); this.name = 'AppCheckError'; }
}

export type AppCheckVerifier = (header: string | string[] | undefined) => Promise<void>;
type TokenVerifier = (token: string) => Promise<{ appId: string }>;

const verifyToken: TokenVerifier = async (token) => {
  const { getApps, getApp, initializeApp } = await import('firebase-admin/app');
  const { getAppCheck } = await import('firebase-admin/app-check');
  return getAppCheck(getApps().length ? getApp() : initializeApp()).verifyToken(token);
};

/** Always fail closed, including missing configuration. No development bypass. */
export const createAppCheckVerifier = (
  verify: TokenVerifier = verifyToken,
  allowedApps: () => string[] = () => (process.env.FIREBASE_APP_CHECK_APP_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean),
): AppCheckVerifier => async (header) => {
  if (typeof header !== 'string' || !header || header.length > 8192 || /[\s,]/u.test(header)) throw new AppCheckError();
  try {
    const apps = allowedApps();
    if (!apps.length) throw new AppCheckError();
    const claims = await verify(header);
    if (!apps.includes(claims.appId)) throw new AppCheckError();
  } catch { throw new AppCheckError(); }
};

export const verifyAppCheck = createAppCheckVerifier();
