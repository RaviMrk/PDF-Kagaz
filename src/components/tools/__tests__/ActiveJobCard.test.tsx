import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { I18nextProvider } from 'react-i18next';

import { ActiveJobCard } from '@/components/tools/ActiveJobCard';
import { initI18n } from '@/i18n';
import { useToolJobs } from '@/stores/toolJobStore';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const finished = (ok: boolean, seen: boolean) => ({
  jobId: 'j2',
  toolId: 'merge' as const,
  outcome: ok
    ? { ok: true as const, outputs: [] }
    : { ok: false as const, failure: 'io' as const, inputIndex: null, outputs: [] },
  seen,
});

async function renderCard() {
  return render(
    <I18nextProvider i18n={initI18n('en')}>
      <ActiveJobCard />
    </I18nextProvider>,
  );
}

describe('ActiveJobCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useToolJobs.setState({ active: null, last: null });
  });

  it('shows the running tool with its percent and opens the result', async () => {
    useToolJobs.setState({
      active: { jobId: 'j1', toolId: 'merge', phase: 'processing', fraction: 0.42 },
    });
    await renderCard();
    expect(screen.getByText('Merge: 42%')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('View'));
    expect(router.push).toHaveBeenCalledWith('/result?jobId=j1');
  });

  it('shows an unseen failure', async () => {
    useToolJobs.setState({ last: finished(false, false) });
    await renderCard();
    expect(screen.getByText("Merge couldn't finish")).toBeTruthy();
  });

  it('shows an unseen success', async () => {
    useToolJobs.setState({ last: finished(true, false) });
    await renderCard();
    expect(screen.getByText('Merge finished')).toBeTruthy();
  });

  it('shows nothing once the result was seen, and disappears when it is', async () => {
    useToolJobs.setState({ last: finished(true, false) });
    await renderCard();
    await act(async () => {
      useToolJobs.getState().markSeen('j2');
    });
    expect(screen.queryByText('Merge finished')).toBeNull();
    expect(screen.queryByLabelText('View')).toBeNull();
  });
});
