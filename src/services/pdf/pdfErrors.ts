export type PdfToolErrorKind = 'encrypted' | 'invalid' | 'empty' | 'badPages' | 'cancelled';

export class PdfToolError extends Error {
  readonly kind: PdfToolErrorKind;
  readonly inputIndex: number | null;

  constructor(kind: PdfToolErrorKind, inputIndex: number | null = null) {
    super(`PDF tool failed: ${kind}`);
    this.name = 'PdfToolError';
    this.kind = kind;
    this.inputIndex = inputIndex;
  }
}

export function isPdfToolError(e: unknown, kind?: PdfToolErrorKind): e is PdfToolError {
  return e instanceof PdfToolError && (kind === undefined || e.kind === kind);
}

export type RunControl = { onProgress?: (fraction: number) => void; signal?: AbortSignal };

export function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new PdfToolError('cancelled');
}
