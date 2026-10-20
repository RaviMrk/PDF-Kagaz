import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/EmptyState';

export default function Placeholder() {
  const { t } = useTranslation();
  return <EmptyState title={t('placeholder.comingSoon')} />;
}
