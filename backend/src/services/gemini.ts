import { GoogleGenAI } from '@google/genai';

export const GEMINI_MODEL = 'gemini-3.6-flash';
export class ProviderRateLimitError extends Error {}
export const isProviderRateLimit = (error: unknown): boolean => {
  if (error instanceof ProviderRateLimitError) return true;
  if (typeof error !== 'object' || error === null) return false;
  return ('status' in error && Number(error.status) === 429) || ('code' in error && Number(error.code) === 429);
};

export const createGeminiClient = (
  apiKey: string | undefined = process.env.GEMINI_API_KEY,
): GoogleGenAI => {
  if (!apiKey?.trim()) {
    throw new Error('GEMINI_API_KEY is required');
  }

  return new GoogleGenAI({ apiKey });
};

export interface GeminiJsonRequest {
  model: string;
  contents: string;
  config: {
    systemInstruction: string;
    responseMimeType: 'application/json';
    responseJsonSchema: unknown;
  };
}

interface JsonInteractionRequest {
  model: string;
  input: string;
  system_instruction: string;
  response_format: {
    type: 'text';
    mime_type: 'application/json';
    schema: unknown;
  };
  store: false;
}

type CreateJsonInteraction = (
  request: JsonInteractionRequest,
  options: {
    timeout_ms: number;
    retries: { strategy: 'attempt-count-backoff'; maxRetries: number };
    retry_codes: string[];
  },
) => Promise<{ output_text?: string | undefined }>;

export const createGeminiJsonGenerator = (
  createInteraction: CreateJsonInteraction = (request, options) => createGeminiClient().interactions.create(request, options),
): { generateContent(request: GeminiJsonRequest): Promise<{ text: string | undefined }> } => ({
  generateContent: async (request) => {
    const response = await createInteraction({
      model: request.model,
      input: request.contents,
      system_instruction: request.config.systemInstruction,
      response_format: {
        type: 'text',
        mime_type: request.config.responseMimeType,
        schema: request.config.responseJsonSchema,
      },
      store: false,
    }, {
      timeout_ms: 45_000,
      retries: { strategy: 'attempt-count-backoff', maxRetries: 0 },
      retry_codes: ['503'],
    });
    return { text: response.output_text ?? undefined };
  },
});
