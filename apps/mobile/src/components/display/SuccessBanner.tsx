import type { ReactNode } from 'react';
import { View } from 'react-native';
import { AppText } from '../typography/AppText';
import { Icon, type IconName } from './Icon';

/** A finished thing — a module, a course — with an optional next step below it. */
export function SuccessBanner({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <View className="gap-3 rounded-lg border border-success bg-success/15 p-4">
      <View className="flex-row items-center gap-3">
        <Icon name={icon} color="success" />
        <AppText weight="semibold" className="flex-1 text-success">{title}</AppText>
      </View>
      {children}
    </View>
  );
}
