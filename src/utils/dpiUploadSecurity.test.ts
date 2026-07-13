import { describe, expect, it, vi } from 'vitest';
import {
  detectDpiMimeType,
  retryDpiUpload,
  validateDpiUploadBasics
} from './dpiUploadSecurity';

describe('dpiUploadSecurity', () => {
  it('detects real image type from file bytes', () => {
    expect(detectDpiMimeType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(detectDpiMimeType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(detectDpiMimeType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe('image/webp');
    expect(detectDpiMimeType(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull();
  });

  it('rejects empty, oversized, unsupported, and mismatched files', () => {
    expect(validateDpiUploadBasics({ size: 0, type: 'image/jpeg' }, 'image/jpeg')).toMatchObject({ valid: false });
    expect(validateDpiUploadBasics({ size: 10 * 1024 * 1024 + 1, type: 'image/jpeg' }, 'image/jpeg')).toMatchObject({ valid: false });
    expect(validateDpiUploadBasics({ size: 128, type: 'application/pdf' }, null)).toMatchObject({ valid: false });
    expect(validateDpiUploadBasics({ size: 128, type: 'image/png' }, 'image/jpeg')).toMatchObject({ valid: false });
  });

  it('retries intermittent upload failures and returns the eventual result', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValue({ error: null, path: 'dpi.jpg' });

    const result = await retryDpiUpload(operation, () => Promise.resolve());

    expect(operation).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ error: null, path: 'dpi.jpg' });
  });
});
