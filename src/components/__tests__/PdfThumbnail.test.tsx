import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { PdfThumbnail } from '@/components/PdfThumbnail';
import { useFiles } from '@/stores/filesStore';
import { makeRow } from '@/test-utils/fileRows';

const thumbMissing = jest.fn();
const requestThumb = jest.fn();

describe('PdfThumbnail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useFiles.setState({ thumbMissing, requestThumb });
  });

  it('reports a thumbnail file that cannot be loaded (cache cleared) (F1)', async () => {
    const file = makeRow({ name: 'A.pdf', thumbPath: 'file:///cache/thumbs/gone.jpg' });
    await render(<PdfThumbnail file={file} width={48} height={64} />);
    await fireEvent(screen.getByTestId('pdf-thumbnail-image'), 'error', {
      nativeEvent: { error: 'not found' },
    });
    expect(thumbMissing).toHaveBeenCalledWith(file.id);
  });

  it('draws a hairline border so a white page stands out on a white background (F11)', async () => {
    const file = makeRow({ name: 'A.pdf', thumbPath: 'file:///cache/thumbs/a.jpg' });
    await render(<PdfThumbnail file={file} width={48} height={64} />);
    const box = StyleSheet.flatten(screen.getByTestId('pdf-thumbnail').props.style);
    expect(box.borderWidth).toBe(StyleSheet.hairlineWidth);
    expect(box.borderColor).toBeTruthy();
  });
});
