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

export const postJson = async <TRequest, TResponse>(
  path: `/${string}`,
  body: TRequest,
): Promise<TResponse> => {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new ApiResponseError(response.status, `Backend request failed (${response.status})`);
  }

  return (await response.json()) as TResponse;
};
