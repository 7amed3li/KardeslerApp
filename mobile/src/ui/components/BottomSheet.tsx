import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTheme } from '../themes/ThemeProvider';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  closeLabel?: string;
  children: React.ReactNode;
}

export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  closeLabel = 'Close',
  children,
}: BottomSheetProps) {
  const { colors, radii, spacing, typography, hitTarget } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={[styles.backdrop, { backgroundColor: colors.overlay }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surfaceElevated,
              borderTopLeftRadius: radii.xl,
              borderTopRightRadius: radii.xl,
              borderColor: colors.border,
              paddingBottom: Math.max(insets.bottom, spacing.md),
            },
          ]}
        >
          <View style={styles.handleWrap}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>
          {title ? (
            <View
              style={[
                styles.header,
                {
                  paddingHorizontal: spacing.md,
                  paddingBottom: spacing.sm,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[typography.titleMd, { color: colors.text }]}>{title}</Text>
                {subtitle ? (
                  <Text style={[typography.bodySm, { color: colors.textSecondary, marginTop: 2 }]}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={closeLabel}
                style={({ pressed }) => [
                  styles.closeBtn,
                  {
                    minWidth: hitTarget.min,
                    minHeight: hitTarget.min,
                    borderRadius: radii.full,
                    backgroundColor: pressed ? colors.surface : 'transparent',
                  },
                ]}
              >
                <X size={20} color={colors.text} />
              </Pressable>
            </View>
          ) : null}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: spacing.md,
              paddingTop: spacing.sm,
              paddingBottom: spacing.md,
            }}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    maxHeight: '88%',
    borderTopWidth: 1,
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    gap: 8,
  },
  closeBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

