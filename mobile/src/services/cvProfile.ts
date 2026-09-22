import { File } from 'expo-file-system';

import { postJson } from './api';

const MAX_PDF_BYTES = 2_000_000;

export interface CvProfile { experience: string; questions: string[] }

export class CvFileError extends Error {
  public override readonly name = 'CvFileError';
}

export const pickAndExtractCv = async (targetRoleId: string): Promise<CvProfile | null> => {
  const picked = await File.pickFileAsync({ mimeTypes: ['application/pdf'] });
  if (picked.canceled) return null;
  const file = picked.result;
  if (file.size > MAX_PDF_BYTES) throw new CvFileError('Choose a PDF smaller than 2 MB.');
  const pdfBase64 = await file.base64();
  return postJson('/api/cv-profile', { pdfBase64, targetRoleId });
};
