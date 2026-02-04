import { create } from 'zustand';
import { Locale } from '@/lib/i18n';

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
}

// Default to Arabic as the main language
export const useLocaleStore = create<LocaleState>((set, get) => ({
  locale: 'ar',
  setLocale: (locale) => set({ locale }),
  toggleLocale: () => set({ locale: get().locale === 'en' ? 'ar' : 'en' }),
}));

