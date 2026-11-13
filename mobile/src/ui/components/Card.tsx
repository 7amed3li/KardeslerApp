import React from 'react';
import { View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { useTheme } from '../themes/ThemeProvider';

export interface CardProps extends ViewProps {
  variant?: 'elevated' | 'subtle' | 'outlined';
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Card({
  variant = 'elevated',
  padded = true,
  style,
  children,
  ...rest
}: CardProps) {
  const { colors, radii, spacing } = useTheme();

  const backgroundColor =
    variant === 'elevated'
      ? colors.surfaceElevated
      : variant === 'subtle'
        ? colors.surface
        : 'transparent';

  return (
    <View
      style={[
        {
          backgroundColor,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radii.md,
          padding: padded ? spacing.md : 0,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
