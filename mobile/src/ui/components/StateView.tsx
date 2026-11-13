import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslations } from '../../i18n';
import { useTheme } from '../themes/ThemeProvider';
import { Button } from './Button';

export type ViewStateKind = 'loading' | 'empty' | 'error' | 'offline' | 'closed' | 'paused';

export function StateView({
  kind,
  title,
  message,
  onRetry,
  actionLabel,
  onAction,
}: {
  kind: ViewStateKind;
  title?: string;
  message?: string;
  onRetry?: () => void;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslations();

  if (kind === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={[styles.desc, { color: theme.colors.textSecondary }]}>
          {title ?? t.common.loading}
        </Text>
      </View>
    );
  }

  const defaultTitle =
    kind === 'offline'
      ? t.common.offlineTitle
      : kind === 'closed'
        ? t.common.closedTitle
        : kind === 'paused'
          ? t.common.pausedTitle
          : kind === 'error'
            ? t.common.errorTitle
            : '';

  const defaultDesc = kind === 'offline' ? t.common.offlineDesc : undefined;

  return (
    <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
      <Text
        style={[
          styles.title,
          { color: kind === 'error' ? theme.colors.error : theme.colors.text },
        ]}
      >
        {title ?? defaultTitle}
      </Text>
      {message ?? defaultDesc ? (
        <Text style={[styles.desc, { color: theme.colors.textSecondary }]}>
          {message ?? defaultDesc}
        </Text>
      ) : null}
      {onRetry ? (
        <Button title={t.common.retry} onPress={onRetry} style={styles.btn} />
      ) : null}
      {onAction && actionLabel ? (
        <Button title={actionLabel} onPress={onAction} variant="secondary" style={styles.btn} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  desc: {
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 320,
  },
  btn: {
    marginTop: 8,
    minWidth: 160,
  },
});

