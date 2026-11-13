import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../themes/ThemeProvider';

export type BadgeTone = 'neutral' | 'primary' | 'accent' | 'success' | 'error';

export function Badge({
  label,
  tone = 'neutral',
  icon,
  style,
}: {
  label: string;
  tone?: BadgeTone;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radii, spacing, typography } = useTheme();

  const palette = {
    neutral: { bg: colors.surface, text: colors.textSecondary, border: colors.border },
    primary: { bg: colors.primarySoft, text: colors.primary, border: 'transparent' },
    accent: { bg: colors.accentSoft, text: colors.accent, border: 'transparent' },
    success: { bg: colors.successSoft, text: colors.success, border: 'transparent' },
    error: { bg: colors.errorSoft, text: colors.error, border: 'transparent' },
  }[tone];

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: palette.border === 'transparent' ? 0 : 1,
          borderRadius: radii.full,
          paddingHorizontal: spacing.xs,
          paddingVertical: spacing.xxs,
          gap: spacing.xxs,
        },
        style,
      ]}
    >
      {icon}
      <Text style={[typography.caption, { color: palette.text, fontWeight: '600' }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
});

