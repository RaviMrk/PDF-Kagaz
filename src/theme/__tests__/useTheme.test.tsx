import { renderHook, act } from '@testing-library/react-native';
import * as RN from 'react-native';

import { useSettings } from '@/stores/settingsStore';
import { darkColors, lightColors } from '@/theme/colors';
import { useTheme } from '@/theme/useTheme';

const colorScheme = jest.spyOn(RN, 'useColorScheme');

afterEach(async () => {
  await act(() => useSettings.getState().setTheme('system'));
});

describe('useTheme', () => {
  it('follows the OS when the pref is system, including live changes', async () => {
    colorScheme.mockReturnValue('dark');
    const { result, rerender } = await renderHook(() => useTheme());
    expect(result.current.scheme).toBe('dark');
    expect(result.current.colors).toBe(darkColors);

    colorScheme.mockReturnValue('light');
    await rerender({});
    expect(result.current.scheme).toBe('light');
    expect(result.current.colors).toBe(lightColors);
  });

  it('uses the explicit pref over the OS', async () => {
    colorScheme.mockReturnValue('dark');
    await act(() => useSettings.getState().setTheme('light'));
    const { result } = await renderHook(() => useTheme());
    expect(result.current.scheme).toBe('light');
  });

  it('falls back to light when the OS reports no scheme', async () => {
    colorScheme.mockReturnValue(null as unknown as RN.ColorSchemeName);
    const { result } = await renderHook(() => useTheme());
    expect(result.current.scheme).toBe('light');
  });
});
