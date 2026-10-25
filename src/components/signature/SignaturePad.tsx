import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import {
  SignaturePadView,
  type ExportedSignature,
  type SignaturePadViewRef,
} from '../../../modules/pdf-native';

export type { ExportedSignature };

export type SignaturePadHandle = {
  /** Null when nothing is drawn; else the saved PNG in filesDir/signatures. */
  exportPng(): Promise<ExportedSignature | null>;
  clear(): Promise<void>;
};

type Props = {
  inkColor: 'black' | 'blue';
  onChange(empty: boolean): void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
};

export const INK_COLORS = { black: '#1a1a1a', blue: '#0d47a1' } as const;

/** The native finger signature pad (the only component allowed to use modules/pdf-native). */
export const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { inkColor, onChange, accessibilityLabel, style },
  ref,
) {
  const native = useRef<SignaturePadViewRef>(null);
  useImperativeHandle(ref, () => ({
    exportPng: async () => (native.current ? native.current.exportPng() : null),
    clear: async () => {
      await native.current?.clear();
    },
  }));
  return (
    <SignaturePadView
      ref={native}
      inkColor={INK_COLORS[inkColor]}
      strokeWidthDp={3}
      onPadChange={(e) => onChange(e.nativeEvent.empty)}
      accessible
      accessibilityLabel={accessibilityLabel}
      style={style}
    />
  );
});
