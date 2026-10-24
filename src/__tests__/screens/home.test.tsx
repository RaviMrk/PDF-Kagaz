import { act, fireEvent, within } from '@testing-library/react-native';
import { StyleSheet, TextInput } from 'react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import path from 'path';

import { pdfNative } from '@/services/native/pdfNative';
import { fakePdf } from '@/test-utils/fakePdf';
import { makeRow } from '@/test-utils/fileRows';
import { useAds } from '@/services/ads/adsStore';
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
    expect(screen.getByLabelText('Compress')).toBeTruthy();
    expect(screen.queryByLabelText('Compress, coming soon')).toBeNull();
    expect(screen.getByLabelText('Images to PDF')).toBeTruthy();
    expect(screen.queryByText('Coming soon')).toBeNull();
  });

  it('opens the scanner from the quick tools', async () => {
    // The scanner stays open, so the screen does not leave on its own.
    jest.spyOn(pdfNative, 'scanDocument').mockReturnValue(new Promise(() => {}));
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

  it('opens Compress from the quick tools', async () => {
    const pending = renderRouter(APP_DIR, { initialUrl: '/home' });
    await pending;
    await fireEvent.press(screen.getByLabelText('Compress'));
    expect(pending.getPathname()).toBe('/tool/compress');
    expect(screen.getByText('Choose a PDF')).toBeTruthy();
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

describe('Home banner', () => {
  beforeEach(() => {
    useSettings.setState({ onboardingDone: true });
    useStorage.setState({ mode: 'full', roots: [], canRequestFullAccess: true });
    useFiles.setState({ files: [], status: 'idle', requestThumb: jest.fn() });
  });
  afterEach(async () => {
    await act(async () => useAds.setState({ status: 'idle', canRequestAds: false }));
  });

  it('shows the advertisement container when ads are ready', async () => {
    useAds.setState({ status: 'ready', canRequestAds: true });
    await renderRouter(APP_DIR, { initialUrl: '/home' });
    const { fakeBannerProps } = jest.requireMock('react-native-google-mobile-ads');
    await act(async () => fakeBannerProps().onAdLoaded());
    expect(screen.getByLabelText('Advertisement')).toBeTruthy();
  });

  it('shows no container and no gap when ads are off', async () => {
    useAds.setState({ status: 'off', canRequestAds: false });
    await renderRouter(APP_DIR, { initialUrl: '/home' });
    expect(screen.queryByLabelText('Advertisement')).toBeNull();
    expect(screen.getByLabelText('Search your PDFs')).toBeTruthy();
  });

  it('places the banner below the scrolling content, never over it', async () => {
    useAds.setState({ status: 'ready', canRequestAds: true });
    await renderRouter(APP_DIR, { initialUrl: '/home' });
    const banner = screen.getByTestId('ad-banner-home');
    const column = banner.parent!;
    const siblings = column.children.filter((c) => typeof c !== 'string');
    // The banner is the last item of a flex column whose first item takes the remaining height
    // and holds the scrolling content, so the scroll viewport ends where the banner starts.
    expect(siblings[siblings.length - 1]).toBe(banner);
    const content = siblings[0] as typeof banner;
    expect(StyleSheet.flatten(content.props.style)).toMatchObject({ flex: 1 });
    expect(within(content).getByLabelText('Search your PDFs')).toBeTruthy();
    expect(StyleSheet.flatten(column.props.style)).toMatchObject({ flex: 1 });
    for (const node of [banner, column]) {
      expect(StyleSheet.flatten(node.props.style).position).not.toBe('absolute');
    }
  });

  it('leaves no container behind when the banner fails to load', async () => {
    useAds.setState({ status: 'ready', canRequestAds: true });
    await renderRouter(APP_DIR, { initialUrl: '/home' });
    expect(screen.getByTestId('ad-banner-home')).toBeTruthy();
    const { fakeBannerProps } = jest.requireMock('react-native-google-mobile-ads');
    await act(async () => fakeBannerProps().onAdFailedToLoad());
    expect(screen.queryByTestId('ad-banner-home')).toBeNull();
    expect(screen.queryByLabelText('Advertisement')).toBeNull();
  });
});
