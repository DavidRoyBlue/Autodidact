import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { cn } from '@/lib/utils';

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  padding?: boolean;
};

export function Screen({ children, scroll = false, padding = true }: ScreenProps) {
  const inner = <View className={cn('flex-1 bg-background', padding && 'p-4')}>{children}</View>;

  if (scroll) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView className="bg-background" contentContainerStyle={{ flexGrow: 1 }}>
          {inner}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return <SafeAreaView style={{ flex: 1 }}>{inner}</SafeAreaView>;
}
