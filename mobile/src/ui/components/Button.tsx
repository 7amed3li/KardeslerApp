import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../themes/ThemeProvider';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  testID,
  accessibilityLabel,
}: ButtonProps) {
  const theme = useTheme();

  const bgColor =
    variant === 'primary'
      ? theme.colors.primary
      : variant === 'danger'
        ? theme.colors.error
        : variant === 'secondary'
          ? theme.colors.surfaceElevated
          : 'transparent';

  const textColor =
    variant === 'primary' || variant === 'danger'
      ? theme.colors.primaryText
      : theme.colors.text;

  const borderColor =
    variant === 'outline'
      ? theme.colors.border
      : variant === 'secondary'
        ? theme.colors.border
        : 'transparent';

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor:
            pressed && variant === 'primary' ? theme.colors.primaryPressed : bgColor,
          borderColor,
          borderWidth: variant === 'outline' || variant === 'secondary' ? 1 : 0,
          borderRadius: theme.radii.md,
          opacity: disabled || loading ? 0.55 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <Text style={[styles.text, { color: textColor }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 46,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  text: {
    fontSize: 15,
    fontWeight: '600',
  },
});

