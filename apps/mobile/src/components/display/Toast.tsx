import { useEffect } from 'react';
import { XStack } from 'tamagui';
import { AppText } from '../typography/AppText';
import { useToastStore, type ToastVariant } from '../../stores/toast.store';

const bgMap: Record<ToastVariant, string> = {
  success: '$successSubtle',
  error:   '$dangerSubtle',
  info:    '$surface',
};

const textColorMap: Record<ToastVariant, string> = {
  success: '$success',
  error:   '$danger',
  info:    '$text',
};

type ToastProps = {
  id: string;
  message: string;
  variant: ToastVariant;
};

export function Toast({ id, message, variant }: ToastProps) {
  const removeToast = useToastStore((s) => s.removeToast);

  useEffect(() => {
    const timer = setTimeout(() => removeToast(id), 3000);
    return () => clearTimeout(timer);
  }, [id, removeToast]);

  return (
    <XStack
      // @ts-expect-error Tamagui 2.0-rc: configured animation keys ('fast') aren't surfaced on intrinsic View prop types
      animation="fast"
      enterStyle={{ opacity: 0, y: -12 }}
      exitStyle={{ opacity: 0, y: -12 }}
      backgroundColor={bgMap[variant]}
      borderRadius="$md"
      paddingHorizontal="$4"
      paddingVertical="$3"
      borderWidth={1}
      borderColor={variant === 'success' ? '$success' : variant === 'error' ? '$danger' : '$border'}
      alignItems="center"
      gap="$2"
    >
      <AppText color={textColorMap[variant]} weight="semibold" flex={1}>
        {message}
      </AppText>
    </XStack>
  );
}
