import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('./auth', () => ({ getAuthToken: async () => 'test-token' }));
const mocks = vi.hoisted(() => ({ pick: vi.fn(), size: 100, remove: vi.fn(), read: vi.fn() }));
vi.mock('expo-document-picker', () => ({ getDocumentAsync: mocks.pick }));
vi.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///cache/' } },
  File: class {
    exists = true;
    get size() { return mocks.size; }
    delete() { mocks.remove(); }
    base64() { return mocks.read(); }
  },
}));
import { deleteCachedPdf, pickPdf, readPdfBase64 } from './filePicker';
beforeEach(() => { vi.clearAllMocks(); mocks.size = 100; });
it('uses actual bytes rather than trusting picker metadata', async () => {
  mocks.pick.mockResolvedValue({ canceled: false, assets: [{ name: 'cv.pdf', uri: 'file:///cache/cv.pdf', size: 1 }] });
  mocks.size = 2000001;
  await expect(pickPdf()).rejects.toThrow('2 MB');
  expect(mocks.remove).toHaveBeenCalledOnce();
});
it('cleans up rejected non-PDF cache copies', async () => {
  mocks.pick.mockResolvedValue({ canceled: false, assets: [{ name: 'cv.txt', uri: 'file:///cache/cv.txt' }] });
  await expect(pickPdf()).rejects.toThrow('not a PDF');
  expect(mocks.remove).toHaveBeenCalledOnce();
});
it('never deletes a document outside the picker cache', () => {
  deleteCachedPdf('file:///documents/cv.pdf');
  expect(mocks.remove).not.toHaveBeenCalled();
});
it('rejects an unreadable or oversize file before base64 allocation', async () => {
  mocks.size = 0;
  await expect(readPdfBase64('file:///cache/cv.pdf')).rejects.toThrow('2 MB');
  expect(mocks.read).not.toHaveBeenCalled();
});
