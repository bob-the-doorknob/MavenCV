import { describe, expect, it } from 'vitest';

import { createGeminiClient } from './gemini.js';

describe('createGeminiClient', () => {
  it('rejects a missing API key before creating a client', () => {
    expect(() => createGeminiClient('')).toThrow('GEMINI_API_KEY is required');
  });
});
