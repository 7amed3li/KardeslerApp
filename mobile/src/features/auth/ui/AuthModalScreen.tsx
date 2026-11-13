import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ApiClientError } from '../../../api/errors';
import { useTranslations } from '../../../i18n';
import { Button, Card, Screen } from '../../../ui/components';
import { useTheme } from '../../../ui/themes/ThemeProvider';
import { exchangeGoogleCode, requestCustomerOtp, verifyCustomerOtp } from '../api/auth.api';
import {
  isValidOtpCode,
  isValidTurkishMobile,
  normalizeTurkishPhone,
} from '../model/auth.validation';
import { runGooglePkceFlow } from '../model/google-auth';
import { GoogleSignInButton } from './GoogleSignInButton';

export function AuthModalScreen() {
  const theme = useTheme();
  const { t } = useTranslations();
  const router = useRouter();

  const [showPhoneAuth, setShowPhoneAuth] = useState(false);
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const googleInFlightRef = useRef(false);
  const boxRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const navigateAfterAuth = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const mapAuthError = (err: unknown): string => {
    if (err instanceof ApiClientError) {
      if (err.status === 429 || err.code === 'RATE_LIMITED') {
        return t.auth.rateLimited;
      }
      if (err.status === 503 || err.code === 'SERVICE_UNAVAILABLE') {
        return t.auth.serviceUnavailable;
      }
      return err.message;
    }
    return t.auth.googleError;
  };

  const handleGoogleSignIn = async () => {
    if (googleInFlightRef.current || loading) return;
    googleInFlightRef.current = true;
    setErrorMsg(null);
    setGoogleLoading(true);
    try {
      const flow = await runGooglePkceFlow(Platform.OS);
      if (flow.status === 'not_configured') {
        setErrorMsg(t.auth.googleNotConfigured);
        return;
      }
      if (flow.status === 'cancelled') {
        setErrorMsg(t.auth.googleCancelled);
        return;
      }
      if (flow.status === 'error') {
        setErrorMsg(t.auth.googleError);
        return;
      }

      await exchangeGoogleCode(flow.payload);
      navigateAfterAuth();
    } catch (err) {
      setErrorMsg(mapAuthError(err));
    } finally {
      googleInFlightRef.current = false;
      setGoogleLoading(false);
    }
  };

  const handleSendOtp = async () => {
    setErrorMsg(null);
    if (!isValidTurkishMobile(phoneInput)) {
      setErrorMsg(t.auth.subtitle);
      return;
    }
    const e164 = normalizeTurkishPhone(phoneInput);
    setLoading(true);
    try {
      await requestCustomerOtp(e164);
      setNormalizedPhone(e164);
      setStep('otp');
      setCountdown(60);
      setOtpDigits(['', '', '', '', '', '']);
    } catch (err) {
      setErrorMsg(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (codeOverride?: string) => {
    setErrorMsg(null);
    const code = codeOverride ?? otpDigits.join('');
    if (!isValidOtpCode(code)) {
      setErrorMsg('6 haneli doğrulama kodunu girin');
      return;
    }
    setLoading(true);
    try {
      await verifyCustomerOtp(normalizedPhone, code);
      navigateAfterAuth();
    } catch (err) {
      setErrorMsg(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDigitChange = (index: number, value: string) => {
    const clean = value.replace(/\D/g, '');
    if (clean.length === 6) {
      const split = clean.slice(0, 6).split('');
      setOtpDigits(split);
      void handleVerifyOtp(clean);
      return;
    }
    const char = clean.slice(-1);
    const next = [...otpDigits];
    next[index] = char;
    setOtpDigits(next);
    if (char && index < 5) {
      boxRefs.current[index + 1]?.focus();
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Card style={styles.card}>
            <Text style={[styles.title, { color: theme.colors.text }]}>
              {step === 'otp' && showPhoneAuth ? t.auth.verifyTitle : t.auth.title}
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
              {step === 'otp' && showPhoneAuth
                ? `${normalizedPhone} ${t.auth.verifySubtitle}`
                : t.auth.subtitle}
            </Text>

            <GoogleSignInButton
              testID="google-signin-btn"
              title={googleLoading ? t.auth.googleAuthenticating : t.auth.continueWithGoogle}
              loading={googleLoading}
              disabled={loading}
              onPress={() => void handleGoogleSignIn()}
            />

            <Text style={[styles.preservedNote, { color: theme.colors.textMuted }]}>
              {t.auth.basketPreserved}
            </Text>

            <Pressable
              testID="toggle-phone-auth-btn"
              onPress={() => {
                setShowPhoneAuth((prev) => !prev);
                setErrorMsg(null);
              }}
              style={styles.phoneToggle}
            >
              <Text style={[styles.phoneToggleText, { color: theme.colors.primary }]}>
                {showPhoneAuth ? t.auth.phoneToggleHide : t.auth.orUsePhone}
              </Text>
            </Pressable>

            {showPhoneAuth ? (
              step === 'phone' ? (
                <View style={styles.fieldGroup}>
                  <Text style={[styles.label, { color: theme.colors.text }]}>{t.auth.phoneLabel}</Text>
                  <View
                    style={[
                      styles.phoneRow,
                      { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated },
                    ]}
                  >
                    <Text style={[styles.prefix, { color: theme.colors.text }]}>+90</Text>
                    <TextInput
                      testID="phone-input"
                      value={phoneInput}
                      onChangeText={setPhoneInput}
                      placeholder={t.auth.phonePlaceholder}
                      placeholderTextColor={theme.colors.textMuted}
                      keyboardType="phone-pad"
                      autoComplete="tel"
                      maxLength={14}
                      style={[styles.phoneInput, { color: theme.colors.text }]}
                    />
                  </View>
                  <Button
                    testID="send-otp-btn"
                    title={t.auth.sendCode}
                    loading={loading}
                    onPress={() => void handleSendOtp()}
                  />
                </View>
              ) : (
                <View style={styles.fieldGroup}>
                  <View style={styles.otpRow}>
                    {otpDigits.map((digit, idx) => (
                      <TextInput
                        key={idx}
                        ref={(el) => {
                          boxRefs.current[idx] = el;
                        }}
                        testID={`otp-box-${idx}`}
                        value={digit}
                        onChangeText={(v) => handleDigitChange(idx, v)}
                        keyboardType="number-pad"
                        textContentType="oneTimeCode"
                        autoComplete="sms-otp"
                        maxLength={idx === 0 ? 6 : 1}
                        style={[
                          styles.otpBox,
                          {
                            borderColor: theme.colors.border,
                            backgroundColor: theme.colors.surfaceElevated,
                            color: theme.colors.text,
                          },
                        ]}
                      />
                    ))}
                  </View>
                  <Button
                    testID="verify-otp-btn"
                    title={t.auth.verifyButton}
                    loading={loading}
                    onPress={() => void handleVerifyOtp()}
                  />
                  <Button
                    title={
                      countdown > 0 ? `${countdown} ${t.auth.resendIn}` : t.auth.resendCode
                    }
                    variant="outline"
                    disabled={countdown > 0 || loading}
                    onPress={() => void handleSendOtp()}
                  />
                </View>
              )
            ) : null}

            {errorMsg ? (
              <Text testID="auth-error" style={[styles.error, { color: theme.colors.error }]}>
                {errorMsg}
              </Text>
            ) : null}

            <Button
              title={t.common.cancel}
              variant="outline"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
            />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    gap: 14,
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  preservedNote: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  phoneToggle: {
    alignSelf: 'center',
    paddingVertical: 6,
  },
  phoneToggleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  fieldGroup: {
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 48,
    gap: 8,
  },
  prefix: {
    fontSize: 16,
    fontWeight: '700',
  },
  phoneInput: {
    flex: 1,
    fontSize: 16,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  otpBox: {
    flex: 1,
    height: 50,
    borderWidth: 1,
    borderRadius: 10,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
  },
  error: {
    fontSize: 13,
    fontWeight: '600',
  },
});
