import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { formatKurus } from '../../lib/money/format';
import { useTheme } from '../themes/ThemeProvider';

export function PriceText({
  kurus,
  style,
  testID,
}: {
  kurus: number;
  style?: StyleProp<TextStyle>;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Text
      testID={testID}
      style={[{ color: theme.colors.primary, fontWeight: '700', fontSize: 15 }, style]}
    >
      {formatKurus(kurus)}
    </Text>
  );
}

