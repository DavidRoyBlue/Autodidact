import { AnimatePresence, YStack } from 'tamagui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToastStore } from '../../stores/toast.store';
import { Toast } from './Toast';

export function ToastProvider() {
  const toasts = useToastStore((s) => s.toasts);
  const insets = useSafeAreaInsets();

  return (
    <YStack
      position="absolute"
      top={insets.top + 8}
      left="$4"
      right="$4"
      zIndex="$lg"
      gap="$2"
      pointerEvents="none"
    >
      <AnimatePresence>
        {toasts.map((toast) => (
          <Toast key={toast.id} {...toast} />
        ))}
      </AnimatePresence>
    </YStack>
  );
}
