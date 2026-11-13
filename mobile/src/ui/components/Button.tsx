import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../themes/ThemeProvider';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps extends Omit<PressableProps, 'style'> {
  label?: string;
  title?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  trailingIcon,
  fullWidth = false,
  style,
  ...rest
}: ButtonProps) {
  const { colors, radii, spacing, typography, hitTarget } = useTheme();
  const isDisabled = disabled || loading;
  const textLabel = label ?? title ?? '';

  const palette = {
    primary: {
      bg: colors.primary,
      bgPressed: colors.primaryPressed,
      text: colors.primaryText,
      border: 'transparent',
    },
    secondary: {
      bg: colors.surface,
      bgPressed: colors.border,
      text: colors.text,
      border: colors.border,
    },
    outline: {
      bg: 'transparent',
      bgPressed: colors.primarySoft,
      text: colors.primary,
      border: colors.primary,
    },
    ghost: {
      bg: 'transparent',
      bgPressed: colors.surface,
      text: colors.text,
      border: 'transparent',
    },
    danger: {
      bg: colors.error,
      bgPressed: '#8C1D17',
      text: '#FFFFFF',
      border: 'transparent',
    },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rest.accessibilityLabel ?? textLabel}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: hitTarget.min,
          minWidth: hitTarget.min,
          paddingHorizontal: size === 'sm' ? spacing.sm : spacing.md,
          paddingVertical: size === 'sm' ? spacing.xs : spacing.sm,
          borderRadius: radii.md,
          backgroundColor: pressed && !isDisabled ? palette.bgPressed : palette.bg,
          borderWidth: palette.border === 'transparent' ? 0 : 1,
          borderColor: palette.border,
          opacity: isDisabled ? 0.52 : 1,
          alignSelf: fullWidth ? 'stretch' : 'auto',
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.text} />
      ) : (
        <View style={[styles.row, { gap: spacing.xs }]}>
          {icon ? <View style={styles.iconSlot}>{icon}</View> : null}
          <Text
            style={[
              typography.label,
              { color: palette.text, textAlign: 'center' },
            ]}
            numberOfLines={1}
          >
            {textLabel}
          </Text>
          {trailingIcon ? <View style={styles.iconSlot}>{trailingIcon}</View> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
