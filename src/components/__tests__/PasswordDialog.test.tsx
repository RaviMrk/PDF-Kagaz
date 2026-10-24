import { fireEvent, render, screen } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';

import { PasswordDialog } from '@/components/PasswordDialog';
import { initI18n } from '@/i18n';

const i18n = initI18n('en');
const onSubmit = jest.fn();
const onCancel = jest.fn();

type Extra = { body?: string; submitLabel?: string; errorText?: string | null };

function dialog(wrong = false, extra: Extra = {}) {
  return (
    <I18nextProvider i18n={i18n}>
      <PasswordDialog
        visible
        fileName="a.pdf"
        wrong={wrong}
        onSubmit={onSubmit}
        onCancel={onCancel}
        {...extra}
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
  it('keeps the reader copy by default', async () => {
    await render(dialog());
    expect(screen.getByText('"a.pdf" is protected. Enter its password to open it.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy();
  });

  it('takes its body and submit label from the caller', async () => {
    await render(dialog(false, { body: 'Use it here', submitLabel: 'Use' }));
    expect(screen.getByText('Use it here')).toBeTruthy();
    expect(screen.queryByText(/Enter its password to open it/)).toBeNull();
    await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'secret');
    await fireEvent.press(screen.getByRole('button', { name: 'Use' }));
    expect(onSubmit).toHaveBeenCalledWith('secret');
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
  });

  it('shows the given error text instead of wrong-password when wrong', async () => {
    await render(dialog(false, { errorText: 'Needs the owner password' }));
    expect(screen.queryByText('Needs the owner password')).toBeNull();
    await screen.rerender(dialog(true, { errorText: 'Needs the owner password' }));
    expect(screen.getByText('Needs the owner password')).toBeTruthy();
    expect(screen.queryByText('Wrong password. Try again.')).toBeNull();
    await screen.rerender(dialog(true, { errorText: null }));
    expect(screen.getByText('Wrong password. Try again.')).toBeTruthy();
  });
});
