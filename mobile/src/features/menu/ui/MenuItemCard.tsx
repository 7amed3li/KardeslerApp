import { Heart, Plus } from 'lucide-react-native';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { MenuItemDto } from '../../../api/types';
import { Badge, PriceText } from '../../../ui/components';
import { resolveOptionalDishImage } from '../../../ui/assets/dishImages';
import { useTheme } from '../../../ui/themes/ThemeProvider';

export interface MenuItemCardProps {
  item: MenuItemDto;
  locale: string;
  isFavorite: boolean;
  soldOutLabel: string;
  addLabel: string;
  onPress: () => void;
  onQuickAdd?: () => void;
  onToggleFavorite: () => void;
}

export function MenuItemCard({
  item,
  locale,
  isFavorite,
  soldOutLabel,
  addLabel,
  onPress,
  onQuickAdd,
  onToggleFavorite,
}: MenuItemCardProps) {
  const { colors, radii, spacing, typography, hitTarget } = useTheme();
  const unavailable = !item.isAvailable;
  const dishImage = resolveOptionalDishImage(item.name, item.imageUrl);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}${unavailable ? `, ${soldOutLabel}` : ''}`}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? colors.surface : colors.surfaceElevated,
          borderColor: colors.border,
          borderRadius: radii.md,
          padding: spacing.sm,
          gap: spacing.sm,
          opacity: unavailable ? 0.68 : 1,
        },
      ]}
    >
      {dishImage ? (
        <View style={styles.imageWrap}>
          <Image
            source={dishImage}
            style={[
              styles.image,
              {
                borderRadius: radii.sm,
                backgroundColor: colors.surface,
              },
            ]}
            resizeMode="cover"
          />
          {unavailable ? (
            <View
              style={[
                styles.soldOutOverlay,
                {
                  backgroundColor: colors.overlay,
                  borderRadius: radii.sm,
                },
              ]}
            >
              <Badge label={soldOutLabel} tone="error" />
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text
            style={[typography.titleSm, { color: colors.text, flex: 1 }]}
            numberOfLines={2}
          >
            {item.name}
          </Text>
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              onToggleFavorite();
            }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={item.name}
            accessibilityState={{ selected: isFavorite }}
            style={styles.favBtn}
          >
            <Heart
              size={18}
              color={isFavorite ? colors.primary : colors.textMuted}
              fill={isFavorite ? colors.primary : 'none'}
            />
          </Pressable>
        </View>

        {item.description ? (
          <Text
            style={[typography.bodySm, { color: colors.textSecondary, marginTop: 2 }]}
            numberOfLines={2}
          >
            {item.description}
          </Text>
        ) : null}

        {item.allergens.length > 0 ? (
          <View style={[styles.allergenRow, { marginTop: spacing.xxs, gap: spacing.xxs }]}>
            {item.allergens.slice(0, 2).map((a) => (
              <Badge key={a} label={a} tone="neutral" />
            ))}
          </View>
        ) : null}

        <View style={[styles.bottomRow, { marginTop: spacing.xs }]}>
          <PriceText
            kurus={item.priceKurus}
            locale={locale}
            style={{ fontSize: 16, fontWeight: '700', color: colors.text }}
          />
          {unavailable ? (
            <Text style={[typography.caption, { color: colors.error, fontWeight: '600' }]}>
              {soldOutLabel}
            </Text>
          ) : (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                if (onQuickAdd && item.options.length === 0) {
                  onQuickAdd();
                } else {
                  onPress();
                }
              }}
              accessibilityRole="button"
              accessibilityLabel={`${addLabel}: ${item.name}`}
              style={({ pressed }) => [
                styles.addBtn,
                {
                  minWidth: hitTarget.min,
                  minHeight: hitTarget.min,
                  borderRadius: radii.full,
                  backgroundColor: pressed ? colors.primaryPressed : colors.primary,
                },
              ]}
            >
              <Plus size={18} color={colors.primaryText} />
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderWidth: 1,
    alignItems: 'stretch',
  },
  imageWrap: {
    width: 96,
    height: 96,
    position: 'relative',
  },
  image: {
    width: 96,
    height: 96,
  },
  soldOutOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  favBtn: {
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allergenRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

