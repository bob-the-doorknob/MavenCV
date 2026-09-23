import { describe, expect, it, vi } from 'vitest';

import { generateCvProfile, normalizeCvProfileInput, CvProfileValidationError, CvProfileGenerationError } from './cvProfile.js';

const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n%%EOF').toString('base64');
const input = { pdfBase64: pdf, targetRoleId: 'quant' };

describe('CV profile input', () => {
  it('accepts a small PDF and decodes its bytes', () => {
    expect(normalizeCvProfileInput(input).pdf.equals(Buffer.from(pdf, 'base64'))).toBe(true);
  });

  it.each([
    [{ ...input, pdfBase64: 'not base64!' }, 'CV must be a valid base64 PDF'],
    [{ ...input, pdfBase64: Buffer.from('plain text').toString('base64') }, 'CV must be a PDF'],
    [{ ...input, pdfBase64: Buffer.alloc(2_000_001, 1).toString('base64') }, 'CV PDF must not exceed 2 MB'],
    [{ ...input, targetRoleId: 'unknown' }, 'Unknown target role'],
    [{ targetRoleId: 'quant' }, 'CV must be a valid base64 PDF'],
  ])('rejects invalid CV input %#', (value, message) => {
    expect(() => normalizeCvProfileInput(value)).toThrow(new CvProfileValidationError(message));
  });
});

describe('CV extraction', () => {
  it('sends the PDF as a document, asks for evidence only, and returns reviewable experience', async () => {
    const create = vi.fn().mockResolvedValue({ output_text: JSON.stringify({
      experience: 'Built a Python backtest for a coursework project.',
      questions: ['Have you studied probability or statistics?'],
    }) });
    const result = await generateCvProfile(normalizeCvProfileInput(input), create);
    expect(result.experience).toContain('Python backtest');
    expect(result.questions).toHaveLength(1);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      store: false,
      input: expect.arrayContaining([expect.objectContaining({ type: 'document', mime_type: 'application/pdf', data: pdf })]),
      system_instruction: expect.stringContaining('Do not infer skill levels'),
    }), expect.any(Object));
    expect(JSON.stringify(create.mock.calls[0]?.[0].input)).toContain('Quant / Trading');
  });

  it('rejects malformed model output without exposing it', async () => {
    await expect(generateCvProfile(normalizeCvProfileInput(input), async () => ({ output_text: '{' })))
      .rejects.toBeInstanceOf(CvProfileGenerationError);
  });

  it('normalizes multiline CV summaries for the roadmap input', async () => {
    const result = await generateCvProfile(normalizeCvProfileInput(input), async () => ({
      output_text: JSON.stringify({ experience: 'Built a Python project.\nStudied statistics.', questions: [] }),
    }));
    expect(result.experience).toBe('Built a Python project. Studied statistics.');
  });
});
