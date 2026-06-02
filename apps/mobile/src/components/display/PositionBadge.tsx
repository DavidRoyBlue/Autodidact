import { XStack } from 'tamagui';
import { AppText } from '../typography/AppText';

type PositionBadgeProps = {
  position: number;
  completed: boolean;
};

export function PositionBadge({ position, completed }: PositionBadgeProps) {
  return (
    <XStack
      width="$md"
      height="$md"
      borderRadius="$xl"
      backgroundColor={completed ? '$success' : '$surfaceHover'}
      alignItems="center"
      justifyContent="center"
    >
      <AppText variant="body" weight="bold" size="sm">
        {completed ? '✓' : String(position)}
      </AppText>
    </XStack>
  );
}
