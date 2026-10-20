import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/EmptyState';

export default function Screen() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon="toolbox-outline"
      title={t('tabs.tools')}
      message={t('placeholder.comingSoon')}
    />
  );
}
