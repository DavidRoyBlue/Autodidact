import { useEffect } from 'react';
import { View } from 'react-native';
import { AppText } from '../typography/AppText';
import { useToastStore, type ToastVariant } from '../../stores/toast.store';

const frameClass: Record<ToastVariant, string> = {
  success: 'bg-success/[0.15] border-success',
  error: 'bg-destructive/[0.15] border-destructive',
  info: 'bg-card border-border',
};

const textClass: Record<ToastVariant, string> = {
  success: 'text-success',
  error: 'text-destructive',
  info: 'text-foreground',
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
    <View className={`flex-row items-center gap-2 rounded-md border px-4 py-3 ${frameClass[variant]}`}>
      <AppText weight="semibold" className={`flex-1 ${textClass[variant]}`}>
        {message}
      </AppText>
    </View>
  );
}
