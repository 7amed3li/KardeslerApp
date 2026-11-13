import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { Lock, MapPin } from 'lucide-react-native';
import React, { useState } from 'react';
import { FlatList, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { queryKeys } from '../../src/api/query-keys';
import type { AddressDto } from '../../src/api/types';
import { RESTAURANT_CONFIG } from '../../src/config/restaurant';
import {
  createAddress,
  deleteAddress,
  listAddresses,
} from '../../src/features/addresses/api/addresses.api';
import { useAuthStore } from '../../src/features/auth/model/auth.store';
import { useCartStore } from '../../src/features/cart/model/cart.store';
import { checkDeliveryCoverage } from '../../src/features/menu/api/menu.api';
import { useTranslations } from '../../src/i18n';
import { Badge, Button, Card, Screen, StateView } from '../../src/ui/components';
import { useTheme } from '../../src/ui/themes/ThemeProvider';

const FIXED_CITY = 'İstanbul';
const FIXED_DISTRICT = 'Beyoğlu';

async function resolveCurrentCoords(): Promise<{ lat: number; lng: number } | null> {
  if (Platform.OS === 'web') {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 6000 },
      );
    });
  }
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') return null;
  const pos = await Location.getCurrentPositionAsync({});
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

function FixedRegionFields() {
  const theme = useTheme();
  const { t } = useTranslations();

  return (
    <View style={styles.fixedGroup}>
      <Text style={[styles.hintText, { color: theme.colors.textSecondary }]}>
        {t.addresses.fixedZoneHint}
      </Text>
      <View style={styles.row2}>
        <View
          style={[
            styles.lockedField,
            styles.flex1,
            { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
          ]}
        >
          <View style={styles.lockedHeader}>
            <Text style={[styles.lockedLabel, { color: theme.colors.textMuted }]}>
              {t.addresses.cityLabel}
            </Text>
            <Lock size={12} color={theme.colors.textMuted} />
          </View>
          <Text style={[styles.lockedValue, { color: theme.colors.text }]}>{FIXED_CITY}</Text>
        </View>
        <View
          style={[
            styles.lockedField,
            styles.flex1,
            { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
          ]}
        >
          <View style={styles.lockedHeader}>
            <Text style={[styles.lockedLabel, { color: theme.colors.textMuted }]}>
              {t.addresses.districtLabel}
            </Text>
            <Lock size={12} color={theme.colors.textMuted} />
          </View>
          <Text style={[styles.lockedValue, { color: theme.colors.text }]}>{FIXED_DISTRICT}</Text>
        </View>
      </View>
    </View>
  );
}

interface SavedAddressCardProps {
  item: AddressDto;
  onSelect: (item: AddressDto) => void;
  onDelete: (id: string) => void;
}

function SavedAddressCard({ item, onSelect, onDelete }: SavedAddressCardProps) {
  const theme = useTheme();
  const { t } = useTranslations();

  return (
    <Card style={styles.addrCard}>
      <Text style={[styles.addrLabel, { color: theme.colors.text }]}>{item.label}</Text>
      <Text style={{ color: theme.colors.textSecondary, fontSize: 13 }}>{item.fullAddress}</Text>
      <View style={styles.row2}>
        <Button
          title={t.addresses.selectAddress}
          onPress={() => onSelect(item)}
          style={styles.flex1}
        />
        <Button
          title={t.addresses.deleteAddress}
          variant="outline"
          onPress={() => onDelete(item.id)}
          style={styles.flex1}
        />
      </View>
    </Card>
  );
}

export default function AddressesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslations();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setDeliveryCoords = useCartStore((s) => s.setDeliveryCoords);
  const setDeliveryAddressText = useCartStore((s) => s.setDeliveryAddressText);

  const [label, setLabel] = useState(t.addresses.defaultLabel);
  const [neighborhood, setNeighborhood] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');
  const [apartment, setApartment] = useState('');
  const [notes, setNotes] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: RESTAURANT_CONFIG.defaultCoords.latitude,
    lng: RESTAURANT_CONFIG.defaultCoords.longitude,
  });
  const [locating, setLocating] = useState(false);
  const [zoneCovered, setZoneCovered] = useState<boolean | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  const addrQuery = useQuery({
    queryKey: queryKeys.addresses,
    queryFn: listAddresses,
    enabled: isAuthenticated,
  });

  const createMutation = useMutation({
    mutationFn: createAddress,
    onSuccess: async (created) => {
      setNeighborhood('');
      setStreetAddress('');
      setBuilding('');
      setFloor('');
      setApartment('');
      setNotes('');
      setDeliveryCoords({ lat: created.lat, lng: created.lng });
      setDeliveryAddressText(created.fullAddress);
      await queryClient.invalidateQueries({ queryKey: queryKeys.addresses });
      router.back();
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : t.common.errorTitle);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAddress,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.addresses });
    },
  });

  const handleUseCurrentLocation = async () => {
    setFormError(null);
    setFormNotice(null);
    setLocating(true);
    try {
      const next = await resolveCurrentCoords();
      if (!next) {
        setFormNotice(t.addresses.locationUnavailable);
        return;
      }
      setCoords(next);
      setFormNotice(t.addresses.locationReady);
      const check = await checkDeliveryCoverage(next.lat, next.lng);
      setZoneCovered(check.covered);
    } finally {
      setLocating(false);
    }
  };

  const handleSave = () => {
    setFormError(null);
    setFormNotice(null);
    if (!label.trim() || neighborhood.trim().length < 2 || streetAddress.trim().length < 3) {
      setFormError(t.addresses.validationError);
      return;
    }

    const detailLine = `${neighborhood.trim()}, ${streetAddress.trim()}`;
    const fullAddress = `${detailLine}, ${FIXED_DISTRICT}, ${FIXED_CITY}`;
    setDeliveryCoords(coords);
    setDeliveryAddressText(detailLine);

    if (!isAuthenticated) {
      setFormNotice(t.addresses.guestSavedLocally);
      router.back();
      return;
    }

    createMutation.mutate({
      label: label.trim(),
      fullAddress,
      lat: coords.lat,
      lng: coords.lng,
      ...(building.trim() ? { building: building.trim() } : {}),
      ...(floor.trim() ? { floor: floor.trim() } : {}),
      ...(apartment.trim() ? { apartment: apartment.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
  };

  const handleSelectSaved = (item: AddressDto) => {
    setDeliveryCoords({ lat: item.lat, lng: item.lng });
    setDeliveryAddressText(item.fullAddress);
    router.back();
  };

  if (isAuthenticated && addrQuery.isLoading) {
    return <StateView kind="loading" />;
  }

  const inputStyle = [
    styles.input,
    { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface },
  ];

  return (
    <Screen>
      <FlatList
        data={isAuthenticated ? addrQuery.data?.addresses ?? [] : []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Card style={styles.formCard}>
            <View style={styles.titleRow}>
              <MapPin size={18} color={theme.colors.primary} />
              <Text style={[styles.heading, { color: theme.colors.text }]}>
                {t.addresses.newAddressTitle}
              </Text>
            </View>

            <FixedRegionFields />

            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder={t.addresses.labelPlaceholder}
              placeholderTextColor={theme.colors.textMuted}
              style={inputStyle}
            />
            <TextInput
              value={neighborhood}
              onChangeText={setNeighborhood}
              placeholder={t.addresses.neighborhoodPlaceholder}
              placeholderTextColor={theme.colors.textMuted}
              style={inputStyle}
            />
            <TextInput
              value={streetAddress}
              onChangeText={setStreetAddress}
              placeholder={t.addresses.streetPlaceholder}
              placeholderTextColor={theme.colors.textMuted}
              style={inputStyle}
            />

            <View style={styles.row3}>
              <TextInput
                value={building}
                onChangeText={setBuilding}
                placeholder={t.addresses.buildingPlaceholder}
                placeholderTextColor={theme.colors.textMuted}
                style={[...inputStyle, styles.flex1]}
              />
              <TextInput
                value={floor}
                onChangeText={setFloor}
                placeholder={t.addresses.floorPlaceholder}
                placeholderTextColor={theme.colors.textMuted}
                style={[...inputStyle, styles.flex1]}
              />
              <TextInput
                value={apartment}
                onChangeText={setApartment}
                placeholder={t.addresses.apartmentPlaceholder}
                placeholderTextColor={theme.colors.textMuted}
                style={[...inputStyle, styles.flex1]}
              />
            </View>

            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={t.addresses.notesPlaceholder}
              placeholderTextColor={theme.colors.textMuted}
              style={inputStyle}
            />

            {zoneCovered !== null ? (
              <Badge
                label={zoneCovered ? t.addresses.zoneCovered : t.addresses.zoneOutside}
                tone={zoneCovered ? 'success' : 'accent'}
              />
            ) : null}

            <View style={styles.row2}>
              <Button
                title={locating ? t.addresses.locating : t.addresses.useLocation}
                variant="outline"
                loading={locating}
                onPress={handleUseCurrentLocation}
                style={styles.flex1}
              />
              <Button
                title={t.common.save}
                loading={createMutation.isPending}
                onPress={handleSave}
                style={styles.flex1}
              />
            </View>

            {formError ? (
              <Text style={{ color: theme.colors.error, fontSize: 12 }}>{formError}</Text>
            ) : null}
            {formNotice ? (
              <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>{formNotice}</Text>
            ) : null}
          </Card>
        }
        renderItem={({ item }) => (
          <SavedAddressCard
            item={item}
            onSelect={handleSelectSaved}
            onDelete={(id) => deleteMutation.mutate(id)}
          />
        )}
        ListEmptyComponent={
          !isAuthenticated ? (
            <Card style={styles.guestCard}>
              <Text style={{ color: theme.colors.textSecondary, fontSize: 13 }}>
                {t.addresses.signInToSave}
              </Text>
              <Button
                title={t.auth.title}
                variant="outline"
                onPress={() => router.push('/auth')}
              />
            </Card>
          ) : null
        }
        ListFooterComponent={
          <Button title={t.common.back} variant="outline" onPress={() => router.back()} />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 12 },
  formCard: { gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { fontSize: 17, fontWeight: '700' },
  fixedGroup: { gap: 8 },
  hintText: { fontSize: 12, lineHeight: 17 },
  lockedField: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  lockedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lockedLabel: { fontSize: 11, fontWeight: '600' },
  lockedValue: { fontSize: 14, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 42,
    fontSize: 14,
  },
  row2: { flexDirection: 'row', gap: 8 },
  row3: { flexDirection: 'row', gap: 6 },
  flex1: { flex: 1 },
  addrCard: { gap: 8 },
  addrLabel: { fontSize: 15, fontWeight: '700' },
  guestCard: { gap: 10 },
});
