import { DimensionValue, StyleSheet, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { radii } from '../../lib/theme';

export function SkeletonLoader({ height = 16, width = '100%' as DimensionValue }) {
  const { theme } = useTheme();
  return <View style={[styles.block, { height, width, backgroundColor: theme.bgSoft }]} />;
}

const styles = StyleSheet.create({
  block: {
    borderRadius: radii.md,
  },
});
