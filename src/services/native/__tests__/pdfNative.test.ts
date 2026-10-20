import PdfNativeModule from '../../../../modules/pdf-native';
import { nativeError } from '../../../test-utils/fakePdfNative';
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

  it('subscribes to scan progress through the module event emitter', () => {
    const cb = jest.fn();
    const sub = pdfNative.addScanProgressListener(cb);
    expect(mockedModule.addListener).toHaveBeenCalledWith('onScanProgress', cb);
    expect(typeof sub.remove).toBe('function');
  });

  it('recognises native errors by code', () => {
    expect(isPdfNativeError(nativeError('ERR_PDF_ENCRYPTED'), 'ERR_PDF_ENCRYPTED')).toBe(true);
    expect(isPdfNativeError(nativeError('ERR_PDF_ENCRYPTED'), 'ERR_PDF_INVALID')).toBe(false);
    expect(isPdfNativeError(nativeError('ERR_PDF_ENCRYPTED'))).toBe(true);
    expect(isPdfNativeError(new Error('x'))).toBe(false);
    expect(isPdfNativeError(nativeError('ERR_IO'), 'ERR_IO')).toBe(true);
  });
});
