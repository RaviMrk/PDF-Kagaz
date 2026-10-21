import type { PdfViewErrorKind } from '@/components/reader/PdfView';

export type ReaderFailure =
  'notFound' | 'unavailable' | 'permission' | 'invalid' | 'io' | 'unknown';

export type ReaderPhase =
  | { kind: 'preparing' }
  | { kind: 'loading'; fileUri: string; password: string }
  | { kind: 'needsPassword'; fileUri: string; wrong: boolean }
  | { kind: 'ready'; fileUri: string; password: string; pageCount: number }
  | { kind: 'failed'; reason: ReaderFailure };

export type ReaderEvent =
  | { type: 'prepared'; fileUri: string }
  | { type: 'prepareFailed'; reason: ReaderFailure }
  | { type: 'loaded'; pageCount: number }
  | { type: 'pdfError'; kind: PdfViewErrorKind }
  | { type: 'submitPassword'; password: string }
  | { type: 'retry' };

/** Passwords live only in this state (memory); they are never persisted. */
export function readerReducer(state: ReaderPhase, event: ReaderEvent): ReaderPhase {
  switch (event.type) {
    case 'prepared':
      return state.kind === 'preparing'
        ? { kind: 'loading', fileUri: event.fileUri, password: '' }
        : state;
    case 'prepareFailed':
      return state.kind === 'preparing' ? { kind: 'failed', reason: event.reason } : state;
    case 'pdfError':
      if (state.kind !== 'loading') return state;
      return event.kind === 'password'
        ? { kind: 'needsPassword', fileUri: state.fileUri, wrong: state.password !== '' }
        : { kind: 'failed', reason: 'invalid' };
    case 'submitPassword':
      return state.kind === 'needsPassword' && event.password !== ''
        ? { kind: 'loading', fileUri: state.fileUri, password: event.password }
        : state;
    case 'loaded':
      return state.kind === 'loading'
        ? {
            kind: 'ready',
            fileUri: state.fileUri,
            password: state.password,
            pageCount: event.pageCount,
          }
        : state;
    case 'retry':
      return state.kind === 'failed' ? { kind: 'preparing' } : state;
  }
}
