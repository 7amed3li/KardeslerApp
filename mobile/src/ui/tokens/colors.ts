export interface ColorPalette {
  background: string;
  surface: string;
  surfaceElevated: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  primaryText: string;
  accent: string;
  accentSoft: string;
  success: string;
  successSoft: string;
  error: string;
  errorSoft: string;
  warning: string;
  warningSoft: string;
  overlay: string;
}

export const colors: Record<'light' | 'dark', ColorPalette> = {
  light: {
    background: '#EDE3CE',
    surface: '#F7F2E7',
    surfaceElevated: '#FFFFFF',
    text: '#2B2620',
    textSecondary: '#635B4E',
    textMuted: '#756C5E',
    border: '#DDD1BA',
    primary: '#7E2726',
    primaryPressed: '#621D1C',
    primarySoft: '#F5E6E5',
    primaryText: '#FFFFFF',
    accent: '#9C7A3F',
    accentSoft: '#F5EFE0',
    success: '#3D5A3C',
    successSoft: '#E6EFE5',
    error: '#B3261E',
    errorSoft: '#F9E4E2',
    warning: '#9C7A3F',
    warningSoft: '#F5EFE0',
    overlay: 'rgba(43, 38, 32, 0.45)',
  },
  dark: {
    background: '#171411',
    surface: '#221E1A',
    surfaceElevated: '#2C2722',
    text: '#F5EFE4',
    textSecondary: '#C4BAA8',
    textMuted: '#9A9080',
    border: '#3B342C',
    primary: '#B8423F',
    primaryPressed: '#983230',
    primarySoft: '#3A2020',
    primaryText: '#FFFFFF',
    accent: '#D4AC63',
    accentSoft: '#332B1D',
    success: '#6E9C6B',
    successSoft: '#1F301E',
    error: '#E0665E',
    errorSoft: '#3D1F1D',
    warning: '#D4AC63',
    warningSoft: '#332B1D',
    overlay: 'rgba(0, 0, 0, 0.65)',
  },
};
