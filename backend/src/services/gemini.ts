import { GoogleGenAI } from '@google/genai';

export const CV_BULLET_SYSTEM_INSTRUCTION = `
You are an executive technical recruiter at a Tier-1 tech firm.
Convert the completed milestone and candidate notes into exactly ONE high-impact resume bullet point.

RULES:
1. Format strictly as Google's XYZ formula: "Accomplished [X], as measured by [Y], by doing [Z]".
2. Begin with a strong past-tense action verb (e.g., Engineered, Architected, Spearheaded, Implemented).
3. Do not exceed 28 words. No fluff, generic buzzwords, or first-person pronouns.
4. Return a strict JSON object: { "bullet": "string" }.

FEW-SHOT EXAMPLES:

Example 1 (Systems / Quant):
Input Task: "Build an order book in C++"
Input Notes: "Implemented price-time priority, handles 50k msgs/sec with low latency."
Output:
{"bullet": "Engineered a low-latency order matching engine in modern C++ utilizing price-time priority, sustaining throughput of 50,000 orders/sec under simulated exchange conditions."}

Example 2 (Backend / Distributed):
Input Task: "Deploy a distributed cache with Raft consensus"
Input Notes: "3 nodes, tested network partitions, benchmarked against Redis."
Output:
{"bullet": "Architected a fault-tolerant key-value store in Go with Raft consensus, maintaining 99.9% read availability across simulated multi-node network partitions."}

Example 3 (Full Stack / Mobile):
Input Task: "Add real-time collaboration to markdown editor"
Input Notes: "Used WebSockets and CRDTs, tested with 20 simultaneous users."
Output:
{"bullet": "Implemented real-time conflict-free collaboration using WebSockets and CRDT algorithms, enabling seamless concurrent document editing for 20+ active participants."}
`;

const CV_BULLET_MODEL = 'gemini-2.5-flash';

export interface CvBulletInput {
  taskTitle: string;
  notes: string;
}

export interface CvBulletResult {
  bullet: string;
}

export interface GeminiGenerateContentRequest {
  model: string;
  contents: string;
  config: {
    systemInstruction: string;
    responseMimeType: 'application/json';
    responseJsonSchema: {
      type: 'object';
      properties: {
        bullet: { type: 'string' };
      };
      required: ['bullet'];
      additionalProperties: false;
    };
  };
}

interface GeminiGenerateContentResponse {
  text: string | undefined;
}

export interface GeminiContentGenerator {
  generateContent(
    request: GeminiGenerateContentRequest,
  ): Promise<GeminiGenerateContentResponse>;
}

export const createGeminiClient = (
  apiKey: string | undefined = process.env.GEMINI_API_KEY,
): GoogleGenAI => {
  if (!apiKey?.trim()) {
    throw new Error('GEMINI_API_KEY is required');
  }

  return new GoogleGenAI({ apiKey });
};

export const generateCvBullet = async (
  input: CvBulletInput,
  generator: GeminiContentGenerator = createGeminiClient().models,
): Promise<CvBulletResult> => {
  const response = await generator.generateContent({
    model: CV_BULLET_MODEL,
    contents: `Input Task: "${input.taskTitle}"\nInput Notes: "${input.notes}"`,
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

  const result = parseCvBullet(response.text);
  const wordCount = result.bullet.trim().split(/\s+/u).length;

  if (wordCount > 28) {
    throw new Error('Gemini CV bullet must not exceed 28 words');
  }

  return result;
};

const parseCvBullet = (text: string | undefined): CvBulletResult => {
  try {
    const value: unknown = JSON.parse(text ?? '');

    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      Object.keys(value).length !== 1 ||
      !('bullet' in value) ||
      typeof value.bullet !== 'string' ||
      !value.bullet.trim()
    ) {
      throw new Error('Unexpected CV bullet shape');
    }

    return { bullet: value.bullet.trim() };
  } catch {
    throw new Error('Gemini returned invalid CV bullet JSON');
  }
};
