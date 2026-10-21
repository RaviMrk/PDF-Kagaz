import { fireEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import path from 'path';

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
const renderApp = (url = '/') => renderRouter(APP_DIR, { initialUrl: url });

const requestFullAccess = jest.fn();
const addFolder = jest.fn();

async function toLastSlide() {
  await fireEvent.press(screen.getByLabelText('Next'));
  await fireEvent.press(screen.getByLabelText('Next'));
}

// Home's content depends on storage access, so assert the tab shell instead of Home's body.
function expectOnHomeTab() {
  expect(screen.getAllByLabelText('Files').length).toBeGreaterThan(0);
  expect(screen.queryByLabelText('Not now')).toBeNull();
}

describe('onboarding', () => {
  beforeEach(() => {
    requestFullAccess.mockReset().mockResolvedValue(true);
    addFolder.mockReset().mockResolvedValue(true);
    useSettings.setState({ theme: 'system', onboardingDone: false });
    useStorage.setState({
      mode: 'none',
      roots: [],
      canRequestFullAccess: true,
      requestFullAccess,
      addFolder,
    });
    useFiles.setState({ refresh: jest.fn().mockResolvedValue(undefined) });
  });

  it('starts on the first slide when onboarding is not done', async () => {
    await renderApp();
    expect(screen.getByText('All your PDFs in one place')).toBeTruthy();
  });

  it('reaches the permission slide after two Next presses', async () => {
    await renderApp();
    await toLastSlide();
    expect(screen.getByLabelText('Allow access to all files')).toBeTruthy();
    expect(screen.getByLabelText('Pick folders instead')).toBeTruthy();
  });

  it('Skip jumps to the permission slide', async () => {
    await renderApp();
    await fireEvent.press(screen.getByLabelText('Skip'));
    expect(screen.getByText('Find your PDFs')).toBeTruthy();
  });

  it('"Not now" completes onboarding and opens Home', async () => {
    await renderApp();
    await toLastSlide();
    await fireEvent.press(screen.getByLabelText('Not now'));
    expect(useSettings.getState().onboardingDone).toBe(true);
    expectOnHomeTab();
  });

  it('hides the grant button when full access cannot be requested', async () => {
    useStorage.setState({ canRequestFullAccess: false });
    await renderApp();
    await toLastSlide();
    expect(screen.queryByLabelText('Allow access to all files')).toBeNull();
    expect(screen.getByLabelText('Pick folders instead')).toBeTruthy();
  });

  it('a denied permission still lands on Home', async () => {
    requestFullAccess.mockResolvedValue(false);
    await renderApp();
    await toLastSlide();
    await fireEvent.press(screen.getByLabelText('Allow access to all files'));
    expect(requestFullAccess).toHaveBeenCalled();
    expect(useSettings.getState().onboardingDone).toBe(true);
    expectOnHomeTab();
  });

  it('a failing folder pick shows a friendly message and stays usable', async () => {
    addFolder.mockRejectedValue(new Error('content://secret/path'));
    await renderApp();
    await toLastSlide();
    await fireEvent.press(screen.getByLabelText('Pick folders instead'));
    expect(screen.getByText("Couldn't get access. You can try again from Settings.")).toBeTruthy();
    expect(screen.queryByText(/secret/)).toBeNull();
    await fireEvent.press(screen.getByLabelText('Not now'));
    expectOnHomeTab();
  });
});
