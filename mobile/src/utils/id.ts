/** Timestamp + random suffix. Not cryptographically unique; fine for local-only records. */
export const createId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
