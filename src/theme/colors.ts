export type ColorTokens = {
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
  border: string;
  danger: string;
};

export const lightColors: ColorTokens = {
  background: '#FFFFFF',
  surface: '#F4F5F7',
  text: '#111418',
  textMuted: '#5C6370',
  primary: '#D93025',
  onPrimary: '#FFFFFF',
  border: '#E1E4E8',
  danger: '#B3261E',
};

export const darkColors: ColorTokens = {
  background: '#121212',
  surface: '#1E1F22',
  text: '#ECEDEE',
  textMuted: '#9BA1A6',
  primary: '#FF6B5E',
  onPrimary: '#1A0000',
  border: '#2C2F33',
  danger: '#F2B8B5',
};
