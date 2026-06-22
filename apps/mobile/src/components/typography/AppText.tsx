import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

const textVariants = cva('', {
  variants: {
    variant: {
      body: 'text-md text-foreground',
      muted: 'text-md text-muted-foreground',
      caption: 'text-sm text-muted-foreground',
      label: 'text-xs font-semibold uppercase text-muted-foreground',
      error: 'text-sm text-destructive',
    },
    size: {
      xs: 'text-xs',
      sm: 'text-sm',
      md: 'text-md',
      lg: 'text-lg',
      xl: 'text-xl',
    },
    weight: {
      regular: 'font-normal',
      semibold: 'font-semibold',
      bold: 'font-bold',
    },
  },
  defaultVariants: { variant: 'body' },
});

type AppTextProps = React.ComponentPropsWithoutRef<typeof Text> &
  VariantProps<typeof textVariants>;

export function AppText({ variant, size, weight, className, ...props }: AppTextProps) {
  return <Text className={cn(textVariants({ variant, size, weight }), className)} {...props} />;
}
