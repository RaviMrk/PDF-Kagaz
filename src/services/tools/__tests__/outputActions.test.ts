import { nativeError } from '@/test-utils/fakePdfNative';
import { makeRow } from '@/test-utils/fileRows';

import { saveOutputCopy } from '../outputActions';

const row = makeRow({ name: 'a merged.pdf' });

describe('saveOutputCopy', () => {
  it('reports saved when the copy was written', async () => {
    const saveCopyAs = jest.fn().mockResolvedValue(true);
    await expect(saveOutputCopy(row, { saveCopyAs })).resolves.toBe('saved');
    expect(saveCopyAs).toHaveBeenCalledWith(row.uri, 'a merged.pdf');
  });

  it('reports cancelled when the picker was dismissed', async () => {
    const saveCopyAs = jest.fn().mockResolvedValue(false);
    await expect(saveOutputCopy(row, { saveCopyAs })).resolves.toBe('cancelled');
  });

  it.each([
    ['ERR_FILE_NOT_FOUND', 'notFound'],
    ['ERR_PERMISSION_DENIED', 'permission'],
    ['ERR_FILE_EXISTS', 'exists'],
  ] as const)('maps %s to %s', async (code, expected) => {
    const saveCopyAs = jest.fn().mockRejectedValue(nativeError(code));
    await expect(saveOutputCopy(row, { saveCopyAs })).resolves.toBe(expected);
  });

  it('maps an unexpected error to unknown', async () => {
    const saveCopyAs = jest.fn().mockRejectedValue(new Error('boom'));
    await expect(saveOutputCopy(row, { saveCopyAs })).resolves.toBe('unknown');
  });
});
