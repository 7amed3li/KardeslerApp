import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { queryKeys } from '../../src/api/query-keys';
import { RESTAURANT_CONFIG } from '../../src/config/restaurant';
import {
  createAddress,
  deleteAddress,
  listAddresses,
} from '../../src/features/addresses/api/addresses.api';
import { useTranslations } from '../../src/i18n';
import { Button, Card, Screen, StateView } from '../../src/ui/components';
import { useTheme } from '../../src/ui/themes/ThemeProvider';

export default function AddressesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslations();

  const [label, setLabel] = useState('Ev');
  const [fullAddress, setFullAddress] = useState('');
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');
  const [apartment, setApartment] = useState('');
  const [notes, setNotes] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: RESTAURANT_CONFIG.defaultCoords.latitude,
    lng: RESTAURANT_CONFIG.defaultCoords.longitude,
  });
  const [formError, setFormError] = useState<string | null>(null);

  const addrQuery = useQuery({
    queryKey: queryKeys.addresses,
    queryFn: listAddresses,
  });

  const createMutation = useMutation({
    mutationFn: createAddress,
    onSuccess: async () => {
      setFullAddress('');
      setBuilding('');
      setFloor('');
      setApartment('');
      setNotes('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.addresses });
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
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status === 'granted') {
      const pos = await Location.getCurrentPositionAsync({});
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    }
  };

  const handleSave = () => {
    setFormError(null);
    if (!label.trim() || fullAddress.trim().length < 5) {
      setFormError('Lütfen geçerli bir adres başlığı ve açık adres girin.');
      return;
    }
    createMutation.mutate({
      label: label.trim(),
      fullAddress: fullAddress.trim(),
      lat: coords.lat,
      lng: coords.lng,
      ...(building.trim() ? { building: building.trim() } : {}),
      ...(floor.trim() ? { floor: floor.trim() } : {}),
      ...(apartment.trim() ? { apartment: apartment.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
  };

  if (addrQuery.isLoading) return <StateView kind="loading" />;

  return (
    <Screen edges={['top', 'bottom']}>
      <FlatList
        data={addrQuery.data?.addresses ?? []}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Card style={styles.formCard}>
            <Text style={[styles.heading, { color: theme.colors.text }]}>
              {t.checkout.addAddress}
            </Text>
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder="Başlık (Ev, İş)"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]}
            />
            <TextInput
              value={fullAddress}
              onChangeText={setFullAddress}
              placeholder="Mahalle, Sokak, No..."
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]}
            />
            <View style={styles.row3}>
              <TextInput
                value={building}
                onChangeText={setBuilding}
                placeholder="Bina"
                placeholderTextColor={theme.colors.textMuted}
                style={[styles.input, styles.flex1, { borderColor: theme.colors.border, color: theme.colors.text }]}
              />
              <TextInput
                value={floor}
                onChangeText={setFloor}
                placeholder="Kat"
                placeholderTextColor={theme.colors.textMuted}
                style={[styles.input, styles.flex1, { borderColor: theme.colors.border, color: theme.colors.text }]}
              />
              <TextInput
                value={apartment}
                onChangeText={setApartment}
                placeholder="Daire"
                placeholderTextColor={theme.colors.textMuted}
                style={[styles.input, styles.flex1, { borderColor: theme.colors.border, color: theme.colors.text }]}
              />
            </View>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Kurye notu"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]}
            />
            <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
              Konum: {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
            </Text>
            <View style={styles.row2}>
              <Button
                title="Konumu Al"
                variant="secondary"
                onPress={() => void handleUseCurrentLocation()}
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
          </Card>
        }
        renderItem={({ item }) => (
          <Card style={styles.addrCard}>
            <Text style={[styles.addrLabel, { color: theme.colors.text }]}>{item.label}</Text>
            <Text style={{ color: theme.colors.textSecondary, fontSize: 13 }}>
              {item.fullAddress}
            </Text>
            <Button
              title={t.common.delete}
              variant="outline"
              onPress={() => deleteMutation.mutate(item.id)}
            />
          </Card>
        )}
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
  heading: { fontSize: 17, fontWeight: '700' },
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
  addrCard: { gap: 6 },
  addrLabel: { fontSize: 15, fontWeight: '700' },
});
