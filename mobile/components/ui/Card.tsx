import { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { cardStyle, spacing } from '../../lib/theme';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { theme } = useTheme();
  return <View style={[styles.base, cardStyle(theme), style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    padding: spacing.lg,
    gap: spacing.md,
  },
});
