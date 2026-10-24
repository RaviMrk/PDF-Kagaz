import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { PasswordDialog } from '@/components/PasswordDialog';
import type { FileRow } from '@/db/schema';
import { pdfNative } from '@/services/native/pdfNative';
import { findLockedInputs, type LockedInput } from '@/services/tools/passwords';
import type { Passwords } from '@/services/tools/runTool';
import { displayName } from '@/utils/displayName';

/** Why the last password was not taken: it did not open the file, or opened it without changes. */
export type PromptError = 'wrong' | 'restricted' | null;

type DialogProps = {
  name: string;
  lock: LockedInput['lock'];
  error: PromptError;
  onSubmit(password: string): void;
  onCancel(): void;
};

/** The password dialog of a tool input: the tool copy for a protected or a restricted file. */
export function ToolPasswordDialog({ name, lock, error, onSubmit, onCancel }: DialogProps) {
  const { t } = useTranslation();
  const shown = displayName(name);
  return (
    <PasswordDialog
      visible
      fileName={shown}
      wrong={error !== null}
      errorText={error === 'restricted' ? t('password.restrictedError') : null}
      body={t(lock === 'restricted' ? 'password.restrictedBody' : 'password.toolBody', {
        name: shown,
      })}
      submitLabel={t('password.use')}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );
}

type Prompt = { index: number; name: string; lock: LockedInput['lock']; error: PromptError };

/**
 * Asks for the passwords of a tool's locked inputs before it starts: `ask(rows)` prompts for
 * each locked input in turn and checks the password typed (a wrong one, or one that only views a
 * restricted file, keeps the dialog open with the reason). It resolves with the passwords by input
 * index ({} when nothing is locked, without a dialog), or null when the user cancels. Passwords
 * stay in memory: never stored or logged.
 */
export function usePasswordPrompts(): {
  dialog: ReactElement | null;
  ask(rows: FileRow[]): Promise<Passwords | null>;
} {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  // The answer the open prompt waits for; null while a password is being checked.
  const answer = useRef<((password: string | null) => void) | null>(null);

  // Leaving the screen cancels a prompt still open.
  useEffect(() => () => answer.current?.(null), []);

  const ask = useCallback(async (rows: FileRow[]): Promise<Passwords | null> => {
    const locked = await findLockedInputs(rows);
    const passwords: Passwords = {};
    try {
      for (const { index, lock } of locked) {
        const row = rows[index]!;
        let error: PromptError = null;
        for (;;) {
          const password = await new Promise<string | null>((resolve) => {
            answer.current = resolve;
            setPrompt({ index, name: row.name, lock, error });
          });
          if (password === null) return null;
          let check;
          try {
            check = await pdfNative.checkPdfPassword(row.uri, password);
          } catch {
            // Cannot be checked now (the file went away…): the job reports what is wrong.
            check = 'ok' as const;
          }
          if (check === 'ok') {
            passwords[index] = password;
            break;
          }
          error = check;
        }
      }
      return passwords;
    } finally {
      answer.current = null;
      setPrompt(null);
    }
  }, []);

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
      onSubmit={take}
      onCancel={() => take(null)}
    />
  ) : null;
  return { dialog, ask };
}
