import { isDirectlyInPrimaryAppFolder } from '../appFolder';

describe('isDirectlyInPrimaryAppFolder', () => {
  it('is true for a direct child on primary storage', () => {
    expect(
      isDirectlyInPrimaryAppFolder({
        uri: 'file:///storage/emulated/0/Documents/PDFToolkit/a.pdf',
      }),
    ).toBe(true);
  });
  it('is false for nested folders and other volumes', () => {
    expect(
      isDirectlyInPrimaryAppFolder({
        uri: 'file:///storage/emulated/0/Documents/PDFToolkit/sub/a.pdf',
      }),
    ).toBe(false);
    expect(
      isDirectlyInPrimaryAppFolder({ uri: 'file:///storage/1A2B-3C4D/Documents/PDFToolkit/a.pdf' }),
    ).toBe(false);
  });
  it('reads SAF document ids', () => {
    expect(
      isDirectlyInPrimaryAppFolder({
        uri: 'content://com.android.externalstorage.documents/tree/primary%3ADocuments/document/primary%3ADocuments%2FPDFToolkit%2Fa.pdf',
      }),
    ).toBe(true);
  });
  it('trusts the display folder for MediaStore uris', () => {
    expect(
      isDirectlyInPrimaryAppFolder({
        uri: 'content://media/external/file/1',
        folder: 'Documents/PDFToolkit',
      }),
    ).toBe(true);
  });

  it('decides from the uri alone for file:// and SAF, ignoring the display folder', () => {
    expect(
      isDirectlyInPrimaryAppFolder({
        uri: 'file:///storage/1A2B-3C4D/Documents/PDFToolkit/x.pdf',
        folder: 'Documents/PDFToolkit',
      }),
    ).toBe(false);
    expect(
      isDirectlyInPrimaryAppFolder({
        uri: 'content://com.android.externalstorage.documents/tree/1A2B-3C4D%3ADocuments/document/1A2B-3C4D%3ADocuments%2FPDFToolkit%2Fx.pdf',
        folder: 'Documents/PDFToolkit',
      }),
    ).toBe(false);
    expect(
      isDirectlyInPrimaryAppFolder({
        uri: 'file:///storage/emulated/0/Documents/PDFToolkit/sub/x.pdf',
        folder: 'Documents/PDFToolkit',
      }),
    ).toBe(false);
  });
});
