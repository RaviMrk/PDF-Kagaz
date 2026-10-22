import { EncryptedPDFError, PDFDocument } from '@cantoo/pdf-lib';

import { PdfToolError } from './pdfErrors';

async function isEncrypted(bytes: Uint8Array): Promise<boolean> {
  try {
    await PDFDocument.load(bytes, { updateMetadata: false });
    return false;
  } catch (e) {
    return e instanceof EncryptedPDFError;
  }
}

/**
 * Loads a PDF for editing. Every encrypted input is refused (never loaded with an empty
 * password, which would strip owner-password protection). Invalid objects throw eagerly.
 */
export async function loadPdf(bytes: Uint8Array, inputIndex: number | null = null) {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { throwOnInvalidObject: true, updateMetadata: false });
  } catch (e) {
    // Strict parsing can trip on encrypted (still ciphered) objects before the encryption check
    // runs, so re-probe leniently to tell "encrypted" from "invalid".
    const encrypted = e instanceof EncryptedPDFError || (await isEncrypted(bytes));
    throw new PdfToolError(encrypted ? 'encrypted' : 'invalid', inputIndex);
  }
  if (doc.getPageCount() === 0) throw new PdfToolError('invalid', inputIndex);
  return doc;
}
