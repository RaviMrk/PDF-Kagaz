import { pdfNative, type PdfNativeApi } from '@/services/native/pdfNative';
import { useFiles, type FilesState } from '@/stores/filesStore';

export type PickDocumentsDeps = {
  native: Pick<PdfNativeApi, 'pickPdfDocuments'>;
  files: { getState(): Pick<FilesState, 'addPickedDocuments'> };
};

/**
 * System document picker, then registration of the picked files. Picked URIs carry a transient
 * read grant, so callers should select and use the returned ids without leaving the screen.
 */
export async function pickDocuments(
  multiple: boolean,
  deps: PickDocumentsDeps = { native: pdfNative, files: useFiles },
): Promise<{ ids: string[]; failed: number }> {
  try {
    const uris = await deps.native.pickPdfDocuments(multiple);
    if (uris.length === 0) return { ids: [], failed: 0 };
    const { rows, failed } = await deps.files.getState().addPickedDocuments(uris);
    return { ids: rows.map((r) => r.id), failed };
  } catch {
    return { ids: [], failed: 0 };
  }
}
