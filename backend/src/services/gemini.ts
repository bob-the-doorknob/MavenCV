import { GoogleGenAI } from '@google/genai';

export const createGeminiClient = (
  apiKey: string | undefined = process.env.GEMINI_API_KEY,
): GoogleGenAI => {
  if (!apiKey?.trim()) {
    throw new Error('GEMINI_API_KEY is required');
  }

  return new GoogleGenAI({ apiKey });
};
