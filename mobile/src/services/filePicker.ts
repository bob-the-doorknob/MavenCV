import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';

import { getErrorMessage, type ErrorMessage } from './errorMessages';

const MAX_FILE_SIZE_BYTES = 2_000_000;

export interface PickedFile {
  name: string;
  uri: string;
  size: number;
}

export type FilePickerErrorReason = 'not_pdf' | 'too_large';

export class FilePickerError extends Error {
  public readonly reason: FilePickerErrorReason;

  public constructor(reason: FilePickerErrorReason, message: string) {
    super(message);
    this.name = 'FilePickerError';
    this.reason = reason;
  }
}

/**
 * Opens the system file picker restricted to PDFs.
 * Returns null when the user cancels — that's not an error, handle it silently.
 * Throws FilePickerError for a non-PDF pick or a file over 2 MB.
 */
export const pickPdf = async (): Promise<PickedFile | null> => {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
  });

  if (result.canceled) {
    return null;
  }

  const [asset] = result.assets;
  if (!asset) {
    return null;
  }

  try {
    const isPdf = asset.mimeType === 'application/pdf' || asset.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) throw new FilePickerError('not_pdf', 'That file is not a PDF.');
    const size = new File(asset.uri).size;
    if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_SIZE_BYTES) {
      throw new FilePickerError('too_large', 'Choose a readable PDF up to 2 MB.');
    }
    return { name: asset.name, uri: asset.uri, size };
  } catch (error) {
    deleteCachedPdf(asset.uri);
    throw error;
  }
};

/**
 * The backend takes the PDF as base64 JSON, not multipart, so the picked file
 * is read here. expo-document-picker does the picking; expo-file-system only
 * reads the bytes.
 */
export const deleteCachedPdf = (uri: string): void => {
  // Only remove the picker-owned cache copy, never the user's original document.
  if (!uri.startsWith(`${Paths.cache.uri.replace(/\/$/u, '')}/`)) return;
  try { const file = new File(uri); if (file.exists) file.delete(); } catch { /* OS cache eviction is the fallback. */ }
};

export const readPdfBase64 = async (uri: string): Promise<string> => {
  const file = new File(uri);
  if (!file.size || file.size > MAX_FILE_SIZE_BYTES) throw new FilePickerError('too_large', 'Choose a readable PDF up to 2 MB.');
  return file.base64();
};

const FILE_PICKER_MESSAGES: Readonly<Record<FilePickerErrorReason, ErrorMessage>> = {
  not_pdf: {
    title: 'Not a PDF',
    message: 'Please choose a PDF file.',
    canRetry: true,
  },
  too_large: {
    title: 'File too large',
    message: 'That PDF is larger than 2 MB. Choose a smaller file.',
    canRetry: true,
  },
};

/**
 * Same { title, message, canRetry } shape as getErrorMessage — covers both
 * pickPdf's local validation errors and extractProfile's ApiErrors, so
 * screens render both with one code path.
 */
export const getFilePickerErrorMessage = (error: unknown): ErrorMessage =>
  error instanceof FilePickerError ? FILE_PICKER_MESSAGES[error.reason] : getErrorMessage(error);
