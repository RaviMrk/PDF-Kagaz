import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';
import { Pressable, Text } from 'react-native';

import { usePasswordPrompts } from '@/components/tools/usePasswordPrompts';
import type { FileRow } from '@/db/schema';
import { initI18n } from '@/i18n';
import { pdfNative, type PdfLock } from '@/services/native/pdfNative';
import type { Passwords } from '@/services/tools/runTool';
import { makeRow } from '@/test-utils/fileRows';

const i18n = initI18n('en');
const a = makeRow({ name: 'a.pdf' });
const b = makeRow({ name: 'Report.pdf' });

let answer: Passwords | null | undefined;

function Harness({ rows }: { rows: FileRow[] }) {
  const { dialog, ask } = usePasswordPrompts();
  return (
    <>
      <Pressable
        accessibilityLabel="Run"
        onPress={() => {
          void ask(rows).then((r) => {
            answer = r;
          });
        }}
      >
        <Text>Run</Text>
      </Pressable>
      {dialog}
    </>
  );
}

async function run(rows: FileRow[]) {
  await render(
    <I18nextProvider i18n={i18n}>
      <Harness rows={rows} />
    </I18nextProvider>,
  );
  await fireEvent.press(screen.getByLabelText('Run'));
  await act(async () => {});
}

async function submit(password: string) {
  await fireEvent.changeText(screen.getByPlaceholderText('Password'), password);
  await fireEvent.press(screen.getByRole('button', { name: 'Use' }));
  await act(async () => {});
}

function locks(byUri: Record<string, PdfLock>) {
  jest
    .spyOn(pdfNative, 'inspectPdf')
    .mockImplementation((uri: string) => Promise.resolve(byUri[uri] ?? 'none'));
}

describe('usePasswordPrompts', () => {
  beforeEach(() => {
    answer = undefined;
  });
  afterEach(() => jest.restoreAllMocks());

  it('resolves {} without a dialog when nothing is locked', async () => {
    locks({});
    await run([a, b]);
    expect(answer).toEqual({});
    expect(screen.queryByPlaceholderText('Password')).toBeNull();
  });

  it('keeps asking after a wrong password, then resolves with the right one', async () => {
    locks({ [b.uri]: 'password' });
    const check = jest
      .spyOn(pdfNative, 'checkPdfPassword')
      .mockImplementation((_uri, password) =>
        Promise.resolve(password === 'secret' ? 'ok' : 'wrong'),
      );
    await run([a, b]);
    expect(screen.getByText('Password required')).toBeTruthy();
    expect(
      screen.getByText('"Report.pdf" is protected. Enter its password to use it in this tool.'),
    ).toBeTruthy();

    await submit('bad');
    expect(check).toHaveBeenCalledWith(b.uri, 'bad');
    expect(screen.getByText('Wrong password. Try again.')).toBeTruthy();
    expect(answer).toBeUndefined();

    await submit('secret');
    expect(answer).toEqual({ 1: 'secret' });
    expect(screen.queryByPlaceholderText('Password')).toBeNull();
  });

  it('resolves null on Cancel', async () => {
    locks({ [a.uri]: 'password' });
    await run([a]);
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    await act(async () => {});
    expect(answer).toBeNull();
    expect(screen.queryByPlaceholderText('Password')).toBeNull();
  });

  it('asks for the owner password of a restricted file, and refuses a user password', async () => {
    locks({ [a.uri]: 'restricted' });
    jest
      .spyOn(pdfNative, 'checkPdfPassword')
      .mockImplementation((_uri, password) =>
        Promise.resolve(password === 'owner' ? 'ok' : 'restricted'),
      );
    await run([a]);
    expect(
      screen.getByText(
        '"a.pdf" doesn\'t allow changes. Enter its owner password to use it in this tool.',
      ),
    ).toBeTruthy();
    await submit('user');
    expect(
      screen.getByText(
        "That password opens the PDF but doesn't allow changes. Enter the owner password.",
      ),
    ).toBeTruthy();
    await submit('owner');
    expect(answer).toEqual({ 0: 'owner' });
  });

  it('asks for each locked file in turn', async () => {
    locks({ [a.uri]: 'password', [b.uri]: 'password' });
    jest.spyOn(pdfNative, 'checkPdfPassword').mockResolvedValue('ok');
    await run([a, b]);
    expect(screen.getByText(/"a.pdf" is protected/)).toBeTruthy();
    await submit('one');
    expect(screen.getByText(/"Report.pdf" is protected/)).toBeTruthy();
    expect(screen.getByPlaceholderText('Password')).toHaveProp('value', '');
    await submit('two');
    expect(answer).toEqual({ 0: 'one', 1: 'two' });
  });
});
