import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { PasswordDialog } from '@/components/PasswordDialog';
import type { FileRow } from '@/db/schema';
import { pdfNative } from '@/services/native/pdfNative';
import { failureMessage } from '@/services/tools/failureMessage';
import { findLockedInputs, type LockedInput } from '@/services/tools/passwords';
import type { Passwords } from '@/services/tools/runTool';
import type { RunnableToolId } from '@/services/tools/toolRegistry';
import { toToolFailure } from '@/services/tools/toolFailure';
import { displayName } from '@/utils/displayName';

/** Why the last password was not taken: it did not open the file, or opened it without changes. */
export type PromptError = 'wrong' | 'restricted' | null;

type DialogProps = {
  name: string;
  lock: LockedInput['lock'];
  error: PromptError;
  /** Why the password could not be checked at all (shown instead of the wrong-password copy). */
  failure?: string | null;
  onSubmit(password: string): void;
  onCancel(): void;
};

/** The password dialog of a tool input: the tool copy for a protected or a restricted file. */
export function ToolPasswordDialog({
  name,
  lock,
  error,
  failure,
  onSubmit,
  onCancel,
}: DialogProps) {
  const { t } = useTranslation();
  const shown = displayName(name);
  return (
    <PasswordDialog
      visible
      fileName={shown}
      wrong={error !== null || !!failure}
      errorText={failure ?? (error === 'restricted' ? t('password.restrictedError') : null)}
      body={t(lock === 'restricted' ? 'password.restrictedBody' : 'password.toolBody', {
        name: shown,
      })}
      submitLabel={t('password.use')}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );
}

type Prompt = {
  index: number;
  name: string;
  lock: LockedInput['lock'];
  error: PromptError;
  failure: string | null;
};

/**
 * Asks for the passwords of a tool's locked inputs before it starts: `ask(rows)` prompts for
 * each locked input in turn and checks the password typed (a wrong one, or one that only views a
 * restricted file, keeps the dialog open with the reason). It resolves with the passwords by input
 * index ({} when nothing is locked, without a dialog), or null when the user cancels. Passwords
 * stay in memory: never stored or logged.
 */
export function usePasswordPrompts(): {
  dialog: ReactElement | null;
  ask(rows: FileRow[], toolId?: RunnableToolId): Promise<Passwords | null>;
  /** Why the last `ask` refused to start: an input is damaged or gone (null otherwise). */
  blocked: string | null;
} {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  // The answer the open prompt waits for; null while a password is being checked.
  const answer = useRef<((password: string | null) => void) | null>(null);

  // Leaving the screen cancels a prompt still open.
  useEffect(() => () => answer.current?.(null), []);

  const ask = useCallback(
    async (rows: FileRow[], toolId?: RunnableToolId): Promise<Passwords | null> => {
      setBlocked(null);
      const { locked, blocked: unusable } = await findLockedInputs(rows, undefined, toolId);
      const first = unusable[0];
      if (first !== undefined) {
        setBlocked(failureMessage(first.failure, rows[first.index]!.name, t));
        return null;
      }
      const passwords: Passwords = {};
      try {
        for (const { index, lock } of locked) {
          const row = rows[index]!;
          let error: PromptError = null;
          let failure: string | null = null;
          for (;;) {
            const password = await new Promise<string | null>((resolve) => {
              answer.current = resolve;
              setPrompt({ index, name: row.name, lock, error, failure });
            });
            if (password === null) return null;
            let check;
            try {
              check = await pdfNative.checkPdfPassword(row.uri, password);
            } catch (e) {
              // Cannot be checked (the file went away, cannot be read…): the reason stays in the
              // dialog and no job starts on a password nobody could verify.
              error = 'wrong';
              failure = failureMessage(toToolFailure(e), row.name, t);
              continue;
            }
            if (check === 'ok') {
              passwords[index] = password;
              break;
            }
            error = check;
            failure = null;
          }
        }
        return passwords;
      } finally {
        answer.current = null;
        setPrompt(null);
      }
    },
    [t],
  );

  const take = (password: string | null) => {
    const resolve = answer.current;
    answer.current = null;
    resolve?.(password);
  };

  const dialog = prompt ? (
    <ToolPasswordDialog
      key={prompt.index}
      name={prompt.name}
      lock={prompt.lock}
      error={prompt.error}
      failure={prompt.failure}
      onSubmit={take}
      onCancel={() => take(null)}
    />
  ) : null;
  return { dialog, ask, blocked };
}
