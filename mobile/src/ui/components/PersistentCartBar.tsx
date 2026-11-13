import React from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, ArrowRight, ShoppingBag } from 'lucide-react-native';
import { useTheme } from '../themes/ThemeProvider';
import { PriceText } from './PriceText';

export interface PersistentCartBarProps {
  itemCount: number;
  subtotalKurus: number;
  locale: string;
  ctaLabel: string;
  itemsLabel: string;
  provisionalLabel?: string;
  onPress: () => void;
}

export function PersistentCartBar({
  itemCount,
  subtotalKurus,
  locale,
  ctaLabel,
  itemsLabel,
  provisionalLabel,
  onPress,
}: PersistentCartBarProps) {
  const { colors, radii, spacing, typography, hitTarget } = useTheme();
  if (itemCount <= 0) return null;

  const ArrowIcon = I18nManager.isRTL ? ArrowLeft : ArrowRight;

  return (
    <View
      style={[
        styles.wrapper,
        {
          paddingHorizontal: spacing.md,
          paddingBottom: spacing.xs,
          paddingTop: spacing.xxs,
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${ctaLabel}, ${itemsLabel}`}
        style={({ pressed }) => [
          styles.bar,
          {
            minHeight: hitTarget.min + 8,
            backgroundColor: pressed ? colors.primaryPressed : colors.primary,
            borderRadius: radii.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.xs,
            gap: spacing.sm,
          },
        ]}
      >
        <View
          style={[
            styles.countPill,
            {
              backgroundColor: 'rgba(255,255,255,0.18)',
              borderRadius: radii.sm,
              paddingHorizontal: spacing.xs,
              paddingVertical: spacing.xxs,
              gap: spacing.xxs,
            },
          ]}
        >
          <ShoppingBag size={15} color={colors.primaryText} />
          <Text style={[typography.label, { color: colors.primaryText }]}>{itemCount}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={[typography.label, { color: colors.primaryText }]} numberOfLines={1}>
            {ctaLabel}
          </Text>
          <Text
            style={[typography.caption, { color: 'rgba(255,255,255,0.85)' }]}
            numberOfLines={1}
          >
            {itemsLabel}
            {provisionalLabel ? ` • ${provisionalLabel}` : ''}
          </Text>
        </View>

        <View style={[styles.right, { gap: spacing.xxs }]}>
          <PriceText
            kurus={subtotalKurus}
            locale={locale}
            style={{ color: colors.primaryText, fontSize: 15, fontWeight: '700' }}
          />
          <ArrowIcon size={16} color={colors.primaryText} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

