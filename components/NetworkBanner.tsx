import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useSyncStore } from '@/stores/sync';
import { connectivity } from '@/lib/connectivity';
import { router } from 'expo-router';

export default function NetworkBanner() {
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { pendingMutations, isSyncing, syncErrors } = useSyncStore();
  const [isOffline, setIsOffline] = useState(!connectivity.isOnline());
  const [wasOffline, setWasOffline] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);
  const opacity = useRef(new Animated.Value(connectivity.isOnline() ? 0 : 1)).current;
  const reconnectedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = connectivity.onStatusChange((online) => {
      if (!online) {
        setIsOffline(true);
        setWasOffline(true);
        setShowReconnected(false);
        if (reconnectedTimer.current) clearTimeout(reconnectedTimer.current);
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      } else if (wasOffline) {
        setIsOffline(false);
        setShowReconnected(true);
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.delay(3000),
          Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start(() => {
          setShowReconnected(false);
          setWasOffline(false);
        });
      }
    });
    return () => {
      unsub();
      if (reconnectedTimer.current) clearTimeout(reconnectedTimer.current);
    };
  }, [wasOffline]);

  const isRtl = locale === 'ar';
  const isAr = locale === 'ar';

  const getMessage = () => {
    if (!isOffline && showReconnected) {
      if (isSyncing) {
        return isAr ? 'جاري المزامنة...' : 'Syncing...';
      }
      if (syncErrors.length > 0) {
        return isAr
          ? `فشل مزامنة ${syncErrors.length} عملية`
          : `${syncErrors.length} sync error${syncErrors.length > 1 ? 's' : ''}`;
      }
      return isAr ? 'تم استعادة الاتصال' : 'Connection restored';
    }

    if (isOffline) {
      if (pendingMutations > 0) {
        return isAr
          ? `لا يوجد اتصال — ${pendingMutations} عملية معلقة`
          : `Offline — ${pendingMutations} pending change${pendingMutations > 1 ? 's' : ''}`;
      }
      return isAr ? 'لا يوجد اتصال بالإنترنت' : 'No internet connection';
    }

    return '';
  };

  const getBgColor = () => {
    if (!isOffline && showReconnected) {
      if (syncErrors.length > 0) return '#f59e0b';
      return '#10b981';
    }
    return '#ef4444';
  };

  const getIcon = () => {
    if (!isOffline && showReconnected) {
      if (isSyncing) return 'sync-outline';
      if (syncErrors.length > 0) return 'warning-outline';
      return 'checkmark-circle-outline';
    }
    return 'wifi-outline';
  };

  const shouldShow = isOffline || showReconnected;
  if (!shouldShow) return null;

  const isTappable = syncErrors.length > 0 || (isOffline && pendingMutations > 0);

  return (
    <Animated.View style={[styles.banner, { backgroundColor: getBgColor(), opacity }]}>
      <TouchableOpacity
        disabled={!isTappable}
        onPress={() => router.push('/(drawer)/sync-status' as any)}
        activeOpacity={0.8}
      >
        <View style={[styles.inner, isRtl && styles.innerRtl]}>
          <Ionicons name={getIcon() as any} size={16} color="#fff" />
          <Text style={styles.text}>{getMessage()}</Text>
          {isTappable && (
            <Ionicons
              name={isRtl ? 'chevron-back' : 'chevron-forward'}
              size={14}
              color="#fff"
              style={styles.chevron}
            />
          )}
        </View>
      </TouchableOpacity>
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
    flexShrink: 1,
  },
  chevron: {
    marginStart: 4,
  },
});
