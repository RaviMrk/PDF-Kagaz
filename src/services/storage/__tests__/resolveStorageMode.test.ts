import { resolveStorageMode } from '../resolveStorageMode';

describe('resolveStorageMode', () => {
  it('full access wins', async () => {
    await expect(
      resolveStorageMode({
        hasAllFilesAccess: async () => true,
        grantedRootCount: async () => 3,
      }),
    ).resolves.toBe('full');
  });

  it('falls back to saf with a granted root', async () => {
    await expect(
      resolveStorageMode({
        hasAllFilesAccess: async () => false,
        grantedRootCount: async () => 1,
      }),
    ).resolves.toBe('saf');
  });

  it('is none with neither', async () => {
    await expect(
      resolveStorageMode({
        hasAllFilesAccess: async () => false,
        grantedRootCount: async () => 0,
      }),
    ).resolves.toBe('none');
  });

  it('treats a rejecting hasAllFilesAccess as false', async () => {
    await expect(
      resolveStorageMode({
        hasAllFilesAccess: () => Promise.reject(new Error('x')),
        grantedRootCount: async () => 1,
      }),
    ).resolves.toBe('saf');
  });
});
