import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { I18nextProvider } from 'react-i18next';
import { Image } from 'react-native';

import type { SignatureRow } from '@/db/schema';
import { initI18n } from '@/i18n';
import { openToolPreview } from '@/services/tools/toolPreview';
import { useSignatures } from '@/stores/signaturesStore';
import { makeRow } from '@/test-utils/fileRows';

import { SignOptions } from '../SignOptions';

jest.mock('@/services/tools/toolPreview', () => ({ openToolPreview: jest.fn() }));
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { push: jest.fn() },
    // Focus = mount: the effect runs again whenever its callback changes.
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});

const i18n = initI18n('en');
const row = makeRow({ name: 'a.pdf' });
const sig = (id: number, createdAt: number): SignatureRow => ({
  id,
  pngPath: `file:///files/signatures/sig-${createdAt}-abc12${id}.png`,
  createdAt,
});

async function setup(items: SignatureRow[]) {
  jest.mocked(openToolPreview).mockResolvedValue({
    ok: true,
    preview: { fileUri: 'file:///cache/p.pdf', pageCount: 4, close: jest.fn() },
  });
  const load = jest.fn();
  useSignatures.setState({ items, load });
  const onRun = jest.fn();
  await render(
    <I18nextProvider i18n={i18n}>
      <SignOptions row={row} onRun={onRun} />
    </I18nextProvider>,
  );
  await act(async () => {});
  const press = async (label: string) => {
    await fireEvent.press(screen.getByLabelText(label));
    await act(async () => {});
  };
  return { onRun, press, load };
}

beforeEach(() => {
  jest.clearAllMocks();
  (jest.spyOn(Image, 'getSize') as jest.SpyInstance).mockResolvedValue({ width: 200, height: 100 });
});

describe('SignOptions', () => {
  it('without signatures asks to draw one first', async () => {
    const { press, load } = await setup([]);
    expect(load).toHaveBeenCalled();
    expect(screen.getByText('No saved signature yet. Draw one to start.')).toBeTruthy();
    expect(screen.getByLabelText('Sign PDF')).toBeDisabled();
    await press('Draw new');
    expect(router.push).toHaveBeenCalledWith('/signature');
  });

  it('places a chosen signature and runs with it', async () => {
    const { onRun, press } = await setup([sig(9, 2000), sig(7, 1000)]);
    expect(screen.getByLabelText('Sign PDF')).toBeDisabled();
    const second = screen.getAllByRole('radio', { name: /^Signature saved/ })[1]!;
    await fireEvent.press(second);
    await act(async () => {});
    expect(second).toBeChecked();
    expect(Image.getSize).toHaveBeenLastCalledWith(sig(7, 1000).pngPath);
    await press('Add to page');
    expect(screen.getByText('Signature on page 1')).toBeTruthy();
    await press('Sign PDF');
    expect(onRun).toHaveBeenCalledWith([
      { signatureId: 7, page: 1, cx: 0.72, cy: 0.85, width: 0.3 },
    ]);
  });

  it('Remove empties the list and disables Run', async () => {
    const { press } = await setup([sig(7, 1000)]);
    await press('Add to page');
    expect(screen.getByLabelText('Sign PDF')).toBeEnabled();
    await press('Remove signature from page 1');
    expect(screen.queryByText('Signature on page 1')).toBeNull();
    expect(screen.getByLabelText('Sign PDF')).toBeDisabled();
  });

  it('places on the page chosen in the placer', async () => {
    const { onRun, press } = await setup([sig(7, 1000)]);
    await press('Next page');
    await press('Next page');
    await press('Add to page');
    expect(screen.getByText('Signature on page 3')).toBeTruthy();
    await press('Sign PDF');
    expect(onRun).toHaveBeenCalledWith([expect.objectContaining({ signatureId: 7, page: 3 })]);
  });

  it('selects the newest signature when one is added', async () => {
    await setup([sig(7, 1000)]);
    await act(async () => {
      useSignatures.setState({ items: [sig(8, 3000), sig(7, 1000)] });
    });
    expect(screen.getAllByRole('radio', { name: /^Signature saved/ })[0]).toBeChecked();
  });

  it('stops at 50 signatures', async () => {
    const { press } = await setup([sig(7, 1000)]);
    for (let i = 0; i < 50; i++) await press('Add to page');
    expect(screen.getByText('You can place up to 50 signatures')).toBeTruthy();
    expect(screen.getByLabelText('Add to page')).toBeDisabled();
    expect(screen.getAllByText(/^Signature on page/)).toHaveLength(50);
  });
});
