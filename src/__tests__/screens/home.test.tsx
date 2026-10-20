import { fireEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import path from 'path';

import { makeRow } from '@/test-utils/fileRows';
import { useFiles } from '@/stores/filesStore';
import { useSettings } from '@/stores/settingsStore';
import { useStorage } from '@/stores/storageStore';

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

  it('opens the Merge placeholder', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/home' });
    await fireEvent.press(screen.getByLabelText('Merge'));
    expect(screen.getByText('Coming soon')).toBeTruthy();
  });
});
