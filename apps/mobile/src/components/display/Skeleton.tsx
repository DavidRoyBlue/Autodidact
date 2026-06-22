import { View } from 'react-native';
import { cn } from '@/lib/utils';

export function SkeletonLine({ className }: { className?: string }) {
  return <View className={cn('h-4 w-full rounded-sm bg-muted opacity-50', className)} />;
}

export function SkeletonCard({ className }: { className?: string }) {
  return <View className={cn('h-20 w-full rounded-md bg-muted opacity-50', className)} />;
}
