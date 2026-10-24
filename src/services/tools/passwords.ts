import type { FileRow } from '@/db/schema';
import { pdfNative, type PdfNativeApi } from '@/services/native/pdfNative';

/** An input that needs a password before a tool can use it (its index among the tool's inputs). */
export type LockedInput = { index: number; lock: 'password' | 'restricted' };

/**
 * Files whose last job failed `encrypted` although the pre-check said they were open: the next Run
 * asks for their password whatever the pre-check says, so "start again" is never a dead loop.
 * In memory only, keyed by file id; cleared when a job using the file succeeds.
 */
const forcedAsk = new Set<string>();

export function noteEncryptedFailure(fileId: string): void {
  forcedAsk.add(fileId);
}

export function clearEncryptedFailures(fileIds: readonly string[]): void {
  for (const id of fileIds) forcedAsk.delete(id);
}

/**
 * The inputs that need a password, in order. An input that opens with the empty password is not
 * locked (the job decrypts it silently). One that cannot be inspected is asked for anyway (the
 * check then tells what is wrong), and so is one whose last job failed `encrypted`.
 */
export async function findLockedInputs(
  rows: FileRow[],
  native: Pick<PdfNativeApi, 'inspectPdf'> = pdfNative,
): Promise<LockedInput[]> {
  const locked: LockedInput[] = [];
  for (const [index, row] of rows.entries()) {
    let lock: 'none' | 'open' | 'password' | 'restricted';
    try {
      lock = await native.inspectPdf(row.uri);
    } catch {
      lock = 'password';
    }
    if (lock === 'restricted') locked.push({ index, lock });
    else if (lock === 'password' || forcedAsk.has(row.id)) locked.push({ index, lock: 'password' });
  }
  return locked;
}
