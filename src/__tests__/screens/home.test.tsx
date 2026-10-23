import { act, fireEvent } from '@testing-library/react-native';
import { TextInput } from 'react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import path from 'path';

import { fakePdf } from '@/test-utils/fakePdf';
import { makeRow } from '@/test-utils/fileRows';
import { useFiles } from '@/stores/filesStore';
import { useSettings } from '@/stores/settingsStore';
import { useStorage } from '@/stores/storageStore';

// Router-rendering suites can exceed jest's 5 s default under load.
jest.setTimeout(20000);

jest.mock('@/db/useDatabaseReady', () => ({
  useDatabaseReady: () => ({ success: true, error: undefined }),
}));
jest.mock('@/services/files/useFileIndexLifecycle', () => ({ useFileIndexLifecycle: jest.fn() }));

const APP_DIR = path.join(__dirname, '../../../app');

describe('Home tab', () => {
  beforeEach(() => {
    useSettings.setState({ onboardingDone: true });
    useStorage.setState({ mode: 'full', roots: [], canRequestFullAccess: true });
    useFiles.setState({
      files: [
        makeRow({ name: 'Old.pdf', modifiedAt: 1000 }),
        makeRow({ name: 'Opened.pdf', modifiedAt: 500, lastOpenedAt: 9000 }),
      ],
      status: 'idle',
      requestThumb: jest.fn(),
    });
  });

  it('shows opened files first in Recent', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/home' });
    expect(screen.getByText('Recent')).toBeTruthy();
    const names = screen.getAllByTestId('recent-card-name').map((n) => n.props.children);
    expect(names).toEqual(['Opened.pdf', 'Old.pdf']);
  });

  it('hides Recent when there are no files', async () => {
    useFiles.setState({ files: [] });
    await renderRouter(APP_DIR, { initialUrl: '/home' });
    expect(screen.queryByText('Recent')).toBeNull();
  });

  it('opens Files with the search input focused', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/home' });
    await fireEvent.press(screen.getByLabelText('Search your PDFs'));
    const input = screen.getByPlaceholderText('Search PDFs');
    expect(input).toBeTruthy();
    expect(input).toHaveProp('autoFocus', true);
  });

  it('opens a recent file in the reader and marks it opened only once it has loaded', async () => {
    const markOpened = jest.fn();
    useFiles.setState({ markOpened });
    await renderRouter(APP_DIR, { initialUrl: '/home' });
    await fireEvent.press(screen.getByText('Old.pdf'));
    await act(async () => {});
    expect(screen.getByTestId('pdf-native')).toBeTruthy();
    expect(markOpened).not.toHaveBeenCalled();
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    await act(async () => {
      fakePdf.lastProps().onLoadComplete(3, '/p', { width: 1, height: 1 }, []);
    });
    expect(markOpened).toHaveBeenCalledTimes(1);
    expect(markOpened).toHaveBeenCalledWith('id-Old.pdf');
    log.mockRestore();
  });

  it('shows the quick tools from the registry', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/home' });
    expect(screen.getByLabelText('Scan')).toBeTruthy();
    expect(screen.getByLabelText('Merge')).toBeTruthy();
    expect(screen.getByLabelText('Compress, coming soon')).toBeTruthy();
    expect(screen.getByLabelText('Images to PDF')).toBeTruthy();
    expect(screen.getAllByText('Coming soon')).toHaveLength(1);
  });

  it('opens the scanner from the quick tools', async () => {
    const pending = renderRouter(APP_DIR, { initialUrl: '/home' });
    await pending;
    await fireEvent.press(screen.getByLabelText('Scan'));
    expect(pending.getPathname()).toBe('/scan');
  });

  it('opens Images to PDF from the quick tools', async () => {
    const pending = renderRouter(APP_DIR, { initialUrl: '/home' });
    await pending;
    await fireEvent.press(screen.getByLabelText('Images to PDF'));
    expect(pending.getPathname()).toBe('/tool/images-to-pdf');
  });

  it('opens Merge from the quick tools', async () => {
    const pending = renderRouter(APP_DIR, { initialUrl: '/home' });
    await pending;
    await fireEvent.press(screen.getByLabelText('Merge'));
    expect(pending.getPathname()).toBe('/tool/merge');
    expect(screen.getByText('Choose PDFs')).toBeTruthy();
  });
});

describe('Home without storage access', () => {
  beforeEach(() => {
    useSettings.setState({ onboardingDone: true });
    useStorage.setState({ mode: 'none', roots: [], canRequestFullAccess: true });
    useFiles.setState({
      files: [
        makeRow({ name: 'Scanned.pdf', lastOpenedAt: 5000 }),
        makeRow({
          name: 'Shared.pdf',
          uri: 'content://x/1',
          folder: '',
          parentUri: '',
          source: 'intent',
          lastOpenedAt: 9000,
        }),
        makeRow({ name: 'Unopened.pdf', source: 'intent', folder: '', parentUri: '' }),
      ],
      status: 'idle',
      requestThumb: jest.fn(),
    });
  });

  it('shows the explainer and only opened shared files in Recent', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/home' });
    expect(screen.getByText(/needs access to your files/)).toBeTruthy();
    expect(screen.getByText('Recent')).toBeTruthy();
    const names = screen.getAllByTestId('recent-card-name').map((n) => n.props.children);
    expect(names).toEqual(['Shared.pdf']);
  });

  it('opens a recent shared file in the reader', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/home' });
    await fireEvent.press(screen.getByText('Shared.pdf'));
    await act(async () => {});
    expect(screen.getByTestId('pdf-native')).toBeTruthy();
  });

  it('hides Recent when nothing was opened', async () => {
    useFiles.setState({ files: [makeRow({ name: 'Scanned.pdf', lastOpenedAt: 5000 })] });
    await renderRouter(APP_DIR, { initialUrl: '/home' });
    expect(screen.getByText(/needs access to your files/)).toBeTruthy();
    expect(screen.queryByText('Recent')).toBeNull();
  });
});

describe('Home search refocus', () => {
  it('focuses the Files search box every time, not only the first', async () => {
    useSettings.setState({ onboardingDone: true });
    useStorage.setState({ mode: 'full', roots: [], canRequestFullAccess: true });
    useFiles.setState({
      files: [makeRow({ name: 'A.pdf' })],
      status: 'idle',
      requestThumb: jest.fn(),
    });
    await renderRouter(APP_DIR, { initialUrl: '/home' });
    await fireEvent.press(screen.getByLabelText('Search your PDFs'));
    // The tab stays mounted, so the same input must be focused again.
    const focus = jest.spyOn(TextInput.State, 'focusTextInput');
    await fireEvent.press(screen.getAllByLabelText('Home')[0]!);
    await fireEvent.press(screen.getByLabelText('Search your PDFs'));
    expect(focus).toHaveBeenCalledTimes(1);
  });
});
