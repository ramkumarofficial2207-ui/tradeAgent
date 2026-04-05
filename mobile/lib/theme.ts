import { ColorSchemeName, TextStyle, ViewStyle } from 'react-native';

export const colors = {
  dark: {
    bgPrimary: '#07070a',
    bgSecondary: '#0f1117',
    bgCard: '#111118',
    bgElevated: '#18181f',
    bgSoft: '#1d1d28',
    blue: '#3b82f6',
    cyan: '#22d3ee',
    violet: '#5b7cff',
    green: '#10b981',
    red: '#ef4444',
    amber: '#f59e0b',
    textPrimary: '#f3f5ff',
    textSecondary: '#c0c3d9',
    textMuted: '#7d839f',
    border: 'rgba(255,255,255,0.08)',
    borderStrong: 'rgba(255,255,255,0.16)',
    successBg: 'rgba(16,185,129,0.14)',
    dangerBg: 'rgba(239,68,68,0.14)',
    warningBg: 'rgba(245,158,11,0.14)',
  },
  light: {
    bgPrimary: '#f4f4f8',
    bgSecondary: '#eef1f6',
    bgCard: '#ffffff',
    bgElevated: '#f9fbff',
    bgSoft: '#e9edf8',
    blue: '#2563eb',
    cyan: '#0891b2',
    violet: '#4f46e5',
    green: '#059669',
    red: '#dc2626',
    amber: '#d97706',
    textPrimary: '#121724',
    textSecondary: '#394055',
    textMuted: '#6b7280',
    border: 'rgba(15,23,42,0.08)',
    borderStrong: 'rgba(15,23,42,0.16)',
    successBg: 'rgba(5,150,105,0.12)',
    dangerBg: 'rgba(220,38,38,0.12)',
    warningBg: 'rgba(217,119,6,0.12)',
  },
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
};

export const radii = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
};

export function resolveTheme(mode: 'dark' | 'light' | 'system', systemScheme: ColorSchemeName) {
  if (mode === 'system') {
    return systemScheme === 'light' ? colors.light : colors.dark;
  }
  return mode === 'light' ? colors.light : colors.dark;
}

export const type = {
  display: {
    fontFamily: 'Outfit_700Bold',
  } satisfies TextStyle,
  body: {
    fontFamily: 'Inter_400Regular',
  } satisfies TextStyle,
  bodyMedium: {
    fontFamily: 'Inter_500Medium',
  } satisfies TextStyle,
  bodySemi: {
    fontFamily: 'Inter_600SemiBold',
  } satisfies TextStyle,
  mono: {
    fontFamily: 'JetBrainsMono_500Medium',
  } satisfies TextStyle,
};

export function cardStyle(theme: typeof colors.dark): ViewStyle {
  return {
    backgroundColor: theme.bgCard,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radii.lg,
  };
}
