import { View } from 'react-native';
import type { ComponentPropsWithoutRef } from 'react';
import { Input as UIInput } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { AppText } from '../typography/AppText';

type InputProps = ComponentPropsWithoutRef<typeof UIInput> & {
  label?: string;
  error?: string;
  helper?: string;
};

export function Input({ label, error, helper, className, ...props }: InputProps) {
  return (
    <View className="gap-1">
      {label && <AppText variant="label">{label}</AppText>}
      <UIInput className={cn(error && 'border-destructive', className)} {...props} />
      {error ? (
        <AppText variant="error">{error}</AppText>
      ) : helper ? (
        <AppText variant="caption">{helper}</AppText>
      ) : null}
    </View>
  );
}
