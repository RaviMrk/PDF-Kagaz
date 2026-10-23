import type { ImportedImage } from '@/services/native/pdfNative';
import { nativeError } from '@/test-utils/fakePdfNative';

import {
  addPickedImages,
  addScannedPages,
  discardImageSession,
  imageThumbnail,
  newImageSessionId,
  openImageSession,
  type ImageSessionDeps,
} from '../imageSession';

const imported = (index: number): ImportedImage => ({
  index,
  width: 400,
  height: 300,
  sizeBytes: 1000,
});

function fakes() {
  const native = {
    createToolWorkspace: jest.fn((id: string) => Promise.resolve(`file:///cache/tools/${id}`)),
    pickImages: jest.fn((_max: number) => Promise.resolve<string[]>([])),
    importImage: jest.fn((_uri: string, _session: string, index: number, _max: number) =>
      Promise.resolve(imported(index)),
    ),
    scanDocument: jest.fn((_session: string, _first: number, _limit: number) =>
      Promise.resolve<ImportedImage[]>([]),
    ),
    renderImageThumbnail: jest.fn(() => Promise.resolve('file:///cache/thumb.jpg')),
    cleanToolWorkspace: jest.fn((_id: string) => Promise.resolve()),
  };
  const deps: ImageSessionDeps = { native };
  return { native, deps };
}

const uris = (n: number) => Array.from({ length: n }, (_, i) => `content://picker/${i}`);

describe('imageSession', () => {
  it('makes session ids the native workspace accepts', () => {
    const id = newImageSessionId(1_700_000_000_000, () => 0.5);
    expect(id).toMatch(/^img-[a-z0-9-]{1,60}$/);
    expect(id.startsWith('img-')).toBe(true);
  });

  it('opens a session workspace, false on error', async () => {
    const { native, deps } = fakes();
    await expect(openImageSession('img-a', deps)).resolves.toBe(true);
    expect(native.createToolWorkspace).toHaveBeenCalledWith('img-a');
    native.createToolWorkspace.mockRejectedValueOnce(nativeError('ERR_IO'));
    await expect(openImageSession('img-a', deps)).resolves.toBe(false);
  });

  it('asks the picker for the remaining capacity only', async () => {
    const { native, deps } = fakes();
    await addPickedImages('img-a', 97, 97, deps);
    expect(native.pickImages).toHaveBeenCalledWith(3);
  });

  it('imports picks in order at consecutive indices and keys them', async () => {
    const { native, deps } = fakes();
    native.pickImages.mockResolvedValueOnce(uris(2));
    const result = await addPickedImages('img-a', 4, 4, deps);
    expect(native.importImage.mock.calls).toEqual([
      ['content://picker/0', 'img-a', 4, 52_428_800],
      ['content://picker/1', 'img-a', 5, 52_428_800],
    ]);
    expect(result).toEqual({
      items: [
        { ...imported(4), key: 'i4' },
        { ...imported(5), key: 'i5' },
      ],
      failed: 0,
      limited: false,
    });
  });

  it('drops picks over the limit and says so', async () => {
    const { native, deps } = fakes();
    native.pickImages.mockResolvedValueOnce(uris(5));
    const result = await addPickedImages('img-a', 97, 97, deps);
    expect(native.importImage.mock.calls.map((c) => [c[0], c[2]])).toEqual([
      ['content://picker/0', 97],
      ['content://picker/1', 98],
      ['content://picker/2', 99],
    ]);
    expect(result.limited).toBe(true);
    expect(result.items.map((i) => i.index)).toEqual([97, 98, 99]);
  });

  it('counts an image that cannot be imported and keeps the others', async () => {
    const { native, deps } = fakes();
    native.pickImages.mockResolvedValueOnce(uris(3));
    native.importImage
      .mockImplementationOnce((_u, _s, i) => Promise.resolve(imported(i)))
      .mockRejectedValueOnce(nativeError('ERR_IMAGE_INVALID'));
    const result = await addPickedImages('img-a', 97, 97, deps);
    expect(result.items).toHaveLength(2);
    expect(result.items.map((i) => i.index)).toEqual([97, 99]);
    expect(result.failed).toBe(1);
  });

  it('sizes the picker by the count and numbers imports from the next free index', async () => {
    const { native, deps } = fakes();
    native.pickImages.mockResolvedValueOnce(uris(2));
    const result = await addPickedImages('img-a', 3, 2, deps);
    expect(native.pickImages).toHaveBeenCalledWith(98);
    expect(result.items.map((i) => i.index)).toEqual([3, 4]);
  });

  it('can add into freed capacity after failed imports', async () => {
    const { native, deps } = fakes();
    native.pickImages.mockResolvedValueOnce(uris(5));
    const result = await addPickedImages('img-a', 100, 95, deps);
    expect(native.pickImages).toHaveBeenCalledWith(5);
    expect(result.items).toHaveLength(5);
    expect(result.limited).toBe(false);
  });

  it('never opens the picker when the session is full', async () => {
    const { native, deps } = fakes();
    expect(await addPickedImages('img-a', 100, 100, deps)).toEqual({
      items: [],
      failed: 0,
      limited: true,
    });
    expect(native.pickImages).not.toHaveBeenCalled();
  });

  it('treats a failing picker as nothing picked', async () => {
    const { native, deps } = fakes();
    native.pickImages.mockRejectedValueOnce(nativeError('ERR_PERMISSION_DENIED'));
    expect(await addPickedImages('img-a', 0, 0, deps)).toEqual({
      items: [],
      failed: 0,
      limited: false,
    });
  });

  it('scans into the session up to the remaining capacity', async () => {
    const { native, deps } = fakes();
    native.scanDocument.mockResolvedValueOnce([imported(7), imported(8)]);
    expect(await addScannedPages('img-a', 7, 90, deps)).toEqual({
      ok: true,
      items: [
        { ...imported(7), key: 'i7' },
        { ...imported(8), key: 'i8' },
      ],
    });
    expect(native.scanDocument).toHaveBeenCalledWith('img-a', 7, 10);
  });

  it('a cancelled scan adds nothing', async () => {
    const { deps } = fakes();
    expect(await addScannedPages('img-a', 0, 0, deps)).toEqual({ ok: true, items: [] });
  });

  it('maps scanner failures', async () => {
    const { native, deps } = fakes();
    native.scanDocument.mockRejectedValueOnce(nativeError('ERR_SCANNER_UNAVAILABLE'));
    expect(await addScannedPages('img-a', 0, 0, deps)).toEqual({
      ok: false,
      reason: 'unavailable',
    });
    for (const code of ['ERR_NO_ACTIVITY', 'ERR_IMAGE_INVALID', 'ERR_IO'] as const) {
      native.scanDocument.mockRejectedValueOnce(nativeError(code));
      expect(await addScannedPages('img-a', 0, 0, deps)).toEqual({ ok: false, reason: 'failed' });
    }
    native.scanDocument.mockRejectedValueOnce(new Error('boom'));
    expect(await addScannedPages('img-a', 0, 0, deps)).toEqual({ ok: false, reason: 'failed' });
  });

  it('renders thumbnails, null on error', async () => {
    const { native, deps } = fakes();
    expect(await imageThumbnail('img-a', 3, 160, 'bw', deps)).toBe('file:///cache/thumb.jpg');
    expect(native.renderImageThumbnail).toHaveBeenCalledWith('img-a', 3, 160, 'bw');
    native.renderImageThumbnail.mockRejectedValueOnce(nativeError('ERR_FILE_NOT_FOUND'));
    expect(await imageThumbnail('img-a', 3, 160, 'bw', deps)).toBeNull();
  });

  it('discards a session and swallows a failure', async () => {
    const { native, deps } = fakes();
    native.cleanToolWorkspace.mockRejectedValueOnce(nativeError('ERR_IO'));
    expect(() => discardImageSession('img-a', deps)).not.toThrow();
    await new Promise((r) => setImmediate(r));
    expect(native.cleanToolWorkspace).toHaveBeenCalledWith('img-a');
  });
});
