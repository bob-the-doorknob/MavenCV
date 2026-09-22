import { beforeEach, describe, expect, it, vi } from 'vitest';

const { pickFileAsync } = vi.hoisted(() => ({ pickFileAsync: vi.fn() }));
vi.mock('expo-file-system', () => ({ File: { pickFileAsync } }));
vi.mock('./api', () => ({ postJson: vi.fn().mockResolvedValue({ experience: 'Built a Python project.', questions: [] }) }));

import { postJson } from './api';
import { pickAndExtractCv, CvFileError } from './cvProfile';

describe('CV intake', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns null when the picker is canceled', async () => {
    pickFileAsync.mockResolvedValueOnce({ canceled: true, result: null });
    await expect(pickAndExtractCv('quant')).resolves.toBeNull();
    expect(postJson).not.toHaveBeenCalled();
  });

  it('uploads a selected PDF for extraction', async () => {
    pickFileAsync.mockResolvedValueOnce({ canceled: false, result: { size: 100, base64: async () => 'pdf-base64' } });
    await expect(pickAndExtractCv('quant')).resolves.toEqual({ experience: 'Built a Python project.', questions: [] });
    expect(pickFileAsync).toHaveBeenCalledWith({ mimeTypes: ['application/pdf'] });
    expect(postJson).toHaveBeenCalledWith('/api/cv-profile', { pdfBase64: 'pdf-base64', targetRoleId: 'quant' });
  });

  it('rejects oversized files before sending them', async () => {
    pickFileAsync.mockResolvedValueOnce({ canceled: false, result: { size: 2_000_001, base64: vi.fn() } });
    await expect(pickAndExtractCv('quant')).rejects.toBeInstanceOf(CvFileError);
    expect(postJson).not.toHaveBeenCalled();
  });
});
