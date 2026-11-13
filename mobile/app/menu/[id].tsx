import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Heart,
  Minus,
  Plus,
} from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  I18nManager,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { queryKeys } from '../../src/api/query-keys';
import { useCartStore } from '../../src/features/cart/model/cart.store';
import { fetchMenu } from '../../src/features/menu/api/menu.api';
import {
  groupMenuItemOptions,
  validateOptionSelection,
  type OptionGroup,
} from '../../src/features/menu/model/menu.model';
import { useTranslations } from '../../src/i18n';
import { formatTryFromKurus } from '../../src/lib/money/format';
import { resolveOptionalDishImage } from '../../src/ui/assets/dishImages';
import { Badge, Button, Card, PriceText, Screen, StateView } from '../../src/ui/components';
import { useTheme } from '../../src/ui/themes/ThemeProvider';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { language, t } = useTranslations();

  const addItem = useCartStore((s) => s.addItem);
  const favoriteIds = useCartStore((s) => s.favoriteIds);
  const toggleFavorite = useCartStore((s) => s.toggleFavorite);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.menu(language),
    queryFn: () => fetchMenu(language),
  });

  const item = useMemo(
    () => data?.items.find((i) => i.id === id) ?? null,
    [data?.items, id],
  );
  const groups = useMemo(
    () => (item ? groupMenuItemOptions(item.options) : []),
    [item],
  );
  const requiredGroups = useMemo(
    () => groups.filter((g) => g.isRequired || g.minSelect > 0),
    [groups],
  );
  const optionalGroups = useMemo(
    () => groups.filter((g) => !g.isRequired && g.minSelect === 0),
    [groups],
  );

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedQuickNotes, setSelectedQuickNotes] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');

  const itemCategoryName = useMemo(() => {
    if (!item || !data?.categories) return '';
    return data.categories.find((c) => c.id === item.categoryId)?.name ?? '';
  }, [data?.categories, item]);

  const isFoodItem = useMemo(() => {
    const lower = itemCategoryName.toLocaleLowerCase('tr-TR');
    return !lower.includes('içecek') && !lower.includes('drink') && !lower.includes('مشروب');
  }, [itemCategoryName]);

  const quickNoteChoices = useMemo(
    () => [
      { id: 'acisiz', trText: 'Acısız', label: t.menu.quickNoteNoSpice },
      { id: 'sogansiz', trText: 'Soğansız', label: t.menu.quickNoteNoOnion },
      { id: 'az-pismis', trText: 'Az pişmiş', label: t.menu.quickNoteMediumRare },
      { id: 'tuzsuz', trText: 'Tuzsuz', label: t.menu.quickNoteNoSalt },
    ],
    [t],
  );

  const toggleQuickNote = (trText: string) => {
    setSelectedQuickNotes((prev) =>
      prev.includes(trText) ? prev.filter((x) => x !== trText) : [...prev, trText],
    );
  };

  const validation = useMemo(
    () => validateOptionSelection(groups, selectedIds),
    [groups, selectedIds],
  );

  const provisionalTotalKurus = useMemo(() => {
    if (!item) return 0;
    const optionMap = new Map(item.options.map((o) => [o.id, o.priceDeltaKurus]));
    const delta = selectedIds.reduce((sum, optId) => sum + (optionMap.get(optId) ?? 0), 0);
    return (item.priceKurus + delta) * quantity;
  }, [item, selectedIds, quantity]);

  const BackIcon = I18nManager.isRTL ? ArrowRight : ArrowLeft;

  if (isLoading) {
    return (
      <Screen edges={['top', 'bottom']}>
        <StateView kind="loading" title={t.common.loading} />
      </Screen>
    );
  }

  if (isError || !item) {
    return (
      <Screen edges={['top', 'bottom']}>
        <StateView
          kind="error"
          title={t.common.errorTitle}
          actionLabel={t.common.retry}
          onAction={() => void refetch()}
        />
      </Screen>
    );
  }

  const isFav = favoriteIds.includes(item.id);
  const canAdd = item.isAvailable && validation.valid;
  const heroImage = resolveOptionalDishImage(item.name, item.imageUrl);

  const toggleOption = (groupId: string, optionId: string, maxSelect: number) => {
    const groupOptionIds = new Set(
      groups.find((g) => g.groupId === groupId)?.options.map((o) => o.id) ?? [],
    );
    setSelectedIds((prev) => {
      const exists = prev.includes(optionId);
      if (exists) {
        return prev.filter((x) => x !== optionId);
      }
      if (maxSelect === 1) {
        return [...prev.filter((x) => !groupOptionIds.has(x)), optionId];
      }
      const currentInGroup = prev.filter((x) => groupOptionIds.has(x)).length;
      if (maxSelect > 0 && currentInGroup >= maxSelect) {
        return prev;
      }
      return [...prev, optionId];
    });
  };

  const handleAddToCart = () => {
    if (!canAdd) return;
    const optionNames = item.options
      .filter((o) => selectedIds.includes(o.id))
      .map((o) => o.name);
    const combinedNote = [
      ...selectedQuickNotes,
      ...(note.trim() ? [note.trim()] : []),
    ]
      .join(', ')
      .slice(0, 100);

    addItem({
      menuItemId: item.id,
      name: item.name,
      imageUrl: item.imageUrl,
      quantity,
      optionIds: selectedIds,
      optionNames,
      note: combinedNote.length > 0 ? combinedNote : undefined,
    });
    router.back();
  };

  const renderGroup = (group: OptionGroup, isReq: boolean) => {
    const limitLabel =
      group.maxSelect === 1
        ? t.menu.exactSelect.replace('{{count}}', '1')
        : group.maxSelect > 1
          ? t.menu.maxSelect.replace('{{count}}', String(group.maxSelect))
          : null;

    return (
      <Card key={group.groupId} variant="elevated" style={{ gap: theme.spacing.xs }}>
        <View style={styles.groupHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[theme.typography.titleSm, { color: theme.colors.text }]}>
              {group.groupName}
            </Text>
            {limitLabel ? (
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                {limitLabel}
              </Text>
            ) : null}
          </View>
          <Badge
            label={isReq ? t.menu.requiredOption : t.menu.optional}
            tone={isReq ? 'primary' : 'neutral'}
          />
        </View>

        <View style={{ gap: theme.spacing.xs }}>
          {group.options.map((opt) => {
            const selected = selectedIds.includes(opt.id);
            const disabledOpt = !opt.isAvailable;
            return (
              <Pressable
                key={opt.id}
                disabled={disabledOpt}
                onPress={() => toggleOption(group.groupId, opt.id, group.maxSelect)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected, disabled: disabledOpt }}
                style={[
                  styles.optionRow,
                  {
                    minHeight: theme.hitTarget.min,
                    paddingHorizontal: theme.spacing.sm,
                    paddingVertical: theme.spacing.xs,
                    borderRadius: theme.radii.sm,
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                    backgroundColor: selected
                      ? theme.colors.primarySoft
                      : theme.colors.surface,
                    opacity: disabledOpt ? 0.5 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.checkBox,
                    {
                      borderColor: selected ? theme.colors.primary : theme.colors.textMuted,
                      backgroundColor: selected ? theme.colors.primary : 'transparent',
                      borderRadius: group.maxSelect === 1 ? theme.radii.full : 4,
                    },
                  ]}
                >
                  {selected ? <Check size={13} color={theme.colors.primaryText} /> : null}
                </View>
                <Text
                  style={[
                    theme.typography.body,
                    { color: theme.colors.text, flex: 1 },
                  ]}
                >
                  {opt.name}
                  {disabledOpt ? ` (${t.common.soldOut})` : ''}
                </Text>
                {opt.priceDeltaKurus > 0 ? (
                  <Text style={[theme.typography.label, { color: theme.colors.textSecondary }]}>
                    +{formatTryFromKurus(opt.priceDeltaKurus, language)}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </Card>
    );
  };

  return (
    <Screen edges={['top', 'bottom']}>
      {/* Top Nav Bar */}
      <View
        style={[
          styles.topBar,
          {
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.xs,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t.common.back}
          style={[styles.iconBtn, { minWidth: theme.hitTarget.min, minHeight: theme.hitTarget.min }]}
        >
          <BackIcon size={20} color={theme.colors.text} />
        </Pressable>
        <Text style={[theme.typography.titleSm, { color: theme.colors.text, flex: 1 }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Pressable
          onPress={() => toggleFavorite(item.id)}
          accessibilityRole="button"
          accessibilityState={{ selected: isFav }}
          style={[styles.iconBtn, { minWidth: theme.hitTarget.min, minHeight: theme.hitTarget.min }]}
        >
          <Heart
            size={20}
            color={isFav ? theme.colors.primary : theme.colors.textMuted}
            fill={isFav ? theme.colors.primary : 'none'}
          />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: theme.spacing.xxl,
        }}
      >
        {heroImage ? (
          <Image
            source={heroImage}
            style={[styles.hero, { backgroundColor: theme.colors.surface }]}
            resizeMode="cover"
          />
        ) : null}

        <View style={{ padding: theme.spacing.md, gap: theme.spacing.md }}>
          {/* Primary Info: Name, Price, Description, Allergens */}
          <View style={{ gap: theme.spacing.xs }}>
            <View style={styles.titlePriceRow}>
              <Text style={[theme.typography.titleLg, { color: theme.colors.text, flex: 1 }]}>
                {item.name}
              </Text>
              <PriceText
                kurus={item.priceKurus}
                locale={language}
                style={{ fontSize: 20, fontWeight: '700', color: theme.colors.primary }}
              />
            </View>

            {!item.isAvailable ? (
              <Badge label={t.menu.soldOutHint} tone="error" />
            ) : null}

            {item.description ? (
              <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
                {item.description}
              </Text>
            ) : null}

            {/* Allergens */}
            <View style={[styles.allergenWrap, { gap: theme.spacing.xs, marginTop: theme.spacing.xxs }]}>
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                {t.menu.allergens}:
              </Text>
              {item.allergens.length > 0 ? (
                item.allergens.map((a) => <Badge key={a} label={a} tone="accent" />)
              ) : (
                <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
                  {t.menu.noAllergens}
                </Text>
              )}
            </View>
          </View>

          {/* Required Option Groups */}
          {requiredGroups.length > 0 ? (
            <View style={{ gap: theme.spacing.sm }}>
              {requiredGroups.map((g) => renderGroup(g, true))}
            </View>
          ) : null}

          {/* Optional Option Groups */}
          {optionalGroups.length > 0 ? (
            <View style={{ gap: theme.spacing.sm }}>
              {optionalGroups.map((g) => renderGroup(g, false))}
            </View>
          ) : null}

          {/* Quick Kitchen Notes for Food Items */}
          {isFoodItem ? (
            <Card variant="elevated" style={{ gap: theme.spacing.xs }}>
              <Text style={[theme.typography.titleSm, { color: theme.colors.text }]}>
                {t.menu.quickNotesTitle}
              </Text>
              <View style={styles.quickNotesWrap}>
                {quickNoteChoices.map((qn) => {
                  const active = selectedQuickNotes.includes(qn.trText);
                  return (
                    <Pressable
                      key={qn.id}
                      onPress={() => toggleQuickNote(qn.trText)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: active }}
                      style={[
                        styles.quickNoteChip,
                        {
                          borderColor: active ? theme.colors.primary : theme.colors.border,
                          backgroundColor: active
                            ? theme.colors.primarySoft
                            : theme.colors.surface,
                          borderRadius: theme.radii.full,
                          paddingHorizontal: theme.spacing.sm,
                          paddingVertical: theme.spacing.xs,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.quickCheck,
                          {
                            borderColor: active ? theme.colors.primary : theme.colors.textMuted,
                            backgroundColor: active ? theme.colors.primary : 'transparent',
                          },
                        ]}
                      >
                        {active ? <Check size={11} color={theme.colors.primaryText} /> : null}
                      </View>
                      <Text
                        style={[
                          theme.typography.label,
                          { color: active ? theme.colors.primary : theme.colors.text },
                        ]}
                      >
                        {qn.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Card>
          ) : null}

          {/* Note Input with Allergy Disclaimer */}
          <Card variant="elevated" style={{ gap: theme.spacing.xs }}>
            <Text style={[theme.typography.label, { color: theme.colors.text }]}>
              {t.menu.noteLabel}
            </Text>
            <TextInput
              value={note}
              onChangeText={(txt) => setNote(txt.slice(0, 100))}
              maxLength={100}
              multiline
              placeholder={t.menu.notePlaceholder}
              placeholderTextColor={theme.colors.textMuted}
              style={[
                theme.typography.body,
                styles.noteInput,
                {
                  color: theme.colors.text,
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radii.sm,
                  padding: theme.spacing.sm,
                },
              ]}
            />
            <View style={styles.disclaimerRow}>
              <AlertCircle size={14} color={theme.colors.textMuted} />
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted, flex: 1 }]}>
                {t.menu.noteAllergyDisclaimer}
              </Text>
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                {note.length}/100
              </Text>
            </View>
          </Card>
        </View>
      </ScrollView>

      {/* Bottom Sticky Add-to-Cart Bar */}
      <View
        style={[
          styles.footer,
          {
            backgroundColor: theme.colors.surfaceElevated,
            borderTopColor: theme.colors.border,
            padding: theme.spacing.md,
            gap: theme.spacing.xs,
          },
        ]}
      >
        <View style={styles.footerTop}>
          <View style={[styles.qtyGroup, { gap: theme.spacing.xs }]}>
            <Pressable
              onPress={() => setQuantity((q) => Math.max(1, q - 1))}
              accessibilityRole="button"
              accessibilityLabel="-"
              style={[
                styles.qtyBtn,
                {
                  minWidth: theme.hitTarget.min,
                  minHeight: theme.hitTarget.min,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radii.sm,
                },
              ]}
            >
              <Minus size={16} color={theme.colors.text} />
            </Pressable>
            <Text
              style={[
                theme.typography.titleSm,
                { color: theme.colors.text, minWidth: 26, textAlign: 'center' },
              ]}
            >
              {quantity}
            </Text>
            <Pressable
              onPress={() => setQuantity((q) => q + 1)}
              accessibilityRole="button"
              accessibilityLabel="+"
              style={[
                styles.qtyBtn,
                {
                  minWidth: theme.hitTarget.min,
                  minHeight: theme.hitTarget.min,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radii.sm,
                },
              ]}
            >
              <Plus size={16} color={theme.colors.text} />
            </Pressable>
          </View>

          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
              {t.menu.provisionalTotal}
            </Text>
            <PriceText
              kurus={provisionalTotalKurus}
              locale={language}
              style={{ fontSize: 18, fontWeight: '700', color: theme.colors.text }}
            />
          </View>
        </View>

        <Button
          label={
            !item.isAvailable
              ? t.menu.soldOutHint
              : !validation.valid
                ? `${t.menu.selectRequiredPrompt}${
                    validation.missingGroupName ? `: ${validation.missingGroupName}` : ''
                  }`
                : `${t.menu.addToCart} • ${formatTryFromKurus(provisionalTotalKurus, language)}`
          }
          fullWidth
          disabled={!canAdd}
          onPress={handleAddToCart}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    gap: 8,
  },
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    width: '100%',
    height: 220,
  },
  titlePriceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  allergenWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    gap: 10,
  },
  checkBox: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteInput: {
    borderWidth: 1,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  disclaimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footer: {
    borderTopWidth: 1,
  },
  footerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qtyGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  qtyBtn: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickNotesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickNoteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    gap: 6,
    minHeight: 38,
  },
  quickCheck: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
