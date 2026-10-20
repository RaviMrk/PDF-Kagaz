import { fireEvent, render, screen } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';

import SettingsScreen from '../../../app/(tabs)/settings';
import { initI18n } from '@/i18n';
import { useFiles } from '@/stores/filesStore';
import { useStorage } from '@/stores/storageStore';

const requestFullAccess = jest.fn();
const addFolder = jest.fn();
const removeFolder = jest.fn();
const refresh = jest.fn();
const ERROR = "Couldn't get access. Please try again.";

const renderSettings = () =>
  render(
    <I18nextProvider i18n={initI18n('en')}>
      <SettingsScreen />
    </I18nextProvider>,
  );

describe('Settings storage access', () => {
  beforeEach(() => {
    requestFullAccess.mockReset().mockResolvedValue(true);
    addFolder.mockReset().mockResolvedValue(true);
    removeFolder.mockReset().mockResolvedValue(undefined);
    refresh.mockReset().mockResolvedValue(undefined);
    useStorage.setState({
      mode: 'none',
      roots: [],
      canRequestFullAccess: true,
      requestFullAccess,
      addFolder,
      removeFolder,
    });
    useFiles.setState({ refresh, loadFromCache: jest.fn() });
  });

  it.each([
    ['full', 'All files'],
    ['saf', 'Selected folders'],
    ['none', 'No access'],
  ] as const)('shows the mode text for %s', async (mode, text) => {
    useStorage.setState({ mode });
    await renderSettings();
    expect(screen.getByText(text)).toBeTruthy();
  });

  it('offers the grant button only when mode is not full and it can be requested', async () => {
    const { unmount } = await renderSettings();
    expect(screen.getByLabelText('Allow access to all files')).toBeTruthy();
    await unmount();

    useStorage.setState({ mode: 'full' });
    const second = await renderSettings();
    expect(screen.queryByLabelText('Allow access to all files')).toBeNull();
    await second.unmount();

    useStorage.setState({ mode: 'saf', canRequestFullAccess: false });
    await renderSettings();
    expect(screen.queryByLabelText('Allow access to all files')).toBeNull();
  });

  it('a granted result triggers a full refresh', async () => {
    await renderSettings();
    await fireEvent.press(screen.getByLabelText('Allow access to all files'));
    expect(refresh).toHaveBeenCalledWith('full');
  });

  it('a rejected request shows the friendly error without any path text', async () => {
    requestFullAccess.mockRejectedValue(new Error('content://secret/path'));
    await renderSettings();
    await fireEvent.press(screen.getByLabelText('Allow access to all files'));
    expect(screen.getByText(ERROR)).toBeTruthy();
    expect(screen.queryByText(/secret/)).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('still offers Add folder with mode none, no roots and no full-access option', async () => {
    useStorage.setState({ canRequestFullAccess: false });
    await renderSettings();
    expect(screen.queryByLabelText('Allow access to all files')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Add folder'));
    expect(addFolder).toHaveBeenCalled();
  });

  it('keeps Add folder after removing the last folder', async () => {
    const uri = 'content://x/Documents';
    removeFolder.mockImplementation(async () => {
      useStorage.setState({ mode: 'none', roots: [] });
    });
    useStorage.setState({ mode: 'saf', roots: [{ uri, label: 'Documents', granted: true }] });
    await renderSettings();
    await fireEvent.press(screen.getByLabelText('Remove Documents'));
    expect(screen.getByLabelText('Add folder')).toBeTruthy();
  });
});
