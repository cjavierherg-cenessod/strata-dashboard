import { describe, expect, it } from 'vitest';
import { isInviteExpired, validateUploadRequest } from './create-growth-member-dpi-upload';

describe('create-growth-member-dpi-upload guards', () => {
  it('rejects missing, unsupported, empty, and oversized upload requests', () => {
    expect(validateUploadRequest({ contentType: 'image/jpeg', fileSize: 12 })).toMatchObject({ valid: false, status: 400 });
    expect(validateUploadRequest({ token: 'tok', contentType: 'application/pdf', fileSize: 12 })).toMatchObject({ valid: false, status: 400 });
    expect(validateUploadRequest({ token: 'tok', contentType: 'image/jpeg', fileSize: 0 })).toMatchObject({ valid: false, status: 400 });
    expect(validateUploadRequest({ token: 'tok', contentType: 'image/jpeg', fileSize: 10 * 1024 * 1024 + 1 })).toMatchObject({ valid: false, status: 413 });
  });

  it('accepts valid declared DPI image metadata', () => {
    expect(validateUploadRequest({ token: 'tok', contentType: 'image/webp', fileSize: 4096 })).toMatchObject({
      valid: true,
      inviteToken: 'tok',
      contentType: 'image/webp'
    });
  });

  it('detects expired invitations at the boundary', () => {
    const now = new Date('2026-06-02T18:00:00.000Z').getTime();

    expect(isInviteExpired('2026-06-02T17:59:59.999Z', now)).toBe(true);
    expect(isInviteExpired('2026-06-02T18:00:00.000Z', now)).toBe(true);
    expect(isInviteExpired('2026-06-02T18:00:00.001Z', now)).toBe(false);
  });
});
