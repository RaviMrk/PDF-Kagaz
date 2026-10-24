import PdfNativeModule from '../../../../modules/pdf-native';
import { createFakePdfNative, nativeError } from '../../../test-utils/fakePdfNative';
import { isPdfNativeError, pdfNative, type ScanResult } from '../pdfNative';

const mockedModule = jest.mocked(PdfNativeModule);

describe('pdfNative', () => {
  it('forwards scanPdfs roots to the native module and returns its result', async () => {
    const result: ScanResult = {
      files: [
        {
          uri: 'file:///x/a.pdf',
          name: 'a.pdf',
          folder: 'x',
          parentUri: 'file:///x',
          parentModifiedAt: 1,
          sizeBytes: 10,
          modifiedAt: 2,
        },
      ],
      scannedRoots: ['file:///x'],
      failedRoots: [],
    };
    mockedModule.scanPdfs.mockResolvedValueOnce(result);

    await expect(pdfNative.scanPdfs(['file:///x'])).resolves.toEqual(result);
    expect(mockedModule.scanPdfs).toHaveBeenCalledWith(['file:///x']);
  });

  it('sends scanChangedFolders stamps as two primitive arrays (no per-record reflection)', async () => {
    const changes = [{ uri: 'file:///x', exists: true, modifiedAt: 5, files: [] }];
    mockedModule.scanChangedFolders.mockResolvedValueOnce(changes);

    await expect(
      pdfNative.scanChangedFolders([
        { uri: 'file:///x', modifiedAt: 5 },
        { uri: 'file:///y', modifiedAt: 7 },
      ]),
    ).resolves.toEqual(changes);
    expect(mockedModule.scanChangedFolders).toHaveBeenCalledWith(
      ['file:///x', 'file:///y'],
      [5, 7],
    );
  });

  it('forwards prepareReaderFile to the native module and returns its file:// copy', async () => {
    const copy = {
      uri: 'file:///data/user/0/app/cache/reader/0123.pdf',
      copied: true,
      sizeBytes: 42,
    };
    mockedModule.prepareReaderFile.mockResolvedValueOnce(copy);

    await expect(pdfNative.prepareReaderFile('content://x/1')).resolves.toEqual(copy);
    expect(mockedModule.prepareReaderFile).toHaveBeenCalledWith('content://x/1');
  });

  it('passes an encoded file:// uri through prepareReaderFile untouched', async () => {
    // react-native-pdf decodeURIComponent()s file:// sources, so the native encoding must survive.
    const uri = 'file:///storage/emulated/0/Download/%E0%A4%85%2520%23%3F%20a.pdf';
    mockedModule.prepareReaderFile.mockResolvedValueOnce({ uri, copied: false, sizeBytes: 1 });

    const file = await pdfNative.prepareReaderFile(uri);
    expect(file.uri).toBe(uri);
    expect(decodeURIComponent(file.uri.replace(/file:\/\//i, ''))).toBe(
      '/storage/emulated/0/Download/अ%20#? a.pdf',
    );
  });

  it('forwards the reader thumbnail lane and document release', async () => {
    mockedModule.renderReaderThumbnail.mockResolvedValueOnce('file:///t.jpg');

    await expect(pdfNative.renderReaderThumbnail('file:///a.pdf', 3, 160)).resolves.toBe(
      'file:///t.jpg',
    );
    expect(mockedModule.renderReaderThumbnail).toHaveBeenCalledWith('file:///a.pdf', 3, 160);
    await expect(pdfNative.releaseReaderDocument()).resolves.toBeUndefined();
    expect(mockedModule.releaseReaderDocument).toHaveBeenCalledTimes(1);
  });

  it('subscribes to scan progress through the module event emitter', () => {
    const cb = jest.fn();
    const sub = pdfNative.addScanProgressListener(cb);
    expect(mockedModule.addListener).toHaveBeenCalledWith('onScanProgress', cb);
    expect(typeof sub.remove).toBe('function');
  });

  it('subscribes to incoming PDFs through the module event emitter', () => {
    const cb = jest.fn();
    const sub = pdfNative.addIncomingPdfListener(cb);
    expect(mockedModule.addListener).toHaveBeenCalledWith('onIncomingPdf', cb);
    expect(typeof sub.remove).toBe('function');
  });

  it('subscribes to native tool progress through the module event emitter', () => {
    const cb = jest.fn();
    const sub = pdfNative.addToolProgressListener(cb);
    expect(mockedModule.addListener).toHaveBeenCalledWith('onToolProgress', cb);
    expect(typeof sub.remove).toBe('function');
  });

  it('forwards cancelNativeTool with the job id', async () => {
    await expect(pdfNative.cancelNativeTool('j1')).resolves.toBeUndefined();
    expect(mockedModule.cancelNativeTool).toHaveBeenCalledWith('j1');
  });

  it('forwards printPdf uri and job name', async () => {
    await expect(pdfNative.printPdf('file:///a.pdf', 'a')).resolves.toBeUndefined();
    expect(mockedModule.printPdf).toHaveBeenCalledWith('file:///a.pdf', 'a');
  });

  it('forwards share, open-with, take and resolve of incoming PDFs', async () => {
    await pdfNative.sharePdf('content://x/1', 'Share');
    expect(mockedModule.sharePdf).toHaveBeenCalledWith('content://x/1', 'Share');
    await pdfNative.openPdfWith('file:///a.pdf', 'Open with');
    expect(mockedModule.openPdfWith).toHaveBeenCalledWith('file:///a.pdf', 'Open with');
    await expect(pdfNative.takeIncomingPdf()).resolves.toBeNull();
    await expect(pdfNative.resolveIncomingPdf('content://x/a.pdf')).resolves.toMatchObject({
      uri: 'content://x/a.pdf',
      name: 'a.pdf',
    });
    expect(mockedModule.resolveIncomingPdf).toHaveBeenCalledWith('content://x/a.pdf');
  });

  it('forwards releaseIncomingGrant', async () => {
    await expect(pdfNative.releaseIncomingGrant('content://x/1')).resolves.toBeUndefined();
    expect(mockedModule.releaseIncomingGrant).toHaveBeenCalledWith('content://x/1');
  });

  it('forwards stageToolInput with all four arguments', async () => {
    await expect(pdfNative.stageToolInput('content://x/1', 'j1', 0, 31457280)).resolves.toEqual({
      uri: 'file:///data/cache/tools/j1/in-0.pdf',
      sizeBytes: 1000,
    });
    expect(mockedModule.stageToolInput).toHaveBeenCalledWith('content://x/1', 'j1', 0, 31457280);
  });

  it('forwards the tool workspace lifecycle and output publishing', async () => {
    await expect(pdfNative.createToolWorkspace('j1')).resolves.toBe('file:///data/cache/tools/j1');
    expect(mockedModule.createToolWorkspace).toHaveBeenCalledWith('j1');
    await expect(
      pdfNative.publishToolOutput('file:///data/cache/tools/j1/out-1.pdf', 'a b.pdf'),
    ).resolves.toMatchObject({
      uri: 'file:///storage/emulated/0/Documents/PDFToolkit/a%20b.pdf',
      name: 'a b.pdf',
      folder: 'Documents/PDFToolkit',
    });
    expect(mockedModule.publishToolOutput).toHaveBeenCalledWith(
      'file:///data/cache/tools/j1/out-1.pdf',
      'a b.pdf',
    );
    await expect(pdfNative.cleanToolWorkspace('j1')).resolves.toBeUndefined();
    expect(mockedModule.cleanToolWorkspace).toHaveBeenCalledWith('j1');
    await expect(pdfNative.cleanupToolLeftovers(123)).resolves.toBe(0);
    expect(mockedModule.cleanupToolLeftovers).toHaveBeenCalledWith(123);
  });

  it('forwards the tool thumbnail lane, page count and release', async () => {
    const fileUri = 'file:///data/cache/tools/p/in-0.pdf';
    mockedModule.renderToolThumbnail.mockResolvedValueOnce('file:///tt.jpg');

    await expect(pdfNative.renderToolThumbnail(fileUri, 2, 160)).resolves.toBe('file:///tt.jpg');
    expect(mockedModule.renderToolThumbnail).toHaveBeenCalledWith(fileUri, 2, 160);
    await expect(pdfNative.getToolPageCount(fileUri)).resolves.toBe(3);
    expect(mockedModule.getToolPageCount).toHaveBeenCalledWith(fileUri);
    await expect(pdfNative.releaseToolDocument()).resolves.toBeUndefined();
    expect(mockedModule.releaseToolDocument).toHaveBeenCalledTimes(1);
  });

  it('forwards inspect, the password check and unlock with every argument', async () => {
    mockedModule.inspectPdf.mockResolvedValueOnce('password');
    await expect(pdfNative.inspectPdf('content://p/a.pdf')).resolves.toBe('password');
    expect(mockedModule.inspectPdf).toHaveBeenCalledWith('content://p/a.pdf');
    mockedModule.checkPdfPassword.mockResolvedValueOnce('wrong');
    await expect(pdfNative.checkPdfPassword('content://p/a.pdf', 'pw')).resolves.toBe('wrong');
    expect(mockedModule.checkPdfPassword).toHaveBeenCalledWith('content://p/a.pdf', 'pw');
    const staged = 'file:///data/cache/tools/j1/in-1.pdf';
    await expect(pdfNative.unlockToolInput(staged, 'j1', 1, null)).resolves.toEqual({
      uri: 'file:///data/cache/tools/j1/in-1.open.pdf',
      sizeBytes: 1000,
    });
    expect(mockedModule.unlockToolInput).toHaveBeenCalledWith(staged, 'j1', 1, null);
  });

  it('forwards assemblePdf with the refs as a JSON string', async () => {
    const inputs = ['file:///data/cache/tools/j1/in-0.pdf'];
    const json = '[[{"i":0,"p":0,"r":90}],[{"i":0,"p":1,"r":0}]]';
    await expect(pdfNative.assemblePdf('j1', inputs, json, 4)).resolves.toEqual([
      { uri: 'file:///data/cache/tools/j1/out-native-4.pdf', sizeBytes: 1000 },
      { uri: 'file:///data/cache/tools/j1/out-native-5.pdf', sizeBytes: 1000 },
    ]);
    expect(mockedModule.assemblePdf).toHaveBeenCalledWith('j1', inputs, json, 4);
  });

  it('forwards the stamping calls with every argument in order', async () => {
    const spec = '{"stamps":[]}';
    await expect(
      pdfNative.stampPdf('file:///data/cache/tools/j1/in-0.pdf', 'j1', spec),
    ).resolves.toEqual({ uri: 'file:///data/cache/tools/j1/out-stamped.pdf', sizeBytes: 1200 });
    expect(mockedModule.stampPdf).toHaveBeenCalledWith(
      'file:///data/cache/tools/j1/in-0.pdf',
      'j1',
      spec,
    );
    await expect(pdfNative.renderTextStamp('j1', 'DRAFT', 0xff808080, 256)).resolves.toMatchObject({
      uri: 'file:///data/cache/tools/j1/stamp-text.png',
    });
    expect(mockedModule.renderTextStamp).toHaveBeenCalledWith('j1', 'DRAFT', 0xff808080, 256);
    await expect(pdfNative.prepareStampImage('img-a', 1, 'j1', 2048)).resolves.toMatchObject({
      uri: 'file:///data/cache/tools/j1/stamp-image-1.png',
    });
    expect(mockedModule.prepareStampImage).toHaveBeenCalledWith('img-a', 1, 'j1', 2048);
  });

  it('forwards the image pipeline with every argument in order', async () => {
    await expect(pdfNative.importImage('content://x/1', 'img-a', 2, 52428800)).resolves.toEqual({
      index: 2,
      width: 400,
      height: 300,
      sizeBytes: 1000,
    });
    expect(mockedModule.importImage).toHaveBeenCalledWith('content://x/1', 'img-a', 2, 52428800);
    await expect(
      pdfNative.prepareImagePage('img-a', 2, 'j1', 0, 2400, 85, 'bw'),
    ).resolves.toMatchObject({ uri: 'file:///data/cache/tools/j1/page-0.jpg' });
    expect(mockedModule.prepareImagePage).toHaveBeenCalledWith('img-a', 2, 'j1', 0, 2400, 85, 'bw');
    await expect(pdfNative.renderImageThumbnail('img-a', 2, 160, 'greyscale')).resolves.toBe(
      'file:///tool-thumbs/img-a-2.jpg',
    );
    expect(mockedModule.renderImageThumbnail).toHaveBeenCalledWith('img-a', 2, 160, 'greyscale');
  });

  it('resolves saveCopyAs with the module value (false when the picker was cancelled)', async () => {
    const u = 'file:///storage/emulated/0/Documents/PDFToolkit/a.pdf';
    await expect(pdfNative.saveCopyAs(u, 'a.pdf')).resolves.toBe(true);
    expect(mockedModule.saveCopyAs).toHaveBeenCalledWith(u, 'a.pdf');
    mockedModule.saveCopyAs.mockResolvedValueOnce(false);
    await expect(pdfNative.saveCopyAs(u, 'a.pdf')).resolves.toBe(false);
  });

  it('forwards pickPdfDocuments and returns the picked uris', async () => {
    await expect(pdfNative.pickPdfDocuments(true)).resolves.toEqual([]);
    expect(mockedModule.pickPdfDocuments).toHaveBeenCalledWith(true);
    mockedModule.pickPdfDocuments.mockResolvedValueOnce(['content://b/1']);
    await expect(pdfNative.pickPdfDocuments(false)).resolves.toEqual(['content://b/1']);
    expect(mockedModule.pickPdfDocuments).toHaveBeenLastCalledWith(false);
  });

  it('forwards pickImages and scanDocument with every argument', async () => {
    await expect(pdfNative.pickImages(100)).resolves.toEqual({ uris: [], dropped: 0 });
    expect(mockedModule.pickImages).toHaveBeenCalledWith(100);
    mockedModule.pickImages.mockResolvedValueOnce({
      uris: ['content://media/picker/1'],
      dropped: 2,
    });
    await expect(pdfNative.pickImages(3)).resolves.toEqual({
      uris: ['content://media/picker/1'],
      dropped: 2,
    });
    expect(mockedModule.pickImages).toHaveBeenLastCalledWith(3);

    await expect(pdfNative.scanDocument('img-a', 3, 97)).resolves.toEqual([]);
    expect(mockedModule.scanDocument).toHaveBeenCalledWith('img-a', 3, 97);
    const pages = [{ index: 3, width: 1240, height: 1754, sizeBytes: 2000 }];
    mockedModule.scanDocument.mockResolvedValueOnce(pages);
    await expect(pdfNative.scanDocument('img-a', 3, 97)).resolves.toEqual(pages);
  });

  it('recognises native errors by code', () => {
    expect(isPdfNativeError(nativeError('ERR_PDF_ENCRYPTED'), 'ERR_PDF_ENCRYPTED')).toBe(true);
    expect(isPdfNativeError(nativeError('ERR_PDF_ENCRYPTED'), 'ERR_PDF_INVALID')).toBe(false);
    expect(isPdfNativeError(nativeError('ERR_PDF_ENCRYPTED'))).toBe(true);
    expect(isPdfNativeError(new Error('x'))).toBe(false);
    expect(isPdfNativeError(nativeError('ERR_IO'), 'ERR_IO')).toBe(true);
    expect(isPdfNativeError(nativeError('ERR_TOO_LARGE'), 'ERR_TOO_LARGE')).toBe(true);
    expect(isPdfNativeError(nativeError('ERR_IMAGE_INVALID'), 'ERR_IMAGE_INVALID')).toBe(true);
    expect(
      isPdfNativeError(nativeError('ERR_SCANNER_UNAVAILABLE'), 'ERR_SCANNER_UNAVAILABLE'),
    ).toBe(true);
    for (const code of [
      'ERR_PASSWORD_WRONG',
      'ERR_PASSWORD_RESTRICTED',
      'ERR_CANCELLED',
    ] as const) {
      expect(isPdfNativeError(nativeError(code), code)).toBe(true);
    }
  });

  it('lets tests drive tool progress through the fake', () => {
    const fake = createFakePdfNative();
    const cb = jest.fn();
    const sub = fake.addToolProgressListener(cb);
    fake.emitToolProgress({ jobId: 'j1', fraction: 0.5 });
    expect(cb).toHaveBeenCalledWith({ jobId: 'j1', fraction: 0.5 });
    sub.remove();
    fake.emitToolProgress({ jobId: 'j1', fraction: 1 });
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
