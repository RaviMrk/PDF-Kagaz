import type { FileActionError } from '@/stores/filesStore';

const KEYS: Record<FileActionError, string> = {
  notFound: 'files.errorNotFound',
  exists: 'files.errorExists',
  invalidName: 'files.errorInvalidChars',
  permission: 'files.errorPermission',
  unknown: 'files.errorUnknown',
};

/** i18n key for a file-action failure code (codes only, never names or paths). */
export function fileActionErrorKey(code: FileActionError): string {
  return KEYS[code];
}
