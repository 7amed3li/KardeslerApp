import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../themes/ThemeProvider';

export function SkeletonBox({
  width = '100%',
  height = 16,
  borderRadius,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radii, reducedMotion } = useTheme();
  const opacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    if (reducedMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reducedMotion]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: borderRadius ?? radii.sm,
          backgroundColor: colors.border,
          opacity,
        },
        style,
      ]}
    />
  );
}

export function MenuCardSkeleton() {
  const { colors, radii, spacing } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
          borderRadius: radii.md,
          padding: spacing.sm,
          gap: spacing.sm,
        },
      ]}
    >
      <SkeletonBox width={88} height={88} borderRadius={radii.sm} />
      <View style={{ flex: 1, gap: spacing.xs }}>
        <SkeletonBox width="70%" height={18} />
        <SkeletonBox width="95%" height={14} />
        <SkeletonBox width="45%" height={16} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
});

