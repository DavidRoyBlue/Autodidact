import type { ReactNode } from 'react';
import { styled, XStack, Spinner } from 'tamagui';

const IconButtonFrame = styled(XStack, {
  name: 'IconButton',
  width: '$lg',
  height: '$lg',
  borderRadius: '$xl',
  alignItems: 'center',
  justifyContent: 'center',
  pressStyle: { opacity: 0.75 },

  variants: {
    variant: {
      primary: { backgroundColor: '$primary' },
      ghost:   { backgroundColor: 'transparent', borderWidth: 1, borderColor: '$border' },
    },
    disabled: {
      true: { opacity: 0.4 },
    },
  } as const,

  defaultVariants: {
    variant: 'primary',
  },
});

type IconButtonProps = {
  icon: ReactNode;
  variant?: 'primary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  onPress?: () => void;
};

export function IconButton({
  icon,
  variant = 'primary',
  loading = false,
  disabled = false,
  onPress,
}: IconButtonProps) {
  return (
    <IconButtonFrame
      variant={variant}
      disabled={disabled || loading}
      onPress={disabled || loading ? undefined : onPress}
    >
      {loading ? <Spinner size="small" color="$text" /> : icon}
    </IconButtonFrame>
  );
}
