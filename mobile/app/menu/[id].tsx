import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Heart } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { queryKeys } from '../../src/api/query-keys';
import { RESTAURANT_CONFIG } from '../../src/config/restaurant';
import { useCartStore } from '../../src/features/cart/model/cart.store';
import { fetchMenu } from '../../src/features/menu/api/menu.api';
import {
  groupMenuItemOptions,
  validateOptionSelection,
} from '../../src/features/menu/model/menu.model';
import { useTranslations } from '../../src/i18n';
import { resolveDishImage } from '../../src/ui/assets/dishImages';
import { Button, Card, PriceText, Screen, StateView } from '../../src/ui/components';
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

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  if (isLoading) return <StateView kind="loading" />;
  if (isError || !item) {
    return (
      <StateView
        kind="error"
        title={t.common.errorTitle}
        onRetry={() => void refetch()}
        actionLabel={t.common.back}
        onAction={() => router.back()}
      />
    );
  }

  const isFav = favoriteIds.includes(item.id);

  const toggleOption = (groupId: string, optionId: string, maxSelect: number) => {
    setValidationError(null);
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

  const handleAdd = () => {
    const check = validateOptionSelection(groups, selectedIds);
    if (!check.valid) {
      setValidationError(`${check.missingGroupName ?? ''} (${t.menu.requiredOption})`);
      return;
    }
    const chosenNames = item.options
      .filter((o) => selectedIds.includes(o.id))
      .map((o) => o.name);

    addItem({
      menuItemId: item.id,
      name: item.name,
      imageUrl: item.imageUrl,
      quantity,
      optionIds: selectedIds,
      optionNames: chosenNames,
      note: note.trim() || undefined,
    });
    router.back();
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Image
          source={resolveDishImage(item.name, item.imageUrl)}
          style={styles.heroImg}
          resizeMode="cover"
        />

        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: theme.colors.text }]}>{item.name}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.menu.favoritesOnly}
              onPress={() => toggleFavorite(item.id)}
              style={styles.favBtn}
            >
              <Heart
                size={22}
                color={isFav ? theme.colors.error : theme.colors.textSecondary}
                fill={isFav ? theme.colors.error : 'transparent'}
              />
            </Pressable>
          </View>

          <PriceText kurus={item.priceKurus} style={styles.price} />

          {item.description ? (
            <Text style={[styles.desc, { color: theme.colors.textSecondary }]}>
              {item.description}
            </Text>
          ) : null}

          {item.allergens.length > 0 ? (
            <View style={styles.allergensRow}>
              <Text style={[styles.sectionLabel, { color: theme.colors.text }]}>
                {t.menu.allergens}:
              </Text>
              {item.allergens.map((a) => (
                <View
                  key={a}
                  style={[styles.badge, { backgroundColor: theme.colors.surfaceElevated }]}
                >
                  <Text style={[styles.badgeText, { color: theme.colors.accent }]}>{a}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {groups.map((group) => (
            <Card key={group.groupId} style={styles.groupCard}>
              <View style={styles.groupHeader}>
                <Text style={[styles.groupTitle, { color: theme.colors.text }]}>
                  {group.groupName}
                </Text>
                <Text style={[styles.groupReq, { color: theme.colors.accent }]}>
                  {group.isRequired || group.minSelect > 0
                    ? t.menu.requiredOption
                    : t.menu.optional}
                </Text>
              </View>

              {group.options.map((opt) => {
                const selected = selectedIds.includes(opt.id);
                return (
                  <Pressable
                    key={opt.id}
                    disabled={!opt.isAvailable}
                    onPress={() => toggleOption(group.groupId, opt.id, group.maxSelect)}
                    style={[
                      styles.optRow,
                      {
                        borderColor: selected ? theme.colors.primary : theme.colors.border,
                        backgroundColor: selected
                          ? theme.colors.surfaceElevated
                          : 'transparent',
                        opacity: opt.isAvailable ? 1 : 0.45,
                      },
                    ]}
                  >
                    <Text style={[styles.optName, { color: theme.colors.text }]}>{opt.name}</Text>
                    {opt.priceDeltaKurus > 0 ? (
                      <PriceText kurus={opt.priceDeltaKurus} />
                    ) : null}
                  </Pressable>
                );
              })}
            </Card>
          ))}

          <View style={styles.noteBlock}>
            <Text style={[styles.sectionLabel, { color: theme.colors.text }]}>
              {t.menu.noteLabel}
            </Text>
            <TextInput
              value={note}
              onChangeText={(txt) => setNote(txt.slice(0, RESTAURANT_CONFIG.noteMaxLength))}
              placeholder={t.menu.notePlaceholder}
              placeholderTextColor={theme.colors.textMuted}
              maxLength={RESTAURANT_CONFIG.noteMaxLength}
              style={[
                styles.noteInput,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                  color: theme.colors.text,
                },
              ]}
            />
          </View>

          <View style={styles.qtyRow}>
            <Button
              title="-"
              variant="secondary"
              onPress={() => setQuantity((q) => Math.max(1, q - 1))}
              style={styles.qtyBtn}
            />
            <Text style={[styles.qtyText, { color: theme.colors.text }]}>{quantity}</Text>
            <Button
              title="+"
              variant="secondary"
              onPress={() => setQuantity((q) => Math.min(20, q + 1))}
              style={styles.qtyBtn}
            />
          </View>

          {validationError ? (
            <Text style={[styles.errText, { color: theme.colors.error }]}>{validationError}</Text>
          ) : null}

          <View style={styles.actions}>
            <Button
              title={item.isAvailable ? t.menu.addToCart : t.common.soldOut}
              disabled={!item.isAvailable}
              onPress={handleAdd}
            />
            <Button title={t.common.back} variant="outline" onPress={() => router.back()} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 32 },
  heroImg: { width: '100%', height: 220 },
  content: { padding: 16, gap: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 22, fontWeight: '700' },
  favBtn: { padding: 8 },
  price: { fontSize: 18 },
  desc: { fontSize: 14, lineHeight: 20 },
  allergensRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  sectionLabel: { fontSize: 13, fontWeight: '600' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  groupCard: { gap: 8 },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  groupTitle: { fontSize: 15, fontWeight: '700' },
  groupReq: { fontSize: 12, fontWeight: '600' },
  optRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optName: { fontSize: 14, fontWeight: '500' },
  noteBlock: { gap: 6 },
  noteInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  qtyBtn: { width: 48, minHeight: 42 },
  qtyText: { fontSize: 18, fontWeight: '700', minWidth: 28, textAlign: 'center' },
  errText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  actions: { gap: 8, marginTop: 4 },
});

