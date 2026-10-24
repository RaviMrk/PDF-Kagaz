import {
  createElement,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactElement,
} from 'react';

import { ToolPasswordDialog, type PromptError } from '@/components/tools/usePasswordPrompts';
import type { FileRow } from '@/db/schema';
import type { ToolFailure } from '@/services/tools/toolJobRepo';
import {
  openToolPreview,
  type ToolPreview,
  type ToolPreviewResult,
} from '@/services/tools/toolPreview';

export type ToolPreviewState =
  | { kind: 'loading' }
  | { kind: 'failed'; failure: ToolFailure }
  | { kind: 'ready'; fileUri: string; pageCount: number };

const LOADING: ToolPreviewState = { kind: 'loading' };

type Prompt = { fileKey: string; lock: 'password' | 'restricted'; error: PromptError };

/**
 * The staged preview of a tool's one input (page count and thumbnails), open while the caller is
 * mounted and keyed by file, not row object: a thumbnail or favourite update must not restage it.
 * A locked file asks for its password, checked by opening the preview with it; Cancel ends as
 * `encrypted` (a restricted file: `restricted`). `password` is the one that opened it (for the
 * job's request), never stored.
 */
export function useToolPreview(row: FileRow): {
  state: ToolPreviewState;
  password: string | null;
  dialog: ReactElement | null;
} {
  const fileKey = `${row.id}\n${row.uri}`;
  // A result for another file (the row changed) reads as loading until its own preview opens.
  const [result, setResult] = useState<{
    fileKey: string;
    state: ToolPreviewState;
    password: string | null;
  } | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const answer = useRef<((password: string | null) => void) | null>(null);

  const open = useEffectEvent((password: string | null): Promise<ToolPreviewResult> =>
    password === null ? openToolPreview(row) : openToolPreview(row, { password }),
  );

  useEffect(() => {
    let alive = true;
    let preview: ToolPreview | null = null;
    const ask = (lock: Prompt['lock'], error: PromptError) =>
      new Promise<string | null>((resolve) => {
        answer.current = resolve;
        setPrompt({ fileKey, lock, error });
      });
    // Still open when the effect is gone: closed at once.
    const keep = (r: ToolPreviewResult) => {
      if (r.ok && !alive) r.preview.close();
      return alive;
    };

    void (async () => {
      let r = await open(null);
      if (!keep(r)) return;
      let password: string | null = null;
      if (!r.ok && (r.failure === 'encrypted' || r.failure === 'restricted')) {
        const lock = r.failure === 'restricted' ? 'restricted' : 'password';
        let error: PromptError = null;
        for (;;) {
          const typed = await ask(lock, error);
          if (!alive) return;
          if (typed === null) {
            // Without its password the file stays as locked as it was found.
            r = { ok: false, failure: lock === 'restricted' ? 'restricted' : 'encrypted' };
            break;
          }
          r = await open(typed);
          if (!keep(r)) return;
          if (r.ok) {
            password = typed;
            break;
          }
          if (r.failure === 'wrongPassword' || r.failure === 'encrypted') error = 'wrong';
          else if (r.failure === 'restricted') error = 'restricted';
          else break;
        }
        answer.current = null;
        setPrompt(null);
      }
      if (!r.ok) {
        setResult({ fileKey, state: { kind: 'failed', failure: r.failure }, password: null });
        return;
      }
      preview = r.preview;
      const { fileUri, pageCount } = r.preview;
      setResult({ fileKey, state: { kind: 'ready', fileUri, pageCount }, password });
    })();

    return () => {
      alive = false;
      preview?.close();
      // A prompt still open for this file ends with the effect.
      answer.current?.(null);
      answer.current = null;
    };
  }, [fileKey]);

  const take = (password: string | null) => {
    const resolve = answer.current;
    answer.current = null;
    resolve?.(password);
  };

  const current = result?.fileKey === fileKey ? result : null;
  const dialog =
    prompt?.fileKey === fileKey
      ? createElement(ToolPasswordDialog, {
          name: row.name,
          lock: prompt.lock,
          error: prompt.error,
          onSubmit: take,
          onCancel: () => take(null),
        })
      : null;
  return { state: current?.state ?? LOADING, password: current?.password ?? null, dialog };
}
