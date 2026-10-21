import { Component } from 'react';
import { View } from 'react-native';

/** Jest stand-in for `react-native-pdf`: records renders and props, and the `setPage` calls. */
export const fakePdf = {
  renders: 0,
  setPage: jest.fn<void, [number]>(),
  props: null as Record<string, any> | null,
  lastProps(): Record<string, any> {
    if (!fakePdf.props) throw new Error('react-native-pdf fake has not rendered');
    return fakePdf.props;
  },
  reset(): void {
    fakePdf.renders = 0;
    fakePdf.props = null;
    fakePdf.setPage.mockReset();
  },
};

export default class FakePdf extends Component<Record<string, any>> {
  setPage(page: number): void {
    fakePdf.setPage(page);
  }

  render() {
    fakePdf.renders += 1;
    fakePdf.props = this.props;
    return <View testID="pdf-native" />;
  }
}
