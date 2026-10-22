/** @jest-environment node */
import { readFixture } from '@/test-utils/pdfFixtures';

import { isPdfToolError, PdfToolError } from '../pdfErrors';
import { loadPdf } from '../loadPdf';

describe('loadPdf', () => {
  it('loads a valid pdf', async () => {
    const doc = await loadPdf(readFixture('one-page.pdf'));
    expect(doc.getPageCount()).toBe(1);
  });

  it('rejects encrypted input with its index', async () => {
    const error = await loadPdf(readFixture('protected.pdf'), 3).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PdfToolError);
    expect(error).toMatchObject({ kind: 'encrypted', inputIndex: 3 });
    expect(isPdfToolError(error, 'encrypted')).toBe(true);
    expect(isPdfToolError(error, 'invalid')).toBe(false);
  });

  it('rejects the corrupted fixture as invalid', async () => {
    await expect(loadPdf(readFixture('corrupted.pdf'))).rejects.toMatchObject({
      kind: 'invalid',
      inputIndex: null,
    });
  });

  it('rejects garbage bytes as invalid', async () => {
    await expect(loadPdf(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({ kind: 'invalid' });
  });
});
