/** @jest-environment node */
import { isPdfNativeError } from '@/services/native/pdfNative';
import { nativeError } from '@/test-utils/fakePdfNative';

import { toToolFailure } from '../toolFailure';

describe('toToolFailure', () => {
  it('knows the OCR recognition failure and maps it to unknown', () => {
    const e = nativeError('ERR_OCR_FAILED');
    expect(isPdfNativeError(e, 'ERR_OCR_FAILED')).toBe(true);
    expect(toToolFailure(e)).toBe('unknown');
  });

  it('maps coded native errors to their stored failure', () => {
    expect(toToolFailure(nativeError('ERR_OUT_OF_MEMORY'))).toBe('outOfMemory');
    expect(toToolFailure(nativeError('ERR_PDF_INVALID'))).toBe('invalid');
    expect(toToolFailure(nativeError('ERR_CANCELLED'))).toBe('cancelled');
    expect(toToolFailure(new Error('plain'))).toBe('unknown');
  });
});
