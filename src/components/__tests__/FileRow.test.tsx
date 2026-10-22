import { render, screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';

import { FileRow } from '@/components/FileRow';
import { makeRow } from '@/test-utils/fileRows';

jest.mock('@/components/PdfThumbnail', () => ({ PdfThumbnail: () => null }));

const row = makeRow({ name: 'Zebra.pdf' });

function Harness({ onToggle }: { onToggle: () => void }) {
  const [selecting, setSelecting] = useState(false);
  return (
    <FileRow
      file={row}
      onPress={selecting ? onToggle : () => {}}
      onMore={() => {}}
      onLongPress={() => setSelecting(true)}
      selectionMode={selecting}
      selected={selecting}
    />
  );
}

describe('FileRow', () => {
  it('lifting the finger after the long-press that started selection does not toggle the row', async () => {
    const onToggle = jest.fn();
    const user = userEvent.setup();
    await render(<Harness onToggle={onToggle} />);
    await user.longPress(screen.getByText('Zebra.pdf'), { duration: 800 });
    expect(onToggle).not.toHaveBeenCalled();
  });
});
