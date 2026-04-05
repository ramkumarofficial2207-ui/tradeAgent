import { ActivityIndicator, Pressable, PressableProps, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { radii, spacing, type } from '../../lib/theme';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  style?: StyleProp<ViewStyle>;
}

export function Button({ title, loading, variant = 'primary', style, disabled, ...props }: ButtonProps) {
  const { theme } = useTheme();
  const variantStyle = {
    primary: {
      backgroundColor: theme.blue,
      borderColor: theme.blue,
      textColor: '#ffffff',
    },
    secondary: {
      backgroundColor: theme.bgSoft,
      borderColor: theme.borderStrong,
      textColor: theme.textPrimary,
    },
    ghost: {
      backgroundColor: 'transparent',
      borderColor: theme.border,
      textColor: theme.textSecondary,
    },
  }[variant];

  return (
    <Pressable
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: variantStyle.backgroundColor,
          borderColor: variantStyle.borderColor,
          opacity: disabled ? 0.55 : pressed ? 0.88 : 1,
        },
        style,
      ]}
      {...props}
    >
      {loading ? <ActivityIndicator color={variantStyle.textColor} /> : (
        <Text style={[styles.label, { color: variantStyle.textColor }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radii.md,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  label: {
    ...type.bodySemi,
    fontSize: 15,
  },
});
