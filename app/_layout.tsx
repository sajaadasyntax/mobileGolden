import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { I18nManager, View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useLocaleStore } from '@/stores/locale';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

export default function RootLayout() {
  const { locale } = useLocaleStore();
  const { checkAuth, isLoading } = useAuthStore();
  const { theme, mode } = useThemeStore();

  useEffect(() => {
    // Force RTL for Arabic (default language)
    const isRtl = locale === 'ar';
    if (I18nManager.isRTL !== isRtl) {
      I18nManager.allowRTL(isRtl);
      I18nManager.forceRTL(isRtl);
    }
  }, [locale]);

  useEffect(() => {
    // Force RTL on app start since Arabic is default
    if (!I18nManager.isRTL) {
      I18nManager.allowRTL(true);
      I18nManager.forceRTL(true);
    }
  }, []);

  useEffect(() => {
    async function prepare() {
      try {
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((resolve) => 
          setTimeout(() => resolve(null), 5000)
        );
        
        await Promise.race([
          checkAuth(),
          timeoutPromise,
        ]);
      } catch (error) {
        console.error('Error during app initialization:', error);
      } finally {
        // Always hide splash screen, even if there's an error
        try {
          await SplashScreen.hideAsync();
        } catch (error) {
          console.error('Error hiding splash screen:', error);
        }
      }
    }
    prepare();
  }, []);

  if (isLoading) {
    return <View style={{ flex: 1, backgroundColor: theme.background }} />;
  }

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <QueryClientProvider client={queryClient}>
          <StatusBar style={mode === 'light' ? 'dark' : 'light'} />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: theme.header },
              headerTintColor: theme.headerText,
              headerTitleStyle: { fontWeight: '600' },
              contentStyle: { backgroundColor: theme.background },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
          </Stack>
        </QueryClientProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
