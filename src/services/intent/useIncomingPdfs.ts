import { router, useRootNavigationState } from 'expo-router';
import { useEffect } from 'react';

import { registerIncomingUri } from '@/services/intent/incomingLink';
import { pdfNative, type PdfNativeApi } from '@/services/native/pdfNative';

type Deps = {
  native: Pick<PdfNativeApi, 'takeIncomingPdf' | 'addIncomingPdfListener'>;
  navigate: (uri: string) => void;
};

/** Opens /open for a uri shared to the app; the raw uri travels under a one-time nonce. */
export function navigateToIncoming(uri: string): void {
  router.push({ pathname: '/open', params: { t: registerIncomingUri(uri) } });
}

const defaultDeps: Deps = { native: pdfNative, navigate: navigateToIncoming };

/**
 * Opens PDFs shared to the app (ACTION_SEND): the launch one once the navigator is ready, then
 * the ones shared while it runs. ACTION_VIEW arrives as a link (+native-intent).
 */
export function useIncomingPdfs(deps: Deps = defaultDeps): void {
  const ready = useRootNavigationState()?.key != null;
  const { native, navigate } = deps;

  useEffect(() => {
    if (!ready) return;
    let active = true;
    native
      .takeIncomingPdf()
      .then((uri) => {
        if (active && uri != null) navigate(uri);
      })
      .catch(() => {});
    const sub = native.addIncomingPdfListener(({ uri }) => navigate(uri));
    return () => {
      active = false;
      sub.remove();
    };
  }, [ready, native, navigate]);
}
