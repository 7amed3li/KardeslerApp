import React from 'react';
import { Text, type TextProps } from 'react-native';
import { formatTryFromKurus } from '../../lib/money/format';
import { useTheme } from '../themes/ThemeProvider';

export function PriceText({
  kurus,
  locale = 'tr',
  style,
  ...rest
}: {
  kurus: number;
  locale?: string;
} & TextProps) {
  const { colors, typography } = useTheme();
  return (
    <Text
      style={[
        typography.label,
        { color: colors.text, fontVariant: ['tabular-nums'] },
        style,
      ]}
      {...rest}
    >
      {formatTryFromKurus(kurus, locale)}
    </Text>
  );
}
