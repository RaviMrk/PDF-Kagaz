import { create } from 'zustand';

import { getDb } from '@/db/client';
import type { SignatureRow } from '@/db/schema';
import type { IndexDb } from '@/services/index/fileIndexRepo';
import { pdfNative, type ExportedSignature, type PdfNativeApi } from '@/services/native/pdfNative';
import { addSignature, deleteSignature, listSignatures } from '@/services/signatures/signatureRepo';

export const MAX_SIGNATURES = 10;

export type SaveResult = { ok: true; row: SignatureRow } | { ok: false; reason: 'full' | 'db' };

export type SignaturesState = {
  items: SignatureRow[];
  load(): void;
  /** Stores an exported PNG; when refused (full, DB error) its file is deleted. */
  save(sig: ExportedSignature): SaveResult;
  /** Deletes the row, then its file (a file error is ignored); false when nothing was deleted. */
  remove(id: number): Promise<boolean>;
};

export type SignaturesStoreDeps = {
  getDb: () => IndexDb;
  native: Pick<PdfNativeApi, 'deleteSignatureFile'>;
  now: () => number;
};

export function createSignaturesStore(deps: SignaturesStoreDeps) {
  const dropFile = (uri: string) => deps.native.deleteSignatureFile(uri).catch(() => undefined);
  return create<SignaturesState>()((set) => ({
    items: [],
    load() {
      try {
        set({ items: listSignatures(deps.getDb()) });
      } catch {
        // The list keeps what it had; the next load retries.
      }
    },
    save(sig) {
      let row: SignatureRow;
      try {
        const db = deps.getDb();
        if (listSignatures(db).length >= MAX_SIGNATURES) {
          void dropFile(sig.uri);
          return { ok: false, reason: 'full' };
        }
        row = addSignature(db, sig.uri, deps.now());
        set({ items: listSignatures(db) });
      } catch {
        void dropFile(sig.uri);
        return { ok: false, reason: 'db' };
      }
      return { ok: true, row };
    },
    async remove(id) {
      let row: SignatureRow | undefined;
      try {
        const db = deps.getDb();
        row = deleteSignature(db, id);
        set({ items: listSignatures(db) });
      } catch {
        return false;
      }
      if (!row) return false;
      await dropFile(row.pngPath);
      return true;
    },
  }));
}

export const useSignatures = createSignaturesStore({
  getDb,
  native: pdfNative,
  now: Date.now,
});
