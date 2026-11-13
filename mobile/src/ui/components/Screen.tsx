import React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTheme } from '../themes/ThemeProvider';

export function Screen({
  children,
  edges = ['top', 'left', 'right'],
  style,
}: {
  children: React.ReactNode;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <SafeAreaView
      edges={edges}
      style={[styles.container, { backgroundColor: colors.background }, style]}
    >
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
