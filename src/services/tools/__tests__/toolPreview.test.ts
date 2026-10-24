/** @jest-environment node */
import { createFakePdfNative, nativeError } from '@/test-utils/fakePdfNative';
import { makeRow } from '@/test-utils/fileRows';

import { openToolPreview } from '../toolPreview';

const row = makeRow({ name: 'a.pdf' });

describe('openToolPreview', () => {
  it('stages the file and reports its page count', async () => {
    const native = createFakePdfNative();
    native.getToolPageCount.mockResolvedValue(7);
    const result = await openToolPreview(row, {}, { native });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.pageCount).toBe(7);
    expect(result.preview.fileUri).toBe('file:///data/cache/tools/preview-id-a.pdf/in-0.pdf');
    expect(native.createToolWorkspace).toHaveBeenCalledWith('preview-id-a.pdf');
    expect(native.stageToolInput).toHaveBeenCalledWith(row.uri, 'preview-id-a.pdf', 0, 536_870_912);
  });

  it('stages under the cap it is given', async () => {
    const native = createFakePdfNative();
    const small = makeRow({ name: 's.pdf', sizeBytes: 1000 });
    await openToolPreview(small, { maxBytes: 1000 }, { native });
    expect(native.stageToolInput).toHaveBeenCalledWith(small.uri, 'preview-id-s.pdf', 0, 1000);
    const big = makeRow({ name: 'b.pdf', sizeBytes: 1001 });
    expect(await openToolPreview(big, { maxBytes: 1000 }, { native })).toEqual({
      ok: false,
      failure: 'tooLarge',
    });
  });

  it('maps an encrypted file and cleans the workspace', async () => {
    const native = createFakePdfNative();
    native.getToolPageCount.mockRejectedValue(nativeError('ERR_PDF_ENCRYPTED'));
    expect(await openToolPreview(row, {}, { native })).toEqual({ ok: false, failure: 'encrypted' });
    expect(native.cleanToolWorkspace).toHaveBeenCalledWith('preview-id-a.pdf');
  });

  it('maps an invalid file', async () => {
    const native = createFakePdfNative();
    native.getToolPageCount.mockRejectedValue(nativeError('ERR_PDF_INVALID'));
    expect(await openToolPreview(row, {}, { native })).toEqual({ ok: false, failure: 'invalid' });
  });

  it('refuses a stored size over the cap without native calls', async () => {
    const native = createFakePdfNative();
    const big = makeRow({ name: 'b.pdf', sizeBytes: 536_870_913 });
    expect(await openToolPreview(big, {}, { native })).toEqual({ ok: false, failure: 'tooLarge' });
    expect(native.createToolWorkspace).not.toHaveBeenCalled();
  });

  it('maps the native stage cap to tooLarge', async () => {
    const native = createFakePdfNative();
    native.stageToolInput.mockRejectedValue(nativeError('ERR_TOO_LARGE'));
    const unknown = makeRow({ name: 'c.pdf', sizeBytes: Number.NaN });
    expect(await openToolPreview(unknown, {}, { native })).toEqual({
      ok: false,
      failure: 'tooLarge',
    });
    expect(native.cleanToolWorkspace).toHaveBeenCalledWith('preview-id-c.pdf');
  });

  it('close() releases and cleans once, never throwing', async () => {
    const native = createFakePdfNative();
    native.releaseToolDocument.mockRejectedValue(new Error('x'));
    const result = await openToolPreview(row, {}, { native });
    if (!result.ok) throw new Error('expected ok');
    result.preview.close();
    result.preview.close();
    await Promise.resolve();
    expect(native.releaseToolDocument).toHaveBeenCalledTimes(1);
    expect(native.cleanToolWorkspace).toHaveBeenCalledTimes(1);
    expect(native.cleanToolWorkspace).toHaveBeenCalledWith('preview-id-a.pdf');
  });
});
