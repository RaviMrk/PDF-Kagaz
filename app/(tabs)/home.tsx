import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/EmptyState';

export default function Screen() {
  const { t } = useTranslation();
  return (
    <EmptyState icon="home-outline" title={t('tabs.home')} message={t('placeholder.comingSoon')} />
  );
}
