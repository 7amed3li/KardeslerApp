import React, { createContext, useContext, useEffect, useState } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';
import { colors, hitTarget, radii, spacing, typography } from '../tokens';
import type { ColorPalette } from '../tokens/colors';

export type ColorMode = 'light' | 'dark';

export interface Theme {
  mode: ColorMode;
  colors: ColorPalette;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
  hitTarget: typeof hitTarget;
  reducedMotion: boolean;
}

const lightTheme: Theme = {
  mode: 'light',
  colors: colors.light,
  spacing,
  radii,
  typography,
  hitTarget,
  reducedMotion: false,
};

const darkTheme: Theme = {
  mode: 'dark',
  colors: colors.dark,
  spacing,
  radii,
  typography,
  hitTarget,
  reducedMotion: false,
};

const ThemeContext = createContext<Theme>(lightTheme);

export function ThemeProvider({
  children,
  forcedMode,
}: {
  children: React.ReactNode;
  forcedMode?: ColorMode;
}) {
  const systemScheme = useColorScheme();
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReducedMotion(enabled);
      })
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (enabled) => {
      setReducedMotion(enabled);
    });
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  const mode: ColorMode = forcedMode ?? (systemScheme === 'dark' ? 'dark' : 'light');
  const base = mode === 'dark' ? darkTheme : lightTheme;
  const value: Theme = { ...base, reducedMotion };
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
