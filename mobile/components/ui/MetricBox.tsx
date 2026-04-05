import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { formatCompact } from '../../lib/format';
import { radii, spacing, type } from '../../lib/theme';

export function MetricBox({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string | null | undefined;
  accent?: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: theme.bgSoft, borderColor: theme.border }]}>
      <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[styles.value, { color: accent || theme.textPrimary }]}>
        {typeof value === 'number' ? formatCompact(value) : value ?? '--'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    minWidth: 120,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: 6,
  },
  label: {
    ...type.bodyMedium,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  value: {
    ...type.display,
    fontSize: 20,
  },
});
