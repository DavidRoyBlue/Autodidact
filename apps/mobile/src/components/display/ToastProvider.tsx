import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToastStore } from '../../stores/toast.store';
import { Toast } from './Toast';

function AnimatedToast({ children }: { children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateY]);
  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
}

export function ToastProvider() {
  const toasts = useToastStore((s) => s.toasts);
  const insets = useSafeAreaInsets();

  return (
    <Animated.View
      pointerEvents="none"
      className="absolute left-4 right-4 z-50 gap-2"
      style={{ top: insets.top + 8 }}
    >
      {toasts.map((toast) => (
        <AnimatedToast key={toast.id}>
          <Toast {...toast} />
        </AnimatedToast>
      ))}
    </Animated.View>
  );
}
