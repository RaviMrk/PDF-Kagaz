import { nativeError } from '../../../test-utils/fakePdfNative';
import { runReaderAction, shareFiles, toggleReaderBookmark } from '../readerActions';

const mk = () => ({
  sharePdf: jest.fn().mockResolvedValue(undefined),
  printPdf: jest.fn().mockResolvedValue(undefined),
  openPdfWith: jest.fn().mockResolvedValue(undefined),
});

describe('runReaderAction', () => {
  it('routes each action', async () => {
    const n = mk();
    await expect(runReaderAction('share', { uri: 'u', title: 't' }, n)).resolves.toBe('ok');
    await runReaderAction('print', { uri: 'u', title: 't' }, n);
    await runReaderAction('openWith', { uri: 'u', title: 't' }, n);
    expect(n.sharePdf).toHaveBeenCalledWith('u', 't');
    expect(n.printPdf).toHaveBeenCalledWith('u', 't');
    expect(n.openPdfWith).toHaveBeenCalledWith('u', 't');
  });

  it.each([
    ['ERR_FILE_NOT_FOUND', 'notFound'],
    ['ERR_VOLUME_UNAVAILABLE', 'unavailable'],
    ['ERR_PERMISSION_DENIED', 'permission'],
    ['ERR_NO_ACTIVITY', 'unknown'],
    ['ERR_IO', 'unknown'],
  ] as const)('maps %s to %s', async (code, result) => {
    const n = mk();
    n.sharePdf.mockRejectedValue(nativeError(code));
    await expect(runReaderAction('share', { uri: 'u', title: 't' }, n)).resolves.toBe(result);
  });
});

describe('shareFiles', () => {
  it('shares every uri in one share sheet', async () => {
    const n = { sharePdfs: jest.fn().mockResolvedValue(undefined) };
    await expect(shareFiles(['a', 'b', 'c'], 'Share PDFs', n)).resolves.toBe('ok');
    expect(n.sharePdfs).toHaveBeenCalledTimes(1);
    expect(n.sharePdfs).toHaveBeenCalledWith(['a', 'b', 'c'], 'Share PDFs');
  });

  it('maps failures and refuses an empty list', async () => {
    const n = { sharePdfs: jest.fn().mockRejectedValue(nativeError('ERR_PERMISSION_DENIED')) };
    await expect(shareFiles(['a'], 't', n)).resolves.toBe('permission');
    await expect(shareFiles([], 't', n)).resolves.toBe('notFound');
    expect(n.sharePdfs).toHaveBeenCalledTimes(1);
  });
});

describe('toggleReaderBookmark', () => {
  it('toggles a valid page', () => {
    const toggle = jest.fn().mockReturnValue({ bookmarked: true });
    expect(toggleReaderBookmark({ fileId: 'f', page: 3, pageCount: 10 }, toggle)).toEqual({
      ok: true,
      bookmarked: true,
    });
    expect(toggle).toHaveBeenCalledWith({ fileId: 'f', page: 3 });
  });
  it('clamps to pageCount', () => {
    const toggle = jest.fn().mockReturnValue({ bookmarked: true });
    toggleReaderBookmark({ fileId: 'f', page: 30, pageCount: 10 }, toggle);
    expect(toggle).toHaveBeenCalledWith({ fileId: 'f', page: 10 });
  });
  it.each([0, -1, 1.5, NaN])('rejects page %p', (page) => {
    const toggle = jest.fn();
    expect(toggleReaderBookmark({ fileId: 'f', page, pageCount: 10 }, toggle)).toEqual({
      ok: false,
    });
    expect(toggle).not.toHaveBeenCalled();
  });
  it('rejects a non-integer pageCount page', () => {
    const toggle = jest.fn().mockReturnValue({ bookmarked: true });
    toggleReaderBookmark({ fileId: 'f', page: 2, pageCount: NaN }, toggle);
    expect(toggle).toHaveBeenCalledWith({ fileId: 'f', page: 2 });
  });
  it('never throws (FK violation)', () => {
    const toggle = jest.fn(() => {
      throw new Error('FOREIGN KEY constraint failed');
    });
    expect(toggleReaderBookmark({ fileId: 'f', page: 2 }, toggle)).toEqual({ ok: false });
  });
});
