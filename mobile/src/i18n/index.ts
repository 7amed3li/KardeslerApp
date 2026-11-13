import type { SupportedLanguage } from '@kardesler/shared';
import { I18nManager } from 'react-native';
import { create } from 'zustand';
import ar from './ar.json';
import en from './en.json';
import tr from './tr.json';

const dictionaries = { tr, en, ar } as const;

export type TranslationDict = typeof tr;

interface LanguageState {
  language: SupportedLanguage;
  isRTL: boolean;
  setLanguage: (lang: SupportedLanguage) => boolean;
}

export const useLanguageStore = create<LanguageState>((set, get) => ({
  language: 'tr',
  isRTL: false,
  setLanguage: (lang) => {
    const prevRtl = get().isRTL;
    const nextRtl = lang === 'ar';
    if (I18nManager.isRTL !== nextRtl) {
      I18nManager.allowRTL(nextRtl);
      I18nManager.forceRTL(nextRtl);
    }
    set({ language: lang, isRTL: nextRtl });
    return prevRtl !== nextRtl;
  },
}));

export function getDictionary(lang: SupportedLanguage): TranslationDict {
  return dictionaries[lang] ?? dictionaries.tr;
}

export function useTranslations() {
  const language = useLanguageStore((s) => s.language);
  const isRTL = useLanguageStore((s) => s.isRTL);
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  return {
    language,
    isRTL,
    setLanguage,
    t: getDictionary(language),
  };
}

/**
 * Turkish-safe casing utilities so 'i' -> 'İ' and 'I' -> 'ı' correctly.
 */
export function toTurkishUpperCase(input: string): string {
  return input.toLocaleUpperCase('tr-TR');
}

export function toTurkishLowerCase(input: string): string {
  return input.toLocaleLowerCase('tr-TR');
}

