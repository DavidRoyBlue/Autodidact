import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

const headingVariants = cva('font-bold text-foreground', {
  variants: {
    size: {
      h1: 'text-h1',
      h2: 'text-h2',
    },
  },
  defaultVariants: { size: 'h1' },
});

type HeadingProps = React.ComponentPropsWithoutRef<typeof Text> &
  VariantProps<typeof headingVariants>;

export function Heading({ size, className, ...props }: HeadingProps) {
  return <Text className={cn(headingVariants({ size }), className)} {...props} />;
}
