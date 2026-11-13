import React, { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';
import { colors, radii, spacing, typography } from '../tokens';

export type ColorMode = 'light' | 'dark';

export interface Theme {
  mode: ColorMode;
  colors: (typeof colors)[ColorMode];
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
}

const lightTheme: Theme = {
  mode: 'light',
  colors: colors.light,
  spacing,
  radii,
  typography,
};

const darkTheme: Theme = {
  mode: 'dark',
  colors: colors.dark,
  spacing,
  radii,
  typography,
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
  const mode: ColorMode = forcedMode ?? (systemScheme === 'dark' ? 'dark' : 'light');
  const value = mode === 'dark' ? darkTheme : lightTheme;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

