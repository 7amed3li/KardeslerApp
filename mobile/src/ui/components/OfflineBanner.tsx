import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { useTheme } from '../themes/ThemeProvider';

export function OfflineBanner({ message }: { message: string }) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.banner,
        {
          backgroundColor: colors.errorSoft,
          borderBottomColor: colors.error,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.xs,
          gap: spacing.xs,
        },
      ]}
    >
      <WifiOff size={16} color={colors.error} />
      <Text style={[typography.caption, { color: colors.error, flex: 1, fontWeight: '600' }]}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
});

