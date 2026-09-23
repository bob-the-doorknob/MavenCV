import { describe, expect, it, vi } from 'vitest';

import { createGeminiClient, createGeminiJsonGenerator } from './gemini.js';

describe('createGeminiClient', () => {
  it('rejects a missing API key before creating a client', () => {
    expect(() => createGeminiClient('')).toThrow('GEMINI_API_KEY is required');
  });
});

describe('createGeminiJsonGenerator', () => {
  it('sends a stateless structured interaction with bounded retries and returns its text', async () => {
    const createInteraction = vi.fn().mockResolvedValue({ output_text: '{"word":"OK"}' });
    const generator = createGeminiJsonGenerator(createInteraction);
    const schema = { type: 'object', properties: { word: { type: 'string' } } };

    await expect(generator.generateContent({
      model: 'gemini-3.6-flash',
      contents: 'Return OK.',
      config: {
        systemInstruction: 'Return JSON.',
        responseMimeType: 'application/json',
        responseJsonSchema: schema,
      },
    })).resolves.toEqual({ text: '{"word":"OK"}' });

    expect(createInteraction).toHaveBeenCalledWith({
      model: 'gemini-3.6-flash',
      input: 'Return OK.',
      system_instruction: 'Return JSON.',
      response_format: { type: 'text', mime_type: 'application/json', schema },
      store: false,
    }, {
      timeout_ms: 45_000,
      retries: expect.objectContaining({ strategy: 'attempt-count-backoff', maxRetries: 0 }),
      retry_codes: ['503'],
    });
  });
});
