import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface GoogleSignInButtonProps {
  title: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}

function GoogleGLogo() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" aria-hidden={true}>
      <Path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3.01h3.88c2.27-2.09 3.54-5.17 3.54-8.88Z"
      />
      <Path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.88-3.01c-1.07.72-2.44 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.96H1.27v3.11A12 12 0 0 0 12 24Z"
      />
      <Path
        fill="#FBBC05"
        d="M5.28 14.27A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.27V6.62H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.38l4.01-3.11Z"
      />
      <Path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.62l4.01 3.11c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </Svg>
  );
}

export function GoogleSignInButton({
  title,
  loading = false,
  disabled = false,
  onPress,
  testID = 'google-signin-btn',
}: GoogleSignInButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color="#1F1F1F" />
        ) : (
          <GoogleGLogo />
        )}
        <Text style={styles.label}>{title}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D5CFC4',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pressed: {
    backgroundColor: '#F6F3EE',
  },
  disabled: {
    opacity: 0.65,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F1F1F',
  },
});

