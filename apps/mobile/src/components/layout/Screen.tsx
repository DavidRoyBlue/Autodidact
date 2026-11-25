import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { cn } from '@/lib/utils';
import { useThemeColors } from '@/lib/theme-colors';

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  padding?: boolean;
  /** Tab screens draw under the status bar (top); stack screens sit under a header (bottom). */
  edges?: Edge[];
  onRefresh?: () => void;
  refreshing?: boolean;
};

export function Screen({
  children,
  scroll = false,
  padding = true,
  edges = ['top'],
  onRefresh,
  refreshing = false,
}: ScreenProps) {
  const { primary, background } = useThemeColors();
  const inner = <View className={cn('flex-1 bg-background', padding && 'p-4')}>{children}</View>;
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: background }}>
      {scroll ? (
        <ScrollView
          className="bg-background"
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh && <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} colors={[primary]} />
          }
        >
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}
