import { render, screen } from '@testing-library/react-native';

import { SegmentedControl } from '@/components/SegmentedControl';

describe('SegmentedControl', () => {
  it('lets labels wrap to two lines at large font scales instead of truncating (F11)', async () => {
    await render(
      <SegmentedControl
        value="a"
        onChange={() => {}}
        options={[
          { key: 'a', label: 'All' },
          { key: 'f', label: 'Favourites' },
        ]}
      />,
    );
    expect(screen.getByText('Favourites').props.numberOfLines).toBe(2);
  });
});
