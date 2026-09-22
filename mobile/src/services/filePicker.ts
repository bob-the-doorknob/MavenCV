import * as DocumentPicker from 'expo-document-picker';

import { getErrorMessage, type ErrorMessage } from './errorMessages';

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

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

  const isPdf = asset.mimeType === 'application/pdf' || asset.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    throw new FilePickerError('not_pdf', 'That file is not a PDF.');
  }

  const size = asset.size ?? 0;
  if (size > MAX_FILE_SIZE_BYTES) {
    throw new FilePickerError('too_large', 'That PDF is larger than 2 MB.');
  }

  return { name: asset.name, uri: asset.uri, size };
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
