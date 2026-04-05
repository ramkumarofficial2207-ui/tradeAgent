import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { radii, spacing, type } from '../../lib/theme';

export function FilterPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.base,
        {
          backgroundColor: active ? theme.blue : theme.bgSoft,
          borderColor: active ? theme.blue : theme.border,
        },
      ]}
    >
      <Text style={[styles.label, { color: active ? '#fff' : theme.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: radii.pill,
    marginRight: spacing.sm,
  },
  label: {
    ...type.bodySemi,
    fontSize: 13,
  },
});
