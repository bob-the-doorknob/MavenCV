import { getAnonymousIdToken } from './anonymousAuth';

const DEFAULT_API_URL = 'http://localhost:8080';

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL).replace(/\/$/, '');

export class ApiResponseError extends Error {
  public constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiResponseError';
  }
}

export const getJson = async <TResponse>(path: `/${string}`): Promise<TResponse> => {
  const response = await fetch(`${apiUrl}${path}`);
  if (!response.ok) {
    throw new ApiResponseError(response.status, `Backend request failed (${response.status})`);
  }
  return (await response.json()) as TResponse;
};

export const postJson = async <TRequest, TResponse>(
  path: `/${string}`,
  body: TRequest,
): Promise<TResponse> => {
  const idToken = await getAnonymousIdToken();
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new ApiResponseError(response.status, `Backend request failed (${response.status})`);
  }

  return (await response.json()) as TResponse;
};
