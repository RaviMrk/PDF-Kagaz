import { fireEvent, render, screen } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';

import { PasswordDialog } from '@/components/PasswordDialog';
import { initI18n } from '@/i18n';

const i18n = initI18n('en');
const onSubmit = jest.fn();
const onCancel = jest.fn();

function dialog(wrong = false) {
  return (
    <I18nextProvider i18n={i18n}>
      <PasswordDialog
        visible
        fileName="a.pdf"
        wrong={wrong}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    </I18nextProvider>
  );
}

describe('PasswordDialog', () => {
  beforeEach(() => jest.clearAllMocks());

  it('disables Open until a password is typed, then submits it', async () => {
    await render(dialog());
    expect(screen.getByRole('button', { name: 'Open' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Open' }));
    expect(onSubmit).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'secret');
    expect(screen.getByRole('button', { name: 'Open' })).toBeEnabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Open' }));
    expect(onSubmit).toHaveBeenCalledWith('secret');
  });

  it('shows the wrong-password error only when wrong', async () => {
    await render(dialog());
    expect(screen.queryByText('Wrong password. Try again.')).toBeNull();
    await screen.rerender(dialog(true));
    expect(screen.getByText('Wrong password. Try again.')).toBeTruthy();
  });

  it('toggles password visibility', async () => {
    await render(dialog());
    expect(screen.getByPlaceholderText('Password')).toHaveProp('secureTextEntry', true);
    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByPlaceholderText('Password')).toHaveProp('secureTextEntry', false);
    await fireEvent.press(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByPlaceholderText('Password')).toHaveProp('secureTextEntry', true);
  });

  it('cancels from the Cancel button', async () => {
    await render(dialog());
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
