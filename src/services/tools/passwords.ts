import type { FileRow } from '@/db/schema';
import { pdfNative, type PdfNativeApi } from '@/services/native/pdfNative';

/** An input that needs a password before a tool can use it (its index among the tool's inputs). */
export type LockedInput = { index: number; lock: 'password' | 'restricted' };

/**
 * The inputs that need a password, in order. An input that opens with the empty password is not
 * locked (the job decrypts it silently); one that cannot be inspected is left to the job, which
 * reports its failure.
 */
export async function findLockedInputs(
  rows: FileRow[],
  native: Pick<PdfNativeApi, 'inspectPdf'> = pdfNative,
): Promise<LockedInput[]> {
  const locked: LockedInput[] = [];
  for (const [index, row] of rows.entries()) {
    let lock;
    try {
      lock = await native.inspectPdf(row.uri);
    } catch {
      continue;
    }
    if (lock === 'password' || lock === 'restricted') locked.push({ index, lock });
  }
  return locked;
}
