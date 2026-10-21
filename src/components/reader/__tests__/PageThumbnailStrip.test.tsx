import { act, render as rtlRender, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';

import { PageThumbnailStrip } from '@/components/reader/PageThumbnailStrip';
import { initI18n } from '@/i18n';

const i18n = initI18n('en');
const render = (ui: ReactElement) => rtlRender(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);

type Done = (uri: string | null) => void;

const mockLoader = {
  get: jest.fn<string | null | undefined, [number]>(),
  request: jest.fn<void, [number, Done]>(),
  cancelPending: jest.fn(),
};
jest.mock('@/services/reader/pageThumbLoader', () => ({
  createPageThumbLoader: () => mockLoader,
}));

describe('PageThumbnailStrip', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows a page that settled between its render and its effect (recycled item)', async () => {
    // The page is not cached when the item renders, but is by the time its effect runs: the
    // loader answers a request for it synchronously from cache.
    const seen = new Set<number>();
    mockLoader.get.mockImplementation((page) => {
      if (!seen.has(page)) {
        seen.add(page);
        return undefined;
      }
      return `file:///thumbs/${page}.jpg`;
    });
    mockLoader.request.mockImplementation((page, done) => done(`file:///thumbs/${page}.jpg`));
    await render(
      <PageThumbnailStrip
        fileUri="file:///a.pdf"
        pageCount={1}
        currentPage={1}
        onSelect={jest.fn()}
      />,
    );
    await act(async () => {});
    expect(screen.getByRole('button', { name: 'Page 1' })).not.toHaveTextContent('1');
  });

  it('asks again for a page that failed earlier when it binds again', async () => {
    mockLoader.get.mockReturnValue(undefined);
    const { unmount } = await render(
      <PageThumbnailStrip
        fileUri="file:///a.pdf"
        pageCount={1}
        currentPage={1}
        onSelect={jest.fn()}
      />,
    );
    await act(async () => {});
    expect(mockLoader.request).toHaveBeenCalledTimes(1);
    await unmount();
    await render(
      <PageThumbnailStrip
        fileUri="file:///a.pdf"
        pageCount={1}
        currentPage={1}
        onSelect={jest.fn()}
      />,
    );
    await act(async () => {});
    expect(mockLoader.request).toHaveBeenCalledTimes(2);
  });
});
