import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/EmptyState';

export default function Screen() {
  const { t } = useTranslation();
  return (
    <EmptyState icon="file-pdf-box" title={t('tabs.files')} message={t('placeholder.comingSoon')} />
  );
}
