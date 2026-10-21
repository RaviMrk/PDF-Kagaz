import type { PdfFileInfo } from '@/services/native/pdfNative';
import { nativeError } from '@/test-utils/fakePdfNative';
import { makeRow } from '@/test-utils/fileRows';

import { openIncomingPdf } from '../openIncomingPdf';

const INFO: PdfFileInfo = {
  uri: 'content://x/1',
  name: 'x.pdf',
  folder: '',
  parentUri: '',
  parentModifiedAt: 0,
  sizeBytes: 10,
  modifiedAt: 1,
};

function deps(resolve: () => Promise<PdfFileInfo>, register = jest.fn()) {
  return { native: { resolveIncomingPdf: jest.fn(resolve) }, register };
}

describe('openIncomingPdf', () => {
  it('registers the resolved file and returns its id', async () => {
    const register = jest.fn(() => makeRow({ name: 'x.pdf', id: 'id-x', source: 'intent' }));
    const d = deps(() => Promise.resolve(INFO), register);
    await expect(openIncomingPdf('content://x/1', d)).resolves.toEqual({ ok: true, id: 'id-x' });
    expect(d.native.resolveIncomingPdf).toHaveBeenCalledWith('content://x/1');
    expect(register).toHaveBeenCalledWith(INFO);
  });

  it('maps a refused uri to permission', async () => {
    const d = deps(() => Promise.reject(nativeError('ERR_PERMISSION_DENIED')));
    await expect(openIncomingPdf('content://x/1', d)).resolves.toEqual({
      ok: false,
      reason: 'permission',
    });
    expect(d.register).not.toHaveBeenCalled();
  });

  it('maps a missing file to notFound', async () => {
    const d = deps(() => Promise.reject(nativeError('ERR_FILE_NOT_FOUND')));
    await expect(openIncomingPdf('content://x/1', d)).resolves.toEqual({
      ok: false,
      reason: 'notFound',
    });
  });

  it('maps any other failure to unknown', async () => {
    const d = deps(() => Promise.reject(new Error('boom')));
    await expect(openIncomingPdf('content://x/1', d)).resolves.toEqual({
      ok: false,
      reason: 'unknown',
    });
  });

  it('is unknown when the row cannot be stored', async () => {
    const d = deps(
      () => Promise.resolve(INFO),
      jest.fn(() => null),
    );
    await expect(openIncomingPdf('content://x/1', d)).resolves.toEqual({
      ok: false,
      reason: 'unknown',
    });
  });
});
