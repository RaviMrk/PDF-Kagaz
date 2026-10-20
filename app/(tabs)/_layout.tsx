import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/theme/useTheme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const TABS: { name: string; key: 'home' | 'files' | 'tools' | 'settings'; icon: IconName }[] = [
  { name: 'home', key: 'home', icon: 'home-outline' },
  { name: 'files', key: 'files', icon: 'file-pdf-box' },
  { name: 'tools', key: 'tools', icon: 'toolbox-outline' },
  { name: 'settings', key: 'settings', icon: 'cog-outline' },
];

export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      {TABS.map(({ name, key, icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title: t(`tabs.${key}`),
            tabBarAccessibilityLabel: t(`tabs.${key}`),
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name={icon} size={size} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
