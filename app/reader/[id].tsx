import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/EmptyState';
import { PdfView } from '@/components/reader/PdfView';
import { useFiles } from '@/stores/filesStore';

const noop = () => {};

/** Device render gate for react-native-pdf (M3 Task 2); replaced by the reader screen in Task 7. */
export default function ReaderGate() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const row = useFiles((s) => s.files.find((f) => f.id === id));

  if (!row?.uri.startsWith('file://')) return <EmptyState title={t('placeholder.comingSoon')} />;
  return (
    <PdfView
      fileUri={row.uri}
      password=""
      initialPage={1}
      horizontal={false}
      onLoad={noop}
      onPageChange={noop}
      onError={noop}
      onTap={noop}
    />
  );
}
