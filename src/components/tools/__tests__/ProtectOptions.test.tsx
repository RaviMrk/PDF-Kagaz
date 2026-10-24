import { fireEvent, render, screen } from '@testing-library/react-native';

import { I18nextProvider } from 'react-i18next';

import { initI18n } from '@/i18n';
import { makeRow } from '@/test-utils/fileRows';

import { ProtectOptions } from '../ProtectOptions';

const i18n = initI18n('en');
const row = makeRow({ name: 'a.pdf' });

async function setup() {
  const onRun = jest.fn();
  await render(
    <I18nextProvider i18n={i18n}>
      <ProtectOptions row={row} onRun={onRun} />
    </I18nextProvider>,
  );
  const type = async (label: string, value: string) =>
    await fireEvent.changeText(screen.getByLabelText(label), value);
  return { onRun, type };
}

describe('ProtectOptions', () => {
  it('warns that a forgotten password cannot be recovered', async () => {
    await setup();
    expect(
      screen.getByText(
        "If you forget this password, the PDF can't be opened. PDF Toolkit can't recover it.",
      ),
    ).toBeTruthy();
  });

  it('keeps Run disabled until both fields are filled', async () => {
    const { type } = await setup();
    expect(screen.getByLabelText('Protect')).toBeDisabled();
    await type('New password', 'abcd');
    expect(screen.getByLabelText('Protect')).toBeDisabled();
    await type('Confirm password', 'abcd');
    expect(screen.getByLabelText('Protect')).toBeEnabled();
  });

  it('shows too short after the first attempt and does not run', async () => {
    const { onRun, type } = await setup();
    await type('New password', 'abc');
    await type('Confirm password', 'abc');
    expect(screen.queryByText('Use at least 4 characters')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Protect'));
    expect(screen.getByText('Use at least 4 characters')).toBeTruthy();
    expect(onRun).not.toHaveBeenCalled();
  });

  it('shows a mismatch', async () => {
    const { onRun, type } = await setup();
    await type('New password', 'hunter22');
    await type('Confirm password', 'hunter23');
    await fireEvent.press(screen.getByLabelText('Protect'));
    expect(screen.getByText("The passwords don't match")).toBeTruthy();
    expect(onRun).not.toHaveBeenCalled();
  });

  it('runs with the password when they match', async () => {
    const { onRun, type } = await setup();
    await type('New password', 'hunter22');
    await type('Confirm password', 'hunter22');
    await fireEvent.press(screen.getByLabelText('Protect'));
    expect(onRun).toHaveBeenCalledWith('hunter22');
  });

  it('toggles each field between hidden and shown', async () => {
    await setup();
    expect(screen.getByLabelText('New password').props.secureTextEntry).toBe(true);
    expect(screen.getByLabelText('Confirm password').props.secureTextEntry).toBe(true);
    const toggles = screen.getAllByLabelText('Show password');
    expect(toggles).toHaveLength(2);
    await fireEvent.press(toggles[0]!);
    expect(screen.getByLabelText('New password').props.secureTextEntry).toBe(false);
    expect(screen.getByLabelText('Confirm password').props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByLabelText('Show password'));
    expect(screen.getByLabelText('Confirm password').props.secureTextEntry).toBe(false);
    expect(screen.getAllByLabelText('Hide password')).toHaveLength(2);
  });
});
