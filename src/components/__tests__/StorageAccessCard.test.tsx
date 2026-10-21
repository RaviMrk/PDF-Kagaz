import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';

import { StorageAccessCard } from '@/components/StorageAccessCard';
import { initI18n } from '@/i18n';
import { useFiles } from '@/stores/filesStore';
import { useStorage } from '@/stores/storageStore';

describe('StorageAccessCard', () => {
  it('marks both buttons disabled and shows a busy indicator while waiting (F9)', async () => {
    let finish!: (granted: boolean) => void;
    const requestFullAccess = jest.fn(() => new Promise<boolean>((r) => (finish = r)));
    useStorage.setState({ canRequestFullAccess: true, requestFullAccess, addFolder: jest.fn() });
    useFiles.setState({ refresh: jest.fn(() => Promise.resolve()) });
    await render(
      <I18nextProvider i18n={initI18n('en')}>
        <StorageAccessCard />
      </I18nextProvider>,
    );
    expect(screen.queryByLabelText('Waiting for access…')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Allow access to all files'));
    expect(screen.getByLabelText('Allow access to all files').props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
    expect(screen.getByLabelText('Pick folders instead').props.accessibilityState).toEqual({
      disabled: true,
      busy: false,
    });
    expect(screen.getByLabelText('Waiting for access…')).toBeTruthy();
    await act(async () => finish(false));
    expect(screen.getByLabelText('Allow access to all files').props.accessibilityState).toEqual({
      disabled: false,
      busy: false,
    });
    expect(screen.queryByLabelText('Waiting for access…')).toBeNull();
  });
});
