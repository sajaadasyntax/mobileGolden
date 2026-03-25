import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';

export default function NetworkBanner() {
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const [isOffline, setIsOffline] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);
  const opacity = new Animated.Value(0);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = !(state.isConnected && state.isInternetReachable !== false);
      if (offline) {
        setIsOffline(true);
        setWasOffline(true);
        setShowReconnected(false);
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      } else if (wasOffline) {
        setIsOffline(false);
        setShowReconnected(true);
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.delay(2000),
          Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start(() => {
          setShowReconnected(false);
          setWasOffline(false);
        });
      }
    });
    return () => unsubscribe();
  }, [wasOffline]);

  if (!isOffline && !showReconnected) return null;

  const isRtl = locale === 'ar';
  const message = isOffline
    ? locale === 'ar'
      ? 'لا يوجد اتصال بالإنترنت'
      : 'No internet connection'
    : locale === 'ar'
    ? 'تم استعادة الاتصال'
    : 'Connection restored';

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          backgroundColor: isOffline ? '#ef4444' : '#10b981',
          opacity,
        },
      ]}
    >
      <View style={[styles.inner, isRtl && styles.innerRtl]}>
        <Ionicons
          name={isOffline ? 'wifi-outline' : 'checkmark-circle-outline'}
          size={16}
          color="#fff"
        />
        <Text style={styles.text}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    zIndex: 9999,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
  },
  innerRtl: {
    flexDirection: 'row-reverse',
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
