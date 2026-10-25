import { act, fireEvent } from '@testing-library/react-native';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { router } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Alert } from 'react-native';
import path from 'path';

import type { IndexDb } from '@/services/index/fileIndexRepo';
import { pdfNative } from '@/services/native/pdfNative';
import { useFiles } from '@/stores/filesStore';
import { useSettings } from '@/stores/settingsStore';
import { useSignatures } from '@/stores/signaturesStore';
import { useStorage } from '@/stores/storageStore';
import { fakeSignaturePad } from '@/test-utils/fakeSignaturePad';

jest.setTimeout(20000);

let mockDb: IndexDb;
jest.mock('@/db/client', () => ({ getDb: () => mockDb }));
jest.mock('@/db/useDatabaseReady', () => ({
  useDatabaseReady: () => ({ success: true, error: undefined }),
}));
jest.mock('@/services/files/useFileIndexLifecycle', () => ({ useFileIndexLifecycle: jest.fn() }));

const APP_DIR = path.join(__dirname, '../../../app');
const sig = (n: number) => ({
  uri: `file:///data/files/signatures/sig-${n}-abc123.png`,
  width: 300,
  height: 100,
});

async function open() {
  const pending = renderRouter(APP_DIR, { initialUrl: '/tools' });
  await pending;
  await act(async () => {});
  await act(async () => router.push('/signature'));
  await act(async () => {});
  return { pathname: () => pending.getPathname() };
}
const press = async (label: string | RegExp) => {
  await fireEvent.press(screen.getByLabelText(label));
  await act(async () => {});
};
const disabled = (label: string) =>
  screen.getByLabelText(label).props.accessibilityState?.disabled === true;

describe('signature screen', () => {
  let alert: jest.SpyInstance;
  let back: jest.SpyInstance;
  let deleteFile: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = drizzle(new Database(':memory:'));
    migrate(mockDb, { migrationsFolder: 'src/db/migrations' });
    useSignatures.setState({ items: [] });
    useSettings.setState({ onboardingDone: true });
    useStorage.setState({ mode: 'full', roots: [], canRequestFullAccess: true });
    useFiles.setState({ files: [], status: 'idle', requestThumb: jest.fn() });
    fakeSignaturePad.reset();
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    back = jest.spyOn(router, 'back');
    deleteFile = jest.spyOn(pdfNative, 'deleteSignatureFile').mockResolvedValue(undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('labels the pad and every control', async () => {
    await open();
    expect(
      screen.getByLabelText('Signature pad. Draw your signature with one finger.'),
    ).toBeTruthy();
    expect(screen.getByText('Your signature')).toBeTruthy();
    expect(screen.getByLabelText('Back')).toBeTruthy();
    expect(screen.getByLabelText('Black')).toBeTruthy();
    expect(screen.getByLabelText('Clear')).toBeTruthy();
    expect(screen.getByText('No saved signatures yet')).toBeTruthy();
    expect(fakeSignaturePad.props?.inkColor).toBe('#1a1a1a');
  });

  it('switches the ink to blue', async () => {
    await open();
    await press('Blue');
    expect(fakeSignaturePad.props?.inkColor).toBe('#0d47a1');
  });

  it('enables Save once something is drawn, saves and goes back', async () => {
    await open();
    expect(disabled('Save signature')).toBe(true);
    await act(async () => fakeSignaturePad.change(false));
    expect(disabled('Save signature')).toBe(false);
    await press('Save signature');
    expect(fakeSignaturePad.exportPng).toHaveBeenCalledTimes(1);
    expect(useSignatures.getState().items).toHaveLength(1);
    expect(useSignatures.getState().items[0]!.pngPath).toBe(sig(1).uri);
    expect(back).toHaveBeenCalled();
  });

  it('Clear clears the pad and disables Save again', async () => {
    await open();
    await act(async () => fakeSignaturePad.change(false));
    await press('Clear');
    expect(fakeSignaturePad.clear).toHaveBeenCalled();
    await act(async () => fakeSignaturePad.change(true));
    expect(disabled('Save signature')).toBe(true);
  });

  it('deletes a saved signature after confirming', async () => {
    useSignatures.getState().save(sig(7));
    await open();
    expect(screen.getByText(/^Signature saved /)).toBeTruthy();
    await press('Delete signature');
    expect(alert).toHaveBeenCalledWith(
      'Delete this signature?',
      'It will be removed from this phone.',
      expect.any(Array),
    );
    const buttons = alert.mock.calls[0]![2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((b) => b.text === 'Delete')!.onPress!());
    expect(useSignatures.getState().items).toEqual([]);
    expect(deleteFile).toHaveBeenCalledWith(sig(7).uri);
    expect(screen.getByText('No saved signatures yet')).toBeTruthy();
  });

  it('shows the limit copy at 10 signatures and stays', async () => {
    for (let i = 0; i < 10; i++) useSignatures.getState().save(sig(100 + i));
    await open();
    await act(async () => fakeSignaturePad.change(false));
    await press('Save signature');
    expect(screen.getByText('You can keep up to 10 signatures. Delete one first.')).toBeTruthy();
    expect(useSignatures.getState().items).toHaveLength(10);
    expect(back).not.toHaveBeenCalled();
  });

  it('shows the failure copy when the export fails', async () => {
    fakeSignaturePad.exportPng.mockRejectedValue(new Error('io'));
    await open();
    await act(async () => fakeSignaturePad.change(false));
    await press('Save signature');
    expect(screen.getByText("Couldn't save the signature")).toBeTruthy();
    expect(back).not.toHaveBeenCalled();
  });
});
