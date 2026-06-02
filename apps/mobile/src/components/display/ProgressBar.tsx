import { YStack, XStack } from 'tamagui';
import { AppText } from '../typography/AppText';

type ProgressBarProps = {
  value: number;  // 0–1
  label?: string;
};

export function ProgressBar({ value, label }: ProgressBarProps) {
  const pct = `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;

  return (
    <YStack gap="$1">
      <XStack height={6} backgroundColor="$surfaceHover" borderRadius="$full" overflow="hidden">
        <XStack
          height={6}
          width={pct}
          backgroundColor="$primary"
          borderRadius="$full"
          // @ts-expect-error Tamagui 2.0-rc: configured animation keys ('medium') aren't surfaced on intrinsic View prop types
          animation="medium"
        />
      </XStack>
      {label && <AppText variant="caption">{label}</AppText>}
    </YStack>
  );
}
