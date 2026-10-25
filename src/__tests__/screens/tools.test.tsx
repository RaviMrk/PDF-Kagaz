import { pdfNative } from '@/services/native/pdfNative';
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

async function renderTools() {
  // RNTL v14: renderRouter's getPathname helper lives on the returned thenable itself.
  const pending = renderRouter(APP_DIR, { initialUrl: '/tools' });
  await pending;
  return { pathname: () => pending.getPathname() };
}

const CARDS = [
  'Merge',
  'Split',
  'Organise pages',
  'Images to PDF',
  'Scan',
  'PDF to images',
  'Make searchable (OCR), coming soon',
  'Compress',
  'Protect with password',
  'Remove password',
  'Add watermark',
  'Add page numbers',
  'Sign PDF',
  'Edit details, coming soon',
];

describe('Tools tab', () => {
  beforeEach(() => {
    useSettings.setState({ onboardingDone: true });
    useStorage.setState({ mode: 'full', roots: [], canRequestFullAccess: true });
    useFiles.setState({ files: [], status: 'idle', requestThumb: jest.fn() });
  });

  it('lists exactly the five groups, in order', async () => {
    await renderTools();
    const headers = screen.getAllByTestId('tool-group-header');
    expect(headers.map((h) => h.props.children)).toEqual([
      'Organise',
      'Convert',
      'Optimise',
      'Security',
      'Edit',
    ]);
    for (const h of headers) expect(h).toHaveProp('accessibilityRole', 'header');
  });

  it('renders exactly the 14 tool cards', async () => {
    await renderTools();
    const cells = screen.getAllByTestId('tool-card');
    expect(cells).toHaveLength(14);
    for (const label of CARDS) expect(screen.getByLabelText(label)).toBeTruthy();
  });

  it('shows every v1.1 tool live except OCR and Edit details', async () => {
    await renderTools();
    const live = ['Compress', 'Protect with password', 'Remove password', 'PDF to images'];
    for (const label of [...live, 'Add watermark', 'Add page numbers', 'Sign PDF']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
      expect(screen.queryByLabelText(`${label}, coming soon`)).toBeNull();
    }
    expect(screen.getByLabelText('Make searchable (OCR), coming soon')).toBeTruthy();
    expect(screen.getByLabelText('Edit details, coming soon')).toBeTruthy();
  });

  it('opens an available tool', async () => {
    const r = await renderTools();
    await fireEvent.press(screen.getByLabelText('Merge'));
    expect(r.pathname()).toBe('/tool/merge');
  });

  it('opens Images to PDF', async () => {
    const r = await renderTools();
    expect(screen.queryByLabelText('Images to PDF, coming soon')).toBeNull();
    expect(screen.queryByLabelText('Scan, coming soon')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Images to PDF'));
    expect(r.pathname()).toBe('/tool/images-to-pdf');
  });

  it('opens the scanner screen', async () => {
    jest.spyOn(pdfNative, 'scanDocument').mockReturnValue(new Promise(() => {}));
    const r = await renderTools();
    await fireEvent.press(screen.getByLabelText('Scan'));
    expect(r.pathname()).toBe('/scan');
  });

  it('does nothing for a tool that is coming soon', async () => {
    const r = await renderTools();
    await fireEvent.press(screen.getByLabelText('Edit details, coming soon'));
    expect(r.pathname()).toBe('/tools');
  });
});
