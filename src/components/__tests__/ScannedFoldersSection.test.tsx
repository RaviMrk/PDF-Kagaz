import { fireEvent, render, screen } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';

import { ScannedFoldersSection } from '@/components/ScannedFoldersSection';
import { initI18n } from '@/i18n';
import { useFiles } from '@/stores/filesStore';
import { useStorage } from '@/stores/storageStore';

const DOCS = 'content://com.android.externalstorage.documents/tree/primary%3ADocuments';
const WA = 'content://com.android.externalstorage.documents/tree/primary%3AWhatsApp';

const removeFolder = jest.fn();
const addFolder = jest.fn();
const refresh = jest.fn();
const loadFromCache = jest.fn();

const renderSection = () =>
  render(
    <I18nextProvider i18n={initI18n('en')}>
      <ScannedFoldersSection />
    </I18nextProvider>,
  );

describe('ScannedFoldersSection', () => {
  beforeEach(() => {
    removeFolder.mockReset().mockResolvedValue(undefined);
    addFolder.mockReset().mockResolvedValue(true);
    refresh.mockReset().mockResolvedValue(undefined);
    loadFromCache.mockReset();
    useStorage.setState({
      mode: 'saf',
      roots: [
        { uri: DOCS, label: 'Documents', granted: true },
        { uri: WA, label: 'WhatsApp', granted: false },
      ],
      removeFolder,
      addFolder,
    });
    useFiles.setState({ refresh, loadFromCache });
  });

  it('flags only the root that lost access', async () => {
    await renderSection();
    expect(screen.getAllByText('Access lost — add it again')).toHaveLength(1);
    expect(screen.getByText('Documents')).toBeTruthy();
  });

  it('removes a folder and reloads the cached list', async () => {
    await renderSection();
    await fireEvent.press(screen.getByLabelText('Remove Documents'));
    expect(removeFolder).toHaveBeenCalledWith(DOCS);
    expect(loadFromCache).toHaveBeenCalled();
  });

  it('adds a folder and triggers a full refresh', async () => {
    await renderSection();
    await fireEvent.press(screen.getByLabelText('Add folder'));
    expect(addFolder).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledWith('full');
  });

  it('does not refresh when the picker was cancelled', async () => {
    addFolder.mockResolvedValue(false);
    await renderSection();
    await fireEvent.press(screen.getByLabelText('Add folder'));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows a friendly message when adding fails', async () => {
    addFolder.mockRejectedValue(new Error('content://secret'));
    await renderSection();
    await fireEvent.press(screen.getByLabelText('Add folder'));
    expect(screen.getByText("Couldn't get access. Please try again.")).toBeTruthy();
    expect(screen.queryByText(/secret/)).toBeNull();
  });

  it('shows the empty hint when there are no roots', async () => {
    useStorage.setState({ roots: [] });
    await renderSection();
    expect(screen.getByText('No folders added yet')).toBeTruthy();
  });
});
