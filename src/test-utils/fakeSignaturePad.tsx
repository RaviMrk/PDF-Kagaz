import { forwardRef, useImperativeHandle } from 'react';
import { View } from 'react-native';

type NativeChange = { nativeEvent: { empty: boolean } };
type PadProps = {
  inkColor: string;
  strokeWidthDp?: number;
  onPadChange?: (e: NativeChange) => void;
  accessibilityLabel?: string;
};

/** What the screen last passed to the native pad, plus its imperative functions. */
export const fakeSignaturePad = {
  props: null as PadProps | null,
  exportPng: jest.fn(),
  clear: jest.fn(),
  /** Simulates the native view reporting whether anything is drawn. */
  change(empty: boolean) {
    fakeSignaturePad.props?.onPadChange?.({ nativeEvent: { empty } });
  },
  reset() {
    fakeSignaturePad.props = null;
    fakeSignaturePad.exportPng.mockReset().mockResolvedValue({
      uri: 'file:///data/files/signatures/sig-1-abc123.png',
      width: 300,
      height: 100,
    });
    fakeSignaturePad.clear.mockReset().mockResolvedValue(undefined);
  },
};

/** Stands in for the native SignaturePadView under Jest. */
export const FakeSignaturePadView = forwardRef<unknown, PadProps>(
  function FakeSignaturePadView(props, ref) {
    fakeSignaturePad.props = props;
    useImperativeHandle(ref, () => ({
      exportPng: () => fakeSignaturePad.exportPng(),
      clear: () => fakeSignaturePad.clear(),
    }));
    return <View testID="signature-pad-native" accessibilityLabel={props.accessibilityLabel} />;
  },
);
