import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';

export type ThemeMode = 'light' | 'dark';

// Light theme colors
export const lightTheme = {
  // Backgrounds
  background: '#ffffff',
  backgroundSecondary: '#f8f9fa',
  backgroundTertiary: '#f1f3f5',
  surface: '#ffffff',
  surfaceSecondary: '#f8f9fa',
  
  // Text
  text: '#1a1a2e',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  textInverse: '#ffffff',
  
  // Primary colors
  primary: '#6366f1',
  primaryLight: '#818cf8',
  primaryDark: '#4f46e5',
  primaryBackground: '#eef2ff',
  
  // Status colors
  success: '#10b981',
  successBackground: '#d1fae5',
  warning: '#f59e0b',
  warningBackground: '#fef3c7',
  error: '#ef4444',
  errorBackground: '#fee2e2',
  info: '#3b82f6',
  infoBackground: '#dbeafe',
  
  // Borders
  border: '#e5e7eb',
  borderLight: '#f3f4f6',
  
  // Cards
  card: '#ffffff',
  cardBorder: '#e5e7eb',
  
  // Header
  header: '#ffffff',
  headerText: '#1a1a2e',
  headerBorder: '#e5e7eb',
  
  // Drawer
  drawer: '#ffffff',
  drawerHeader: '#f8f9fa',
  drawerBorder: '#e5e7eb',
  drawerActive: '#eef2ff',
  drawerActiveText: '#6366f1',
  drawerInactiveText: '#6b7280',
  
  // Input
  input: '#ffffff',
  inputBorder: '#d1d5db',
  inputFocus: '#6366f1',
  inputPlaceholder: '#9ca3af',
  
  // Shadow
  shadow: 'rgba(0, 0, 0, 0.1)',
};

// Dark theme colors
export const darkTheme = {
  // Backgrounds
  background: '#0f0f1a',
  backgroundSecondary: '#1a1a2e',
  backgroundTertiary: '#2a2a3e',
  surface: '#1a1a2e',
  surfaceSecondary: '#2a2a3e',
  
  // Text
  text: '#ffffff',
  textSecondary: '#a1a1aa',
  textMuted: '#71717a',
  textInverse: '#1a1a2e',
  
  // Primary colors
  primary: '#6366f1',
  primaryLight: '#818cf8',
  primaryDark: '#4f46e5',
  primaryBackground: '#6366f120',
  
  // Status colors
  success: '#10b981',
  successBackground: '#10b98120',
  warning: '#f59e0b',
  warningBackground: '#f59e0b20',
  error: '#ef4444',
  errorBackground: '#ef444420',
  info: '#3b82f6',
  infoBackground: '#3b82f620',
  
  // Borders
  border: '#2a2a3e',
  borderLight: '#3a3a4e',
  
  // Cards
  card: '#1a1a2e',
  cardBorder: '#2a2a3e',
  
  // Header
  header: '#1a1a2e',
  headerText: '#ffffff',
  headerBorder: '#2a2a3e',
  
  // Drawer
  drawer: '#1a1a2e',
  drawerHeader: '#0f0f1a',
  drawerBorder: '#2a2a3e',
  drawerActive: '#6366f115',
  drawerActiveText: '#6366f1',
  drawerInactiveText: '#8b8ba7',
  
  // Input
  input: '#2a2a3e',
  inputBorder: '#3a3a4e',
  inputFocus: '#6366f1',
  inputPlaceholder: '#71717a',
  
  // Shadow
  shadow: 'rgba(0, 0, 0, 0.3)',
};

export type Theme = typeof lightTheme;

interface ThemeState {
  mode: ThemeMode;
  theme: Theme;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

// Custom storage adapter for SecureStore
const secureStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(name);
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(name, value);
    } catch {
      // Ignore errors
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch {
      // Ignore errors
    }
  },
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'light', // Default to light mode
      theme: lightTheme,
      
      setMode: (mode: ThemeMode) => {
        set({
          mode,
          theme: mode === 'light' ? lightTheme : darkTheme,
        });
      },
      
      toggleMode: () => {
        set((state) => ({
          mode: state.mode === 'light' ? 'dark' : 'light',
          theme: state.mode === 'light' ? darkTheme : lightTheme,
        }));
      },
    }),
    {
      name: 'theme-storage',
      storage: createJSONStorage(() => secureStorage),
    }
  )
);

