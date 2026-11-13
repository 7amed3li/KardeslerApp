import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  AlertTriangle,
  Clock,
  Inbox,
  PauseCircle,
  RefreshCw,
  ShieldAlert,
  WifiOff,
} from 'lucide-react-native';
import { useTheme } from '../themes/ThemeProvider';
import { Button } from './Button';
import { MenuCardSkeleton } from './Skeleton';

export type StateKind =
  | 'loading'
  | 'empty'
  | 'error'
  | 'offline'
  | 'closed'
  | 'paused'
  | 'update';

export function StateView({
  kind,
  title = '',
  message,
  actionLabel,
  onAction,
  onRetry,
}: {
  kind: StateKind;
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  onRetry?: () => void;
}) {
  const { colors, spacing, typography, radii } = useTheme();
  const resolvedAction = onAction ?? onRetry;

  if (kind === 'loading') {
    return (
      <View style={[styles.skeletonWrap, { padding: spacing.md, gap: spacing.sm }]}>
        <MenuCardSkeleton />
        <MenuCardSkeleton />
        <MenuCardSkeleton />
        <Text style={[typography.caption, { color: colors.textMuted, textAlign: 'center' }]}>
          {title}
        </Text>
      </View>
    );
  }

  const iconColor =
    kind === 'error' || kind === 'offline' || kind === 'closed'
      ? colors.error
      : kind === 'paused' || kind === 'update'
        ? colors.accent
        : colors.primary;

  const iconBg =
    kind === 'error' || kind === 'offline' || kind === 'closed'
      ? colors.errorSoft
      : kind === 'paused' || kind === 'update'
        ? colors.accentSoft
        : colors.primarySoft;

  const Icon =
    kind === 'offline'
      ? WifiOff
      : kind === 'closed'
        ? Clock
        : kind === 'paused'
          ? PauseCircle
          : kind === 'update'
            ? ShieldAlert
            : kind === 'error'
              ? AlertTriangle
              : Inbox;

  return (
    <View style={[styles.center, { padding: spacing.lg, gap: spacing.sm }]}>
      <View
        style={[
          styles.iconCircle,
          {
            backgroundColor: iconBg,
            borderRadius: radii.full,
          },
        ]}
      >
        <Icon size={26} color={iconColor} />
      </View>
      <Text style={[typography.titleSm, { color: colors.text, textAlign: 'center' }]}>
        {title}
      </Text>
      {message ? (
        <Text
          style={[
            typography.bodySm,
            { color: colors.textSecondary, textAlign: 'center', maxWidth: 320 },
          ]}
        >
          {message}
        </Text>
      ) : null}
      {resolvedAction ? (
        <Button
          label={actionLabel ?? 'Tekrar Dene'}
          onPress={resolvedAction}
          variant="primary"
          size="sm"
          icon={kind === 'error' || kind === 'offline' ? <RefreshCw size={15} color={colors.primaryText} /> : undefined}
          style={{ marginTop: spacing.xs }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonWrap: {
    flex: 1,
  },
  iconCircle: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
