import type { SupportedLanguage } from '@kardesler/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { queryKeys } from '../../src/api/query-keys';
import {
  deleteMyAccount,
  logoutCustomer,
  updateMyProfile,
} from '../../src/features/auth/api/auth.api';
import { useAuthStore } from '../../src/features/auth/model/auth.store';
import { registerForPushNotificationsIfPermitted } from '../../src/features/notifications/notifications.service';
import {
  fetchMyLoyalty,
  fetchMyReferrals,
  recordConsent,
} from '../../src/features/profile/api/profile.api';
import { useTranslations } from '../../src/i18n';
import { Button, Card, Screen, StateView } from '../../src/ui/components';
import { useTheme } from '../../src/ui/themes/ThemeProvider';

export default function ProfileTabScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { language, setLanguage, t } = useTranslations();

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [saving, setSaving] = useState(false);
  const [marketingPush, setMarketingPush] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loyaltyQuery = useQuery({
    queryKey: queryKeys.loyalty,
    enabled: isAuthenticated,
    queryFn: fetchMyLoyalty,
  });

  const referralQuery = useQuery({
    queryKey: queryKeys.referrals,
    enabled: isAuthenticated,
    queryFn: fetchMyReferrals,
  });

  const handleLanguageChange = (lang: SupportedLanguage) => {
    setLanguage(lang);
    if (isAuthenticated) {
      void updateMyProfile({ preferredLanguage: lang });
    }
  };

  if (!isAuthenticated) {
    return (
      <Screen>
        <View style={styles.guestWrap}>
          <StateView
            kind="empty"
            title={t.profile.guestTitle}
            message={t.profile.guestDesc}
            actionLabel={t.common.loginRequired}
            onAction={() => router.push('/auth')}
          />
          <Card style={styles.langCard}>
            <Text style={{ color: theme.colors.text, fontWeight: '700' }}>
              {t.profile.language}
            </Text>
            <View style={styles.langRow}>
              {(['tr', 'en', 'ar'] as SupportedLanguage[]).map((lang) => (
                <Button
                  key={lang}
                  title={lang.toUpperCase()}
                  variant={language === lang ? 'primary' : 'outline'}
                  style={styles.langBtn}
                  onPress={() => handleLanguageChange(lang)}
                />
              ))}
            </View>
          </Card>
        </View>
      </Screen>
    );
  }

  const referralCode = referralQuery.data?.referralCode ?? user?.referralCode ?? '';

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await updateMyProfile({
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
        preferredLanguage: language,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleMarketing = async (val: boolean) => {
    setMarketingPush(val);
    if (val) {
      await registerForPushNotificationsIfPermitted();
    }
    await recordConsent({
      type: 'marketing_push',
      granted: val,
      source: 'mobile_profile',
      version: '1.0',
    });
  };

  const handleDelete = () => {
    if (Platform.OS === 'web') {
      if (!confirmDelete) {
        setConfirmDelete(true);
        return;
      }
      void deleteMyAccount(queryClient);
      return;
    }
    Alert.alert(t.auth.deleteAccount, t.auth.deleteAccountConfirm, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.common.delete,
        style: 'destructive',
        onPress: () => void deleteMyAccount(queryClient),
      },
    ]);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            {t.profile.loyaltyPoints}: {loyaltyQuery.data?.pointsBalance ?? 0}
          </Text>
          {referralCode ? (
            <View style={styles.refRow}>
              <Text style={{ color: theme.colors.textSecondary }}>
                {t.profile.referralCode}: <Text style={{ fontWeight: '700' }}>{referralCode}</Text>
              </Text>
              <Button
                title={t.profile.shareReferral}
                variant="secondary"
                onPress={() =>
                  void Share.share({
                    message: `Kardeşler Cihangir davet kodum: ${referralCode}`,
                  })
                }
              />
            </View>
          ) : null}
        </Card>

        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            {t.profile.editName}
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t.profile.editName}
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]}
          />
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder={t.profile.editEmail}
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]}
          />
          <Button
            title={t.common.save}
            loading={saving}
            onPress={() => void handleSaveProfile()}
          />
        </Card>

        <Pressable onPress={() => router.push('/addresses')}>
          <Card style={styles.card}>
            <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>
              {t.profile.addresses} →
            </Text>
          </Card>
        </Pressable>

        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            {t.profile.language}
          </Text>
          <View style={styles.langRow}>
            {(['tr', 'en', 'ar'] as SupportedLanguage[]).map((lang) => (
              <Button
                key={lang}
                title={lang.toUpperCase()}
                variant={language === lang ? 'primary' : 'outline'}
                style={styles.langBtn}
                onPress={() => handleLanguageChange(lang)}
              />
            ))}
          </View>
        </Card>

        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            {t.profile.notifications}
          </Text>
          <View style={styles.switchRow}>
            <Text style={{ color: theme.colors.text, flex: 1 }}>{t.profile.pushMarketing}</Text>
            <Switch value={marketingPush} onValueChange={(v) => void handleToggleMarketing(v)} />
          </View>
        </Card>

        <Button
          title={t.auth.logout}
          variant="outline"
          onPress={() => void logoutCustomer(queryClient)}
        />

        <Button
          title={confirmDelete ? `${t.common.confirm}: ${t.auth.deleteAccount}` : t.auth.deleteAccount}
          variant="danger"
          onPress={handleDelete}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  guestWrap: { flex: 1, paddingBottom: 16 },
  langCard: { marginHorizontal: 16, gap: 10 },
  scroll: { padding: 16, gap: 12 },
  card: { gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  refRow: { gap: 8 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, height: 42, fontSize: 14 },
  langRow: { flexDirection: 'row', gap: 8 },
  langBtn: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
