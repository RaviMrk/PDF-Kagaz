import { Redirect } from 'expo-router';

import { useSettings } from '@/stores/settingsStore';

export default function Index() {
  const onboardingDone = useSettings((s) => s.onboardingDone);
  return <Redirect href={onboardingDone ? '/home' : '/onboarding'} />;
}
