import { nativeError } from '../../../test-utils/fakePdfNative';
import type { PdfNativeErrorCode } from '../../native/pdfNative';
import { closeReader, openReaderFile } from '../prepareReader';

const cases: [PdfNativeErrorCode, string][] = [
  ['ERR_FILE_NOT_FOUND', 'notFound'],
  ['ERR_VOLUME_UNAVAILABLE', 'unavailable'],
  ['ERR_PERMISSION_DENIED', 'permission'],
  ['ERR_PDF_INVALID', 'invalid'],
  ['ERR_IO', 'io'],
  ['ERR_NO_ACTIVITY', 'unknown'],
];

describe('openReaderFile', () => {
  it.each(cases)('maps %s to %s', async (code, reason) => {
    const native = { prepareReaderFile: jest.fn().mockRejectedValue(nativeError(code)) };
    await expect(openReaderFile('content://x', native)).resolves.toEqual({ ok: false, reason });
  });

  it('maps a non-native error to unknown', async () => {
    const native = { prepareReaderFile: jest.fn().mockRejectedValue(new Error('x')) };
    await expect(openReaderFile('u', native)).resolves.toEqual({ ok: false, reason: 'unknown' });
  });

  it('returns the prepared uri', async () => {
    const native = {
      prepareReaderFile: jest
        .fn()
        .mockResolvedValue({ uri: 'file:///c', copied: true, sizeBytes: 1 }),
    };
    await expect(openReaderFile('content://x', native)).resolves.toEqual({
      ok: true,
      fileUri: 'file:///c',
    });
  });
});

describe('closeReader', () => {
  it('ignores rejections and sync throws', async () => {
    expect(() =>
      closeReader({ releaseReaderDocument: jest.fn().mockRejectedValue(new Error('x')) }),
    ).not.toThrow();
    expect(() =>
      closeReader({
        releaseReaderDocument: jest.fn(() => {
          throw new Error('x');
        }),
      }),
    ).not.toThrow();
    await Promise.resolve();
  });
});
