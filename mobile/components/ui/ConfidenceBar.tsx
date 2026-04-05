import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { radii, spacing, type } from '../../lib/theme';

export function ConfidenceBar({ value }: { value?: number | null }) {
  const { theme } = useTheme();
  const score = Math.max(0, Math.min(10, value ?? 0));
  const tone = score >= 7 ? theme.green : score >= 5 ? theme.amber : theme.red;

  return (
    <View style={styles.wrapper}>
      <View style={[styles.track, { backgroundColor: theme.bgSoft }]}>
        <View style={[styles.fill, { width: `${score * 10}%`, backgroundColor: tone }]} />
      </View>
      <Text style={[styles.label, { color: tone }]}>{score.toFixed(1)}/10</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  track: {
    height: 8,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  fill: {
    height: 8,
    borderRadius: radii.pill,
  },
  label: {
    ...type.bodySemi,
    fontSize: 12,
  },
});
