import { requireNativeView } from 'expo';
import type { ComponentType, Ref } from 'react';

import type { SignaturePadViewProps, SignaturePadViewRef } from './PdfNative.types';

/** The native finger signature pad (Kotlin `SignaturePadView`); used only by SignaturePad.tsx. */
export const SignaturePadView = requireNativeView('PdfNative', 'SignaturePadView') as ComponentType<
  SignaturePadViewProps & { ref?: Ref<SignaturePadViewRef> }
>;
