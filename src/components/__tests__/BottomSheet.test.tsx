import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  // A 3-button navigation bar under an edge-to-edge window.
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 48, left: 0 }),
}));

const panelStyle = () => StyleSheet.flatten(screen.getByTestId('bottom-sheet-panel').props.style);

describe('BottomSheet', () => {
  it('pads its panel above the navigation bar', async () => {
    await render(
      <BottomSheet onRequestClose={() => {}} padding={20}>
        <Text>Body</Text>
      </BottomSheet>,
    );
    expect(screen.getByText('Body')).toBeOnTheScreen();
    expect(panelStyle()).toMatchObject({ padding: 20, paddingBottom: 68 });
  });

  it('dismisses from the scrim when it has a label, and passes back through', async () => {
    const onScrimPress = jest.fn();
    const onRequestClose = jest.fn();
    await render(
      <BottomSheet
        testID="sheet"
        onRequestClose={onRequestClose}
        onScrimPress={onScrimPress}
        scrimLabel="Close"
      >
        <Text>Body</Text>
      </BottomSheet>,
    );
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(onScrimPress).toHaveBeenCalledTimes(1);
    await fireEvent(screen.getByTestId('sheet'), 'requestClose');
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing while hidden', async () => {
    await render(
      <BottomSheet visible={false} onRequestClose={() => {}}>
        <Text>Body</Text>
      </BottomSheet>,
    );
    expect(screen.queryByText('Body')).toBeNull();
  });
});
