import type { SupportedLanguage } from '@kardesler/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import {
  Award,
  Bell,
  ChevronLeft,
  ChevronRight,
  Globe,
  LogOut,
  MapPin,
  Share2,
  Shield,
  Tag,
  Trash2,
  User,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  I18nManager,
  Linking,
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
  linkGoogleIdentity,
  listCustomerIdentities,
  logoutCustomer,
  unlinkCustomerIdentity,
  updateMyProfile,
} from '../../src/features/auth/api/auth.api';
import { useAuthStore } from '../../src/features/auth/model/auth.store';
import {
  isValidTurkishMobile,
  normalizeTurkishPhone,
} from '../../src/features/auth/model/auth.validation';
import { runGooglePkceFlow } from '../../src/features/auth/model/google-auth';
import { registerForPushNotificationsIfPermitted } from '../../src/features/notifications/notifications.service';
import {
  fetchMyLoyalty,
  fetchMyReferrals,
  recordConsent,
} from '../../src/features/profile/api/profile.api';
import { useTranslations } from '../../src/i18n';
import { Badge, BottomSheet, Button, Card, Screen, StateView } from '../../src/ui/components';
import { useTheme } from '../../src/ui/themes/ThemeProvider';

const LANGS: SupportedLanguage[] = ['tr', 'en', 'ar'];

export default function ProfileTabScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { language, setLanguage, t } = useTranslations();

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [marketingPush, setMarketingPush] = useState(false);
  const [osNotifGranted, setOsNotifGranted] = useState<boolean | null>(null);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [identityLoading, setIdentityLoading] = useState(false);
  const [identityMsg, setIdentityMsg] = useState<string | null>(null);

  useEffect(() => {
    setName(user?.name ?? '');
    setEmail(user?.email ?? '');
    setPhone(user?.phone ?? '');
  }, [user]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void Notifications.getPermissionsAsync()
      .then((res) => setOsNotifGranted(res.status === 'granted'))
      .catch(() => setOsNotifGranted(false));
  }, []);

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

  const identitiesQuery = useQuery({
    queryKey: ['customer-identities'],
    enabled: isAuthenticated,
    queryFn: listCustomerIdentities,
  });

  const googleIdentity = identitiesQuery.data?.identities.find((i) => i.provider === 'google');

  const handleLinkGoogle = async () => {
    setIdentityMsg(null);
    setIdentityLoading(true);
    try {
      const flow = await runGooglePkceFlow(Platform.OS);
      if (flow.status === 'not_configured') {
        setIdentityMsg(t.auth.googleNotConfigured);
        return;
      }
      if (flow.status === 'cancelled') {
        setIdentityMsg(t.auth.googleCancelled);
        return;
      }
      if (flow.status === 'error') {
        setIdentityMsg(t.auth.googleError);
        return;
      }
      await linkGoogleIdentity(flow.payload);
      await identitiesQuery.refetch();
    } catch (err) {
      setIdentityMsg(err instanceof Error ? err.message : t.auth.googleError);
    } finally {
      setIdentityLoading(false);
    }
  };

  const handleUnlinkGoogle = async () => {
    setIdentityMsg(null);
    if (!user?.phone) {
      setIdentityMsg(t.auth.unlinkBlockedNoPhone);
      return;
    }
    setIdentityLoading(true);
    try {
      await unlinkCustomerIdentity('google');
      await identitiesQuery.refetch();
    } catch (err) {
      setIdentityMsg(err instanceof Error ? err.message : t.common.errorTitle);
    } finally {
      setIdentityLoading(false);
    }
  };

  const handleLanguageChange = (lang: SupportedLanguage) => {
    setLanguage(lang);
    if (isAuthenticated) {
      void updateMyProfile({ preferredLanguage: lang });
    }
  };

  const ChevronIcon = I18nManager.isRTL ? ChevronLeft : ChevronRight;

  const renderLanguageSelector = () => (
    <Card variant="elevated" style={{ gap: theme.spacing.xs }}>
      <View style={styles.inlineRow}>
        <Globe size={18} color={theme.colors.primary} />
        <Text style={[theme.typography.titleSm, { color: theme.colors.text }]}>
          {t.profile.language}
        </Text>
      </View>
      <View style={[styles.inlineRow, { gap: theme.spacing.xs }]}>
        {LANGS.map((l) => (
          <Button
            key={l}
            label={l.toUpperCase()}
            size="sm"
            variant={language === l ? 'primary' : 'outline'}
            style={{ flex: 1 }}
            onPress={() => handleLanguageChange(l)}
          />
        ))}
      </View>
    </Card>
  );

  if (!isAuthenticated) {
    return (
      <Screen edges={['top']}>
        <ScrollView
          contentContainerStyle={{
            padding: theme.spacing.md,
            gap: theme.spacing.md,
            flexGrow: 1,
          }}
        >
          <Text style={[theme.typography.titleLg, { color: theme.colors.text }]}>
            {t.profile.title}
          </Text>
          <StateView
            kind="empty"
            title={t.profile.guestTitle}
            message={t.profile.guestDesc}
            actionLabel={t.common.loginRequired}
            onAction={() => router.push('/auth')}
          />
          {renderLanguageSelector()}
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.md,
          gap: theme.spacing.md,
          paddingBottom: theme.spacing.xxl,
        }}
      >
        <Text style={[theme.typography.titleLg, { color: theme.colors.text }]}>
          {t.profile.title}
        </Text>

        {/* Section 1: Account */}
        <View style={{ gap: theme.spacing.xs }}>
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
            {t.profile.sectionAccount}
          </Text>
          <Card variant="elevated" style={{ gap: theme.spacing.sm }}>
            <View style={styles.inlineRow}>
              <User size={18} color={theme.colors.primary} />
              <Text style={[theme.typography.titleSm, { color: theme.colors.text }]}>
                {user?.phone ?? user?.email ?? user?.name ?? ''}
              </Text>
            </View>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t.profile.editName}
              placeholderTextColor={theme.colors.textMuted}
              style={[
                theme.typography.body,
                styles.input,
                {
                  color: theme.colors.text,
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radii.sm,
                  minHeight: theme.hitTarget.min,
                  paddingHorizontal: theme.spacing.sm,
                },
              ]}
            />
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={t.profile.editEmail}
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              style={[
                theme.typography.body,
                styles.input,
                {
                  color: theme.colors.text,
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radii.sm,
                  minHeight: theme.hitTarget.min,
                  paddingHorizontal: theme.spacing.sm,
                },
              ]}
            />
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder={t.auth.phonePlaceholder}
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="phone-pad"
              style={[
                theme.typography.body,
                styles.input,
                {
                  color: theme.colors.text,
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radii.sm,
                  minHeight: theme.hitTarget.min,
                  paddingHorizontal: theme.spacing.sm,
                },
              ]}
            />
            <Button
              label={t.common.save}
              loading={saving}
              onPress={() => {
                setSaving(true);
                const normalized = phone.trim() && isValidTurkishMobile(phone)
                  ? normalizeTurkishPhone(phone)
                  : undefined;
                void updateMyProfile({
                  name: name.trim() || undefined,
                  email: email.trim() || undefined,
                  phone: normalized,
                }).finally(() => setSaving(false));
              }}
            />
          </Card>

          <Card variant="elevated" style={{ gap: theme.spacing.xs }}>
            <Text style={[theme.typography.titleSm, { color: theme.colors.text }]}>
              {t.auth.linkedAccountsTitle}
            </Text>
            <View style={styles.rowBetween}>
              <Text style={[theme.typography.bodySm, { color: theme.colors.textSecondary, flex: 1 }]}>
                {googleIdentity
                  ? `${t.auth.googleLinked}${googleIdentity.emailAtLink ? ` (${googleIdentity.emailAtLink})` : ''}`
                  : t.auth.googleNotLinked}
              </Text>
              {googleIdentity ? (
                <Button
                  label={t.auth.unlinkGoogle}
                  variant="outline"
                  size="sm"
                  loading={identityLoading}
                  onPress={() => void handleUnlinkGoogle()}
                />
              ) : (
                <Button
                  label={t.auth.linkGoogle}
                  variant="outline"
                  size="sm"
                  loading={identityLoading}
                  onPress={() => void handleLinkGoogle()}
                />
              )}
            </View>
            {identityMsg ? (
              <Text style={[theme.typography.caption, { color: theme.colors.error }]}>
                {identityMsg}
              </Text>
            ) : null}
          </Card>
        </View>

        {/* Section: Offers & Campaigns */}
        <View style={{ gap: theme.spacing.xs }}>
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
            {t.offers?.title ?? (language === 'ar' ? 'العروض والحملات' : language === 'tr' ? 'Kampanyalar & Fırsatlar' : 'Offers & Deals')}
          </Text>
          <Pressable onPress={() => router.push('/offers')} accessibilityRole="button">
            <Card variant="elevated" style={styles.rowBetween}>
              <View style={styles.inlineRow}>
                <Tag size={18} color={theme.colors.accent} />
                <Text style={[theme.typography.titleSm, { color: theme.colors.text }]}>
                  {t.offers?.heroTitle ?? (language === 'ar' ? 'أقوى العروض والتخفيضات' : language === 'tr' ? 'Tüm Kampanyalar ve Fırsatlar' : 'All Offers & Deals')}
                </Text>
              </View>
              <ChevronIcon size={18} color={theme.colors.textMuted} />
            </Card>
          </Pressable>
        </View>

        {/* Section 2: Addresses */}
        <View style={{ gap: theme.spacing.xs }}>
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
            {t.profile.sectionAddresses}
          </Text>
          <Pressable onPress={() => router.push('/addresses')} accessibilityRole="button">
            <Card variant="elevated" style={styles.rowBetween}>
              <View style={styles.inlineRow}>
                <MapPin size={18} color={theme.colors.primary} />
                <Text style={[theme.typography.titleSm, { color: theme.colors.text }]}>
                  {t.profile.addresses}
                </Text>
              </View>
              <ChevronIcon size={18} color={theme.colors.textMuted} />
            </Card>
          </Pressable>
        </View>

        {/* Section 3: Loyalty & Referrals */}
        <View style={{ gap: theme.spacing.xs }}>
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
            {t.profile.sectionLoyalty}
          </Text>
          <Card variant="elevated" style={{ gap: theme.spacing.sm }}>
            <View style={styles.rowBetween}>
              <View style={styles.inlineRow}>
                <Award size={18} color={theme.colors.accent} />
                <Text style={[theme.typography.body, { color: theme.colors.text }]}>
                  {t.profile.loyaltyPoints}
                </Text>
              </View>
              <Text style={[theme.typography.titleMd, { color: theme.colors.accent }]}>
                {loyaltyQuery.data?.pointsBalance ?? 0}
              </Text>
            </View>
            {referralQuery.data?.referralCode ? (
              <View style={styles.rowBetween}>
                <View>
                  <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                    {t.profile.referralCode}
                  </Text>
                  <Text style={[theme.typography.titleSm, { color: theme.colors.text }]}>
                    {referralQuery.data.referralCode}
                  </Text>
                </View>
                <Button
                  label={t.profile.shareReferral}
                  size="sm"
                  variant="outline"
                  icon={<Share2 size={14} color={theme.colors.primary} />}
                  onPress={() => void Share.share({ message: referralQuery.data?.referralCode ?? '' })}
                />
              </View>
            ) : null}
          </Card>
        </View>

        {/* Section 4: Preferences (Language + Notifications) */}
        <View style={{ gap: theme.spacing.xs }}>
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
            {t.profile.sectionPreferences}
          </Text>
          {renderLanguageSelector()}

          <Card variant="elevated" style={{ gap: theme.spacing.sm }}>
            <View style={styles.rowBetween}>
              <View style={styles.inlineRow}>
                <Bell size={18} color={theme.colors.primary} />
                <Text style={[theme.typography.titleSm, { color: theme.colors.text }]}>
                  {t.profile.notifications}
                </Text>
              </View>
              {osNotifGranted !== null ? (
                <Badge
                  label={`${t.profile.osPermissionStatus}: ${
                    osNotifGranted
                      ? t.profile.osPermissionGranted
                      : t.profile.osPermissionDenied
                  }`}
                  tone={osNotifGranted ? 'success' : 'neutral'}
                />
              ) : null}
            </View>

            <View style={styles.rowBetween}>
              <Text style={[theme.typography.body, { color: theme.colors.text, flex: 1 }]}>
                {t.profile.pushOrderUpdates}
              </Text>
              <Button
                label={
                  osNotifGranted
                    ? t.profile.openSystemSettings
                    : t.orders.enableNotifications
                }
                size="sm"
                variant="outline"
                onPress={() => {
                  if (osNotifGranted === false && Platform.OS !== 'web') {
                    void registerForPushNotificationsIfPermitted().then((token) =>
                      setOsNotifGranted(Boolean(token)),
                    );
                  } else if (Platform.OS !== 'web') {
                    void Linking.openSettings();
                  }
                }}
              />
            </View>

            <View style={styles.rowBetween}>
              <Text style={[theme.typography.body, { color: theme.colors.text, flex: 1 }]}>
                {t.profile.pushMarketing}
              </Text>
              <Switch
                value={marketingPush}
                onValueChange={(next) => {
                  setMarketingPush(next);
                  void recordConsent({
                    type: 'marketing_push',
                    granted: next,
                    source: 'mobile_profile',
                    version: '1.0',
                  });
                }}
                trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
              />
            </View>
          </Card>
        </View>

        {/* Section 5: Support & Legal + KVKK Delete */}
        <View style={{ gap: theme.spacing.xs }}>
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
            {t.profile.sectionSupport}
          </Text>
          <Card variant="elevated" style={{ gap: theme.spacing.xs }}>
            <View style={styles.inlineRow}>
              <Shield size={16} color={theme.colors.textSecondary} />
              <Text style={[theme.typography.titleSm, { color: theme.colors.text }]}>
                {t.profile.privacyNotice}
              </Text>
            </View>
            <Text style={[theme.typography.bodySm, { color: theme.colors.textSecondary }]}>
              {t.profile.privacySummary}
            </Text>
          </Card>

          <Button
            label={t.auth.logout}
            variant="outline"
            icon={<LogOut size={16} color={theme.colors.primary} />}
            onPress={() => {
              void logoutCustomer(queryClient);
            }}
          />

          <Button
            label={t.auth.deleteAccount}
            variant="danger"
            icon={<Trash2 size={16} color="#FFFFFF" />}
            onPress={() => setDeleteStep(1)}
          />
        </View>
      </ScrollView>

      {/* 2-Step KVKK Account Deletion Confirmation Sheet */}
      <BottomSheet
        visible={deleteStep > 0}
        onClose={() => setDeleteStep(0)}
        title={t.auth.deleteAccount}
        subtitle={
          deleteStep === 1 ? t.auth.deleteAccountConfirm : t.auth.deleteAccountStep2
        }
        closeLabel={t.common.close}
      >
        <View style={{ gap: theme.spacing.sm }}>
          {deleteStep === 1 ? (
            <Button
              label={t.common.confirm}
              variant="danger"
              fullWidth
              onPress={() => setDeleteStep(2)}
            />
          ) : (
            <Button
              label={t.auth.deleteAccount}
              variant="danger"
              fullWidth
              onPress={() => {
                setDeleteStep(0);
                void deleteMyAccount(queryClient);
              }}
            />
          )}
          <Button
            label={t.common.cancel}
            variant="secondary"
            fullWidth
            onPress={() => setDeleteStep(0)}
          />
        </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  input: {
    borderWidth: 1,
  },
});
