import { styled, YStack } from 'tamagui';

const SkeletonBase = styled(YStack, {
  name: 'Skeleton',
  backgroundColor: '$surfaceHover',
  borderRadius: '$sm',
  opacity: 0.5,
});

export const SkeletonLine = styled(SkeletonBase, {
  name: 'SkeletonLine',
  width: '100%',
  height: 16,
});

export const SkeletonCard = styled(SkeletonBase, {
  name: 'SkeletonCard',
  width: '100%',
  height: 80,
  borderRadius: '$md',
});
