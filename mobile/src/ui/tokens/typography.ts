import { Platform } from 'react-native';

export const fontFamilies = {
  latin: Platform.select({
    web: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    default: undefined,
  }),
  arabic: Platform.select({
    web: '"IBM Plex Sans Arabic", "Noto Sans Arabic", Tahoma, Arial, sans-serif',
    default: undefined,
  }),
};

export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700' as const },
  titleLg: { fontSize: 24, lineHeight: 30, fontWeight: '700' as const },
  titleMd: { fontSize: 20, lineHeight: 26, fontWeight: '700' as const },
  titleSm: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
  body: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  bodySm: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
} as const;
