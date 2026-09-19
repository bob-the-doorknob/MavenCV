import { describe, expect, it } from 'vitest';

import {
  CV_BULLET_SYSTEM_INSTRUCTION,
  createGeminiClient,
  generateCvBullet,
  type GeminiContentGenerator,
  type GeminiGenerateContentRequest,
} from './gemini.js';

describe('createGeminiClient', () => {
  it('rejects a missing API key before creating a client', () => {
    expect(() => createGeminiClient('')).toThrow('GEMINI_API_KEY is required');
  });
});

describe('generateCvBullet', () => {
  it('generates one structured CV bullet from the task and notes', async () => {
    let receivedRequest: GeminiGenerateContentRequest | undefined;
    const generator: GeminiContentGenerator = {
      generateContent: async (request) => {
        receivedRequest = request;
        return {
          text: JSON.stringify({
            bullet:
              'Engineered a low-latency order engine, processing 50,000 messages per second by implementing price-time priority in modern C++.',
          }),
        };
      },
    };

    const result = await generateCvBullet(
      {
        taskTitle: 'Build an order book in C++',
        notes: 'Implemented price-time priority and handled 50k messages per second.',
      },
      generator,
    );

    expect(result).toEqual({
      bullet:
        'Engineered a low-latency order engine, processing 50,000 messages per second by implementing price-time priority in modern C++.',
    });
    expect(receivedRequest).toEqual({
      model: 'gemini-2.5-flash',
      contents:
        'Input Task: "Build an order book in C++"\nInput Notes: "Implemented price-time priority and handled 50k messages per second."',
      config: {
        systemInstruction: CV_BULLET_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseJsonSchema: {
          type: 'object',
          properties: {
            bullet: { type: 'string' },
          },
          required: ['bullet'],
          additionalProperties: false,
        },
      },
    });
  });

  it('rejects malformed JSON returned by Gemini', async () => {
    const generator = createGenerator('not-json');

    await expect(
      generateCvBullet({ taskTitle: 'Build an API', notes: 'Used Node.js' }, generator),
    ).rejects.toThrow('Gemini returned invalid CV bullet JSON');
  });

  it('rejects output containing fields other than bullet', async () => {
    const generator = createGenerator(
      JSON.stringify({ bullet: 'Implemented an API.', explanation: 'Extra output' }),
    );

    await expect(
      generateCvBullet({ taskTitle: 'Build an API', notes: 'Used Node.js' }, generator),
    ).rejects.toThrow('Gemini returned invalid CV bullet JSON');
  });

  it('rejects a bullet longer than 28 words', async () => {
    const generator = createGenerator(
      JSON.stringify({
        bullet:
          'Engineered one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two twenty-three twenty-four twenty-five twenty-six twenty-seven twenty-eight.',
      }),
    );

    await expect(
      generateCvBullet({ taskTitle: 'Build an API', notes: 'Used Node.js' }, generator),
    ).rejects.toThrow('Gemini CV bullet must not exceed 28 words');
  });
});

const createGenerator = (text: string): GeminiContentGenerator => ({
  generateContent: async () => ({ text }),
});
