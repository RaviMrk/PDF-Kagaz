import { render, screen } from '@testing-library/react-native';
import { createRef } from 'react';

import {
  PdfView,
  toOutline,
  type PdfViewHandle,
  type PdfViewProps,
} from '@/components/reader/PdfView';
import { fakePdf } from '@/test-utils/fakePdf';

const URI = 'file:///storage/emulated/0/Download/a.pdf';

function props(overrides: Partial<PdfViewProps> = {}): PdfViewProps {
  return {
    fileUri: URI,
    password: '',
    initialPage: 12,
    horizontal: false,
    onLoad: jest.fn(),
    onPageChange: jest.fn(),
    onError: jest.fn(),
    onTap: jest.fn(),
    ...overrides,
  };
}

describe('PdfView', () => {
  beforeEach(() => fakePdf.reset());

  it('passes the file uri, start page, password and zoom limits to the native view', async () => {
    await render(<PdfView {...props()} />);
    expect(screen.getByTestId('pdf-native')).toBeTruthy();
    const p = fakePdf.lastProps();
    expect(p.source.uri).toBe(URI);
    expect(p.page).toBe(12);
    expect(p.password).toBe('');
    expect(p.maxScale).toBe(4);
    expect(p.minScale).toBe(1);
    expect(p.enablePaging).toBe(false);
    expect(p.fitPolicy).toBe(0);
  });

  it('pages horizontally and fits both dimensions in horizontal mode', async () => {
    await render(<PdfView {...props({ horizontal: true })} />);
    expect(fakePdf.lastProps().enablePaging).toBe(true);
    expect(fakePdf.lastProps().fitPolicy).toBe(2);
  });

  it('reports the page count and a 1-based outline on load', async () => {
    const onLoad = jest.fn();
    await render(<PdfView {...props({ onLoad })} />);
    fakePdf.lastProps().onLoadComplete(200, '/p', { width: 1, height: 1 }, [
      {
        title: 'Chapter 1',
        pageIdx: 0,
        mNativePtr: 1,
        children: [{ title: 'Section 1.1', pageIdx: 1, mNativePtr: 2, children: [] }],
      },
    ]);
    expect(onLoad).toHaveBeenCalledWith({
      pageCount: 200,
      outline: [
        {
          title: 'Chapter 1',
          page: 1,
          children: [{ title: 'Section 1.1', page: 2, children: [] }],
        },
      ],
    });
  });

  it('treats a missing or non-array outline as empty', () => {
    expect(toOutline(undefined)).toEqual([]);
    expect(toOutline('x')).toEqual([]);
  });

  it('maps viewer errors to password or invalid', async () => {
    const onError = jest.fn();
    await render(<PdfView {...props({ onError })} />);
    fakePdf.lastProps().onError(new Error('Password required or incorrect password.'));
    expect(onError).toHaveBeenLastCalledWith('password');
    fakePdf.lastProps().onError(new Error('cannot create document'));
    expect(onError).toHaveBeenLastCalledWith('invalid');
  });

  it('forwards page changes and single taps', async () => {
    const onPageChange = jest.fn();
    const onTap = jest.fn();
    await render(<PdfView {...props({ onPageChange, onTap })} />);
    fakePdf.lastProps().onPageChanged(57, 200);
    expect(onPageChange).toHaveBeenCalledWith(57, 200);
    fakePdf.lastProps().onPageSingleTap(3, 0, 0);
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('jumps to a page through the ref', async () => {
    const ref = createRef<PdfViewHandle>();
    await render(<PdfView ref={ref} {...props()} />);
    ref.current!.goToPage(57);
    expect(fakePdf.setPage).toHaveBeenCalledWith(57);
  });

  it('re-renders the native view only when the uri, password or orientation changes', async () => {
    await render(<PdfView {...props()} />);
    expect(fakePdf.renders).toBe(1);
    await screen.rerender(<PdfView {...props({ initialPage: 30 })} />);
    expect(fakePdf.renders).toBe(1);
    await screen.rerender(<PdfView {...props({ initialPage: 30, password: 'secret' })} />);
    expect(fakePdf.renders).toBe(2);
    await screen.rerender(
      <PdfView {...props({ initialPage: 30, password: 'secret', horizontal: true })} />,
    );
    expect(fakePdf.renders).toBe(3);
  });

  it('calls the newest callbacks after a callback-only re-render without re-rendering the native view', async () => {
    const first = props();
    const second = props();
    await render(<PdfView {...first} />);
    await screen.rerender(<PdfView {...second} />);
    expect(fakePdf.renders).toBe(1);
    const p = fakePdf.lastProps();
    p.onLoadComplete(3, '/p', { width: 1, height: 1 }, undefined);
    p.onPageChanged(2, 3);
    p.onError(new Error('cannot create document'));
    p.onPageSingleTap(1, 0, 0);
    expect(second.onLoad).toHaveBeenCalledWith({ pageCount: 3, outline: [] });
    expect(second.onPageChange).toHaveBeenCalledWith(2, 3);
    expect(second.onError).toHaveBeenCalledWith('invalid');
    expect(second.onTap).toHaveBeenCalledTimes(1);
    for (const fn of [first.onLoad, first.onPageChange, first.onError, first.onTap]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it('reloads at the initialPage of the render that changes the orientation', async () => {
    await render(<PdfView {...props({ initialPage: 1 })} />);
    await screen.rerender(<PdfView {...props({ initialPage: 30 })} />);
    expect(fakePdf.lastProps().page).toBe(1);
    await screen.rerender(<PdfView {...props({ initialPage: 30, horizontal: true })} />);
    expect(fakePdf.renders).toBe(2);
    expect(fakePdf.lastProps().page).toBe(30);
  });

  it('refuses a non-file uri', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(render(<PdfView {...props({ fileUri: 'content://x/1' })} />)).rejects.toThrow(
      'PdfView needs a file:// uri',
    );
    jest.mocked(console.error).mockRestore();
  });
});
