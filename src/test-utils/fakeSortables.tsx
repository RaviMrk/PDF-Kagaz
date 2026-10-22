import { Fragment, type ReactElement } from 'react';
import { View } from 'react-native';

type Props = Record<string, any>;

const recorded: { props: Props } = { props: {} };

/** Stand-in for react-native-sortables under Jest: renders items in order and records the props. */
function Grid(props: Props) {
  fakeSortables.record(props);
  const { data, renderItem, keyExtractor } = props as {
    data: unknown[];
    keyExtractor?: (item: unknown, index: number) => string;
    renderItem: (info: { item: unknown; index: number }) => ReactElement;
  };
  return (
    <View testID="sortable-grid">
      {data.map((item, index) => (
        <Fragment key={keyExtractor?.(item, index) ?? index}>
          {renderItem({ item, index })}
        </Fragment>
      ))}
    </View>
  );
}

export const fakeSortables = {
  record(props: Props): void {
    recorded.props = props;
  },
  lastProps: (): Props => recorded.props,
  reset(): void {
    recorded.props = {};
  },
};

export default { Grid };
