import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { radii, spacing, type } from '../../lib/theme';

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'positive' | 'negative' | 'warning' | 'neutral' }) {
  const { theme } = useTheme();
  const palette = {
    positive: { bg: theme.successBg, text: theme.green },
    negative: { bg: theme.dangerBg, text: theme.red },
    warning: { bg: theme.warningBg, text: theme.amber },
    neutral: { bg: theme.bgSoft, text: theme.textSecondary },
  }[tone];

  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  label: {
    ...type.bodySemi,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
