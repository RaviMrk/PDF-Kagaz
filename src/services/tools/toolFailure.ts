import { isPdfNativeError } from '@/services/native/pdfNative';
import { isPdfToolError } from '@/services/pdf/pdfErrors';

import type { ToolFailure } from './toolJobRepo';

/** Maps a native or PDF service error to the stored failure code (never names or paths). */
export function toToolFailure(e: unknown): ToolFailure {
  if (isPdfNativeError(e)) {
    switch (e.code) {
      case 'ERR_FILE_NOT_FOUND':
        return 'notFound';
      case 'ERR_VOLUME_UNAVAILABLE':
        return 'unavailable';
      case 'ERR_PERMISSION_DENIED':
        return 'permission';
      case 'ERR_TOO_LARGE':
        return 'tooLarge';
      case 'ERR_OUT_OF_MEMORY':
        return 'outOfMemory';
      case 'ERR_IO':
        return 'io';
      case 'ERR_PDF_ENCRYPTED':
        return 'encrypted';
      case 'ERR_PDF_INVALID':
        return 'invalid';
      case 'ERR_IMAGE_INVALID':
        return 'imageInvalid';
      case 'ERR_PASSWORD_WRONG':
        return 'wrongPassword';
      case 'ERR_PASSWORD_RESTRICTED':
        return 'restricted';
      case 'ERR_CANCELLED':
        return 'cancelled';
      default:
        return 'unknown';
    }
  }
  if (isPdfToolError(e)) return e.kind === 'empty' ? 'badPages' : e.kind;
  return 'unknown';
}

/** A stored size that is not a finite, non-negative number is unknown (0 for the pre-check). */
export function knownSize(sizeBytes: unknown): number {
  return typeof sizeBytes === 'number' && Number.isFinite(sizeBytes) && sizeBytes >= 0
    ? sizeBytes
    : 0;
}
